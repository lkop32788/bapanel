// 云仓中转管理（yuncang-proxy）：th333 筛号 API 的透明缓存代理（独立服务，不依赖面板代码）。
//
// 对外暴露与 th333 相同的接口：
//   POST /api/task/create    GET /api/task/progress    GET /api/task/result    GET /api/user/balance
// 面板只需把「接口地址」指到本服务。提交任务时先查本地 SQLite 缓存（按类型设有效期），
// 命中的直接出结果，只把未命中的转发给上游；上游结果回来后写入缓存，长期积累省积分。
// 未知任务类型 / 未知任务编号一律原样透传，保证完全兼容。
//
// 环境变量：SAVER_PROXY_PORT(默认5090) SAVER_UPSTREAM(默认 https://api.th333.cc) SAVER_DATA_DIR(默认 ./data)
package main

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// ---------- 任务类型目录：缓存命名空间 / 输入类型 / 缓存有效期 ----------

type typeDef struct {
	kind  string        // 缓存命名空间（wsValid 和 wsSimpleValid 共享）
	input string        // phone | email | username
	ttl   time.Duration // 0 = 不缓存，直接透传
}

func d(kind, input string, hours int) typeDef {
	return typeDef{kind, input, time.Duration(hours) * time.Hour}
}

const (
	hOpen   = 720  // 筛开通类：30 天
	hGender = 2160 // 性别年龄类：90 天
	hActive = 48   // 筛活跃类：2 天
	hName   = 168  // 用户名类：7 天
)

var taskTypes = map[string]typeDef{
	// WhatsApp / Telegram
	"wsValid": d("wsOpen", "phone", hOpen), "wsSimpleValid": d("wsOpen", "phone", hOpen),
	"wsActive": d("wsActive", "phone", hActive), "wsGender": d("wsGender", "phone", hGender),
	"tgValid": d("tgOpen", "phone", hOpen), "tgActive": d("tgActive", "phone", hActive),
	"tgGender": d("tgGender", "phone", hGender), "tgNameValid": d("tgName", "username", hName),
	// 社交媒体
	"fbValid": d("fbValid", "phone", hOpen), "fbGender": d("fbGender", "phone", hGender),
	"fbUid": d("fbUid", "phone", hOpen), "fbEmail": d("fbEmail", "email", hOpen),
	"insValid": d("insValid", "phone", hOpen), "insEmail": d("insEmail", "email", hOpen),
	"twitterValid": d("twitterValid", "phone", hOpen), "twitterEmail": d("twitterEmail", "email", hOpen),
	"snapchatValid": d("snapchatValid", "phone", hOpen),
	"linkedinValid": d("linkedinValid", "phone", hOpen), "linkedinGender": d("linkedinGender", "phone", hGender),
	"tiktokUser": d("tiktokUser", "username", hName),
	// 通讯工具
	"lineValid": d("lineValid", "phone", hOpen), "lineGender": d("lineGender", "phone", hGender),
	"signalValid": d("signalValid", "phone", hOpen),
	"viberValid":  d("viberValid", "phone", hOpen), "viberGender": d("viberGender", "phone", hGender),
	"viberActive": d("viberActive", "phone", hActive),
	"botimValid":  d("botimValid", "phone", hOpen), "botimGender": d("botimGender", "phone", hGender),
	"zaloValid":   d("zaloValid", "phone", hOpen), "zaloGender": d("zaloGender", "phone", hGender),
	"zaloGenderQuick": d("zaloGender", "phone", hGender), "zaloActive": d("zaloActive", "phone", hActive),
	"wxValid": d("wxValid", "phone", hOpen), "wxAll": d("wxAll", "phone", hOpen),
	"rcsSystem": d("rcsSystem", "phone", hOpen),
	// 号码检测（开关机状态是实时性质，不缓存）
	"phoneCheck": d("phoneCheck", "phone", hOpen), "phoneActive": d("phoneActive", "phone", hActive),
	"operatorStandard": d("operatorStandard", "phone", hOpen), "numberStatus": d("numberStatus", "phone", hOpen),
	"phoneRoaming": d("phoneRoaming", "phone", 0), "phoneUsCarrier": d("phoneUsCarrier", "phone", hOpen),
	"phoneDnd":    d("phoneDnd", "phone", hOpen),
	"iosBlueValid": d("iosBlueValid", "phone", hOpen), "iosValid": d("iosValid", "phone", hOpen),
	"iosAll": d("iosAll", "phone", hOpen),
	// 邮箱 / 其他服务 / 交易所
	"amazonEmail": d("amazonEmail", "email", hOpen), "amazonValid": d("amazonValid", "phone", hOpen),
	"teamsValid": d("teamsValid", "phone", hOpen), "sidelineValid": d("sidelineValid", "phone", hOpen),
	"dhlValid":     d("dhlValid", "phone", hOpen),
	"binanceValid": d("binanceValid", "phone", hOpen), "okxValid": d("okxValid", "phone", hOpen),
	"htxValid": d("htxValid", "phone", hOpen), "kucoinValid": d("kucoinValid", "phone", hOpen),
	"coinwValid": d("coinwValid", "phone", hOpen), "mexcValid": d("mexcValid", "phone", hOpen),
}

// ---------- 全局 ----------

var (
	db        *sql.DB
	upstream  string
	dataDir   string
	adminPass string
	writeMu   sync.Mutex // SQLite 单写者
	client    = &http.Client{Timeout: 300 * time.Second}
)

const schema = `
CREATE TABLE IF NOT EXISTS cache (
  kind TEXT NOT NULL, value TEXT NOT NULL,
  valid INTEGER NOT NULL, extra TEXT NOT NULL DEFAULT '',
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (kind, value)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, upstream_id TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL, country TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL, cached_count INTEGER NOT NULL, cached_valid INTEGER NOT NULL,
  state TEXT NOT NULL, ingested INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_items (
  task_id TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL,
  valid INTEGER NOT NULL DEFAULT 0, extra TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_items ON task_items(task_id);
`

func main() {
	port := envOr("SAVER_PROXY_PORT", "5090")
	addr := envOr("SAVER_PROXY_ADDR", "127.0.0.1")
	adminPass = os.Getenv("SAVER_ADMIN_PASS") // 为空则 /admin 不开放
	upstream = strings.TrimRight(envOr("SAVER_UPSTREAM", "https://api.th333.cc"), "/")
	dataDir = envOr("SAVER_DATA_DIR", "./data")
	_ = os.MkdirAll(filepath.Join(dataDir, "results"), 0o755)

	var err error
	db, err = sql.Open("sqlite", "file:"+filepath.Join(dataDir, "cache.db")+
		"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		log.Fatal(err)
	}
	db.SetMaxOpenConns(4)
	if _, err := db.Exec(schema); err != nil {
		log.Fatal(err)
	}
	if _, err := db.Exec(storeSchema); err != nil {
		log.Fatal(err)
	}
	go gcLoop()
	go storeWorker()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/task/create", handleCreate)
	mux.HandleFunc("/api/task/progress", handleProgress)
	mux.HandleFunc("/api/task/result", handleResult)
	mux.HandleFunc("/api/user/balance", func(w http.ResponseWriter, r *http.Request) { passThrough(w, r) })
	mux.HandleFunc("/healthz", handleHealth)
	// 自带管理页（SAVER_ADMIN_PASS 未设置时关闭）
	mux.HandleFunc("/admin", requireAdmin(handleAdminPage))
	mux.HandleFunc("/admin/api/stats", requireAdmin(handleStats))
	mux.HandleFunc("/admin/api/clear", requireAdmin(handleClear))
	mux.HandleFunc("/admin/api/stores", requireAdmin(handleStores))
	mux.HandleFunc("/admin/api/stores/save", requireAdmin(handleStoreSave))
	mux.HandleFunc("/admin/api/stores/del", requireAdmin(handleStoreDel))
	mux.HandleFunc("/admin/api/stores/upload", requireAdmin(handleStoreUpload))
	mux.HandleFunc("/admin/api/stores/export", requireAdmin(handleStoreExport))
	mux.HandleFunc("/admin/api/settings", requireAdmin(handleSettings))
	mux.HandleFunc("/admin/api/balance", requireAdmin(handleAdminBalance))

	log.Printf("云仓中转管理 listening on %s:%s → %s (data: %s, admin: %v)", addr, port, upstream, dataDir, adminPass != "")
	log.Fatal(http.ListenAndServe(addr+":"+port, mux))
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// ---------- 工具 ----------

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(v)
}

func apiErr(w http.ResponseWriter, msg string) {
	writeJSON(w, map[string]any{"code": 1, "message": msg})
}

func genID() string {
	return "PX" + time.Now().Format("060102150405") + fmt.Sprintf("%03d", rand.Intn(1000))
}

func toInt(v any) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case json.Number:
		n, _ := x.Int64()
		return int(n)
	case string:
		n, _ := strconv.Atoi(x)
		return n
	}
	return 0
}

var phoneRe = regexp.MustCompile(`\d+`)

func normPhone(s string) string {
	digits := strings.Join(phoneRe.FindAllString(s, -1), "")
	if len(digits) >= 6 && len(digits) <= 17 {
		return digits
	}
	return ""
}

var emailRe = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// 解析上传文件：每行一条，按输入类型规范化并去重（面板提交的文件本来就是规范化过的）
func parseValues(text, input string) []string {
	seen := map[string]bool{}
	var out []string
	for _, line := range strings.Split(text, "\n") {
		v := strings.TrimSpace(line)
		if v == "" {
			continue
		}
		switch input {
		case "email":
			v = strings.ToLower(v)
			if !emailRe.MatchString(v) {
				continue
			}
		case "username":
			v = strings.TrimPrefix(v, "@")
			if v == "" || len(v) > 64 || strings.ContainsAny(v, " \t,;") {
				continue
			}
		default:
			v = normPhone(v)
			if v == "" {
				continue
			}
		}
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

// ---------- 缓存 ----------

type cacheHit struct {
	valid bool
	extra string
}

func cacheLookup(kind string, values []string, ttl time.Duration) map[string]cacheHit {
	hits := map[string]cacheHit{}
	minTime := time.Now().Add(-ttl).Unix()
	for i := 0; i < len(values); i += 400 {
		end := i + 400
		if end > len(values) {
			end = len(values)
		}
		chunk := values[i:end]
		args := make([]any, 0, len(chunk)+2)
		args = append(args, kind, minTime)
		ph := make([]string, len(chunk))
		for j, v := range chunk {
			ph[j] = "?"
			args = append(args, v)
		}
		rows, err := db.Query(
			"SELECT value, valid, extra FROM cache WHERE kind=? AND checked_at>=? AND value IN ("+strings.Join(ph, ",")+")", args...)
		if err != nil {
			log.Printf("cacheLookup: %v", err)
			continue
		}
		for rows.Next() {
			var v, extra string
			var valid int
			if rows.Scan(&v, &valid, &extra) == nil {
				hits[v] = cacheHit{valid == 1, extra}
			}
		}
		rows.Close()
	}
	return hits
}

// ---------- 上游 ----------

func upstreamReq(r *http.Request, method, path, contentType string, body io.Reader, timeout time.Duration) (*http.Response, error) {
	u := upstreamURL() + path
	if method == http.MethodGet && r != nil && r.URL.RawQuery != "" {
		u += "?" + r.URL.RawQuery
	}
	req, err := http.NewRequest(method, u, body)
	if err != nil {
		return nil, err
	}
	if r != nil {
		req.Header.Set("token", r.Header.Get("token"))
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	c := &http.Client{Timeout: timeout}
	return c.Do(req)
}

// 原样透传（未知类型 / 未知任务编号 / 余额查询）
func passThrough(w http.ResponseWriter, r *http.Request) {
	var body io.Reader
	ct := r.Header.Get("Content-Type")
	if r.Method != http.MethodGet {
		body = r.Body
	}
	resp, err := upstreamReq(r, r.Method, r.URL.Path, ct, body, 300*time.Second)
	if err != nil {
		apiErr(w, "上游接口不可达："+err.Error())
		return
	}
	defer resp.Body.Close()
	for _, h := range []string{"Content-Type", "Content-Disposition"} {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

type upstreamCreateResp struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    struct {
		TaskID    string `json:"taskId"`
		TaskState string `json:"taskState"`
	} `json:"data"`
	Consume json.RawMessage `json:"consume"`
}

func forwardCreate(r *http.Request, values []string, country, taskType, taskName string) (*upstreamCreateResp, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("file", "numbers.txt")
	_, _ = fw.Write([]byte(strings.Join(values, "\n")))
	if country != "" {
		_ = mw.WriteField("country", country)
	}
	_ = mw.WriteField("taskType", taskType)
	if taskName != "" {
		_ = mw.WriteField("taskName", taskName)
	}
	_ = mw.Close()
	resp, err := upstreamReq(r, http.MethodPost, "/api/task/create", mw.FormDataContentType(), &buf, 180*time.Second)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out upstreamCreateResp
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&out); err != nil {
		return nil, fmt.Errorf("上游响应异常(HTTP %d)", resp.StatusCode)
	}
	return &out, nil
}

// ---------- 处理器 ----------

func handleCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiErr(w, "method not allowed")
		return
	}
	if err := r.ParseMultipartForm(128 << 20); err != nil {
		apiErr(w, "表单解析失败："+err.Error())
		return
	}
	taskType := r.FormValue("taskType")
	country := r.FormValue("country")
	taskName := r.FormValue("taskName")
	def, known := taskTypes[taskType]

	file, _, err := r.FormFile("file")
	if err != nil {
		apiErr(w, "缺少任务文件")
		return
	}
	raw, _ := io.ReadAll(io.LimitReader(file, 128<<20))
	file.Close()

	// 未知类型或不缓存的类型：整体转发
	if !known || def.ttl == 0 {
		values := strings.Split(strings.TrimSpace(string(raw)), "\n")
		ur, err := forwardCreate(r, values, country, taskType, taskName)
		if err != nil {
			apiErr(w, err.Error())
			return
		}
		writeJSON(w, map[string]any{"code": ur.Code, "message": ur.Message,
			"data": map[string]any{"taskId": ur.Data.TaskID, "country": country, "taskTotal": len(values), "taskState": ur.Data.TaskState},
			"consume": ur.Consume})
		return
	}

	values := parseValues(string(raw), def.input)
	if len(values) == 0 {
		apiErr(w, "文件里没有识别到有效内容")
		return
	}
	hits := cacheLookup(def.kind, values, def.ttl)
	var misses []string
	cachedValid := 0
	for _, v := range values {
		if h, ok := hits[v]; ok {
			if h.valid {
				cachedValid++
			}
		} else {
			misses = append(misses, v)
		}
	}

	localID := genID()
	state := "Finish"
	upstreamID := ""
	var consume json.RawMessage
	if len(misses) > 0 {
		ur, err := forwardCreate(r, misses, country, taskType, taskName)
		if err != nil {
			apiErr(w, err.Error())
			return
		}
		if ur.Code != 0 {
			writeJSON(w, map[string]any{"code": ur.Code, "message": ur.Message})
			return
		}
		upstreamID = ur.Data.TaskID
		state = ur.Data.TaskState
		if state == "" {
			state = "Waiting"
		}
		consume = ur.Consume
	}

	writeMu.Lock()
	tx, err := db.Begin()
	if err == nil {
		_, _ = tx.Exec("INSERT INTO tasks (id,upstream_id,task_type,country,name,total,cached_count,cached_valid,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
			localID, upstreamID, taskType, country, taskName, len(values), len(values)-len(misses), cachedValid, state, time.Now().Unix())
		stmt, _ := tx.Prepare("INSERT INTO task_items (task_id,value,source,valid,extra) VALUES (?,?,?,?,?)")
		for _, v := range values {
			if h, ok := hits[v]; ok {
				b := 0
				if h.valid {
					b = 1
				}
				_, _ = stmt.Exec(localID, v, "hit", b, h.extra)
			} else {
				_, _ = stmt.Exec(localID, v, "miss", 0, "")
			}
		}
		stmt.Close()
		err = tx.Commit()
	}
	writeMu.Unlock()
	if err != nil {
		apiErr(w, "本地存储失败："+err.Error())
		return
	}

	out := map[string]any{"code": 0, "message": "任务创建成功",
		"data": map[string]any{"taskId": localID, "country": country, "taskTotal": len(values), "taskState": state}}
	if consume != nil {
		out["consume"] = consume
	}
	writeJSON(w, out)
	log.Printf("create %s type=%s total=%d cached=%d miss=%d upstream=%s",
		localID, taskType, len(values), len(values)-len(misses), len(misses), upstreamID)
}

type taskRow struct {
	ID, UpstreamID, TaskType, Country, Name, State string
	Total, CachedCount, CachedValid, Ingested      int
}

func getTask(id string) *taskRow {
	var t taskRow
	err := db.QueryRow("SELECT id,upstream_id,task_type,country,name,total,cached_count,cached_valid,state,ingested FROM tasks WHERE id=?", id).
		Scan(&t.ID, &t.UpstreamID, &t.TaskType, &t.Country, &t.Name, &t.Total, &t.CachedCount, &t.CachedValid, &t.State, &t.Ingested)
	if err != nil {
		return nil
	}
	return &t
}

func handleProgress(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("taskId")
	t := getTask(id)
	if t == nil {
		passThrough(w, r)
		return
	}
	if t.UpstreamID == "" {
		writeJSON(w, map[string]any{"code": 0, "message": "success", "data": map[string]any{
			"taskId": t.ID, "taskName": t.Name, "country": t.Country,
			"taskTotal": t.Total, "taskProgress": t.Total, "validQuantity": t.CachedValid, "taskState": "Finish"}})
		return
	}
	req, _ := http.NewRequest(http.MethodGet, upstreamURL()+"/api/task/progress?taskId="+t.UpstreamID, nil)
	req.Header.Set("token", r.Header.Get("token"))
	c := &http.Client{Timeout: 30 * time.Second}
	resp2, err := c.Do(req)
	if err != nil {
		apiErr(w, "上游接口不可达："+err.Error())
		return
	}
	defer resp2.Body.Close()
	var up struct {
		Code    int            `json:"code"`
		Message string         `json:"message"`
		Data    map[string]any `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp2.Body, 1<<20)).Decode(&up); err != nil {
		apiErr(w, fmt.Sprintf("上游响应异常(HTTP %d)", resp2.StatusCode))
		return
	}
	if up.Code != 0 {
		writeJSON(w, map[string]any{"code": up.Code, "message": up.Message})
		return
	}
	st, _ := up.Data["taskState"].(string)
	writeMu.Lock()
	_, _ = db.Exec("UPDATE tasks SET state=? WHERE id=?", st, t.ID)
	writeMu.Unlock()
	writeJSON(w, map[string]any{"code": 0, "message": "success", "data": map[string]any{
		"taskId": t.ID, "taskName": t.Name, "country": t.Country, "taskTotal": t.Total,
		"taskProgress":  t.CachedCount + toInt(up.Data["taskProgress"]),
		"validQuantity": t.CachedValid + toInt(up.Data["validQuantity"]),
		"taskState":     st}})
}

// 把上游结果（txt 或 zip）转成纯文本；zip 跳过名字像「无效」的文件
func resultToText(buf []byte) string {
	if len(buf) >= 4 && buf[0] == 'P' && buf[1] == 'K' && buf[2] == 3 && buf[3] == 4 {
		zr, err := zip.NewReader(bytes.NewReader(buf), int64(len(buf)))
		if err != nil {
			return string(buf)
		}
		skipRe := regexp.MustCompile(`(?i)invalid|fail|无效|未开通|不活跃|未注册`)
		var sb strings.Builder
		for _, f := range zr.File {
			if f.FileInfo().IsDir() || skipRe.MatchString(f.Name) {
				continue
			}
			rc, err := f.Open()
			if err == nil {
				b, _ := io.ReadAll(io.LimitReader(rc, 256<<20))
				rc.Close()
				sb.Write(b)
				sb.WriteByte('\n')
			}
		}
		return sb.String()
	}
	return string(buf)
}

var tokenSplitRe = regexp.MustCompile(`[\s,;\t|]+`)

// 解析结果文本 → value→extra（一行多列时整行作为附加信息保留）
func parseResultText(text, input string) map[string]string {
	out := map[string]string{}
	for _, rawLine := range strings.Split(text, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}
		tokens := tokenSplitRe.Split(line, -1)
		extra := ""
		if len(tokens) > 1 {
			if len(line) > 300 {
				extra = line[:300]
			} else {
				extra = line
			}
		}
		for _, tok := range tokens {
			if tok == "" {
				continue
			}
			var v string
			if input == "phone" {
				v = normPhone(tok)
			} else {
				v = strings.ToLower(tok)
			}
			if v != "" {
				if _, ok := out[v]; !ok {
					out[v] = extra
				}
			}
		}
	}
	return out
}

func handleResult(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("taskId")
	t := getTask(id)
	if t == nil {
		passThrough(w, r)
		return
	}
	def := taskTypes[t.TaskType]
	resultFile := filepath.Join(dataDir, "results", t.ID+".txt")

	// 首次下载：取回上游结果，写入缓存并落盘
	if t.UpstreamID != "" && t.Ingested == 0 {
		req, _ := http.NewRequest(http.MethodGet, upstreamURL()+"/api/task/result?taskId="+t.UpstreamID, nil)
		req.Header.Set("token", r.Header.Get("token"))
		resp, err := client.Do(req)
		if err != nil {
			apiErr(w, "下载上游结果失败："+err.Error())
			return
		}
		buf, _ := io.ReadAll(io.LimitReader(resp.Body, 512<<20))
		resp.Body.Close()
		if resp.StatusCode != 200 {
			apiErr(w, fmt.Sprintf("下载上游结果失败(HTTP %d)", resp.StatusCode))
			return
		}
		text := resultToText(buf)
		validMap := parseResultText(text, def.input)
		now := time.Now().Unix()

		writeMu.Lock()
		tx, err := db.Begin()
		if err == nil {
			rows, _ := db.Query("SELECT value FROM task_items WHERE task_id=? AND source='miss'", t.ID)
			var missVals []string
			for rows.Next() {
				var v string
				if rows.Scan(&v) == nil {
					missVals = append(missVals, v)
				}
			}
			rows.Close()
			upd, _ := tx.Prepare("UPDATE task_items SET valid=?, extra=? WHERE task_id=? AND value=? AND source='miss'")
			ins, _ := tx.Prepare("INSERT OR REPLACE INTO cache (kind,value,valid,extra,checked_at) VALUES (?,?,?,?,?)")
			for _, v := range missVals {
				lookup := v
				if def.input != "phone" {
					lookup = strings.ToLower(v)
				}
				extra, ok := validMap[lookup]
				b := 0
				if ok {
					b = 1
				}
				_, _ = upd.Exec(b, extra, t.ID, v)
				_, _ = ins.Exec(def.kind, v, b, extra, now)
			}
			upd.Close()
			ins.Close()
			_, _ = tx.Exec("UPDATE tasks SET ingested=1 WHERE id=?", t.ID)
			err = tx.Commit()
		}
		writeMu.Unlock()
		if err != nil {
			apiErr(w, "结果入库失败："+err.Error())
			return
		}
		_ = os.WriteFile(resultFile, []byte(text), 0o644)
		t.Ingested = 1
	}

	// 合并输出：上游结果文本 + 缓存命中的有效条目
	var sb strings.Builder
	if t.UpstreamID != "" {
		if b, err := os.ReadFile(resultFile); err == nil {
			sb.Write(bytes.TrimRight(b, "\n"))
			sb.WriteByte('\n')
		}
	}
	rows, err := db.Query("SELECT value, extra FROM task_items WHERE task_id=? AND source='hit' AND valid=1", t.ID)
	if err == nil {
		for rows.Next() {
			var v, extra string
			if rows.Scan(&v, &extra) == nil {
				if extra != "" {
					sb.WriteString(extra)
				} else {
					sb.WriteString(v)
				}
				sb.WriteByte('\n')
			}
		}
		rows.Close()
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+t.ID+`.txt"`)
	_, _ = io.WriteString(w, sb.String())
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	var cacheRows, taskRows int
	_ = db.QueryRow("SELECT COUNT(*) FROM cache").Scan(&cacheRows)
	_ = db.QueryRow("SELECT COUNT(*) FROM tasks").Scan(&taskRows)
	writeJSON(w, map[string]any{"ok": true, "upstream": upstreamURL(), "cacheRows": cacheRows, "tasks": taskRows})
}

// ---------- 自带管理页 ----------

func requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if adminPass == "" {
			http.Error(w, "管理页未启用：请设置 SAVER_ADMIN_PASS 环境变量后重启", http.StatusNotFound)
			return
		}
		user, pass, ok := r.BasicAuth()
		if !ok || user != "admin" || pass != adminPass {
			w.Header().Set("WWW-Authenticate", `Basic realm="yuncang"`)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

// POST /admin/api/clear?kind=all|<kind> — 清空缓存
func handleClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiErr(w, "method not allowed")
		return
	}
	kind := r.URL.Query().Get("kind")
	writeMu.Lock()
	var res sql.Result
	var err error
	if kind == "all" || kind == "" {
		res, err = db.Exec("DELETE FROM cache")
	} else {
		res, err = db.Exec("DELETE FROM cache WHERE kind=?", kind)
	}
	writeMu.Unlock()
	if err != nil {
		apiErr(w, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	writeJSON(w, map[string]any{"code": 0, "message": "success", "deleted": n})
}

func handleAdminPage(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = io.WriteString(w, adminPageHTML)
}

// 管理页统计：缓存概况 / 累计命中节省 / 各类型缓存量 / 最近任务
func handleStats(w http.ResponseWriter, _ *http.Request) {
	var cacheRows, taskRows, savedTotal int
	_ = db.QueryRow("SELECT COUNT(*) FROM cache").Scan(&cacheRows)
	_ = db.QueryRow("SELECT COUNT(*) FROM tasks").Scan(&taskRows)
	_ = db.QueryRow("SELECT COALESCE(SUM(cached_count),0) FROM tasks").Scan(&savedTotal)

	kinds := []map[string]any{}
	if rows, err := db.Query("SELECT kind, COUNT(*), COALESCE(SUM(valid),0) FROM cache GROUP BY kind ORDER BY COUNT(*) DESC"); err == nil {
		for rows.Next() {
			var kind string
			var n, valid int
			if rows.Scan(&kind, &n, &valid) == nil {
				kinds = append(kinds, map[string]any{"kind": kind, "rows": n, "valid": valid})
			}
		}
		rows.Close()
	}
	recent := []map[string]any{}
	if rows, err := db.Query("SELECT id,task_type,total,cached_count,state,created_at FROM tasks ORDER BY created_at DESC LIMIT 10"); err == nil {
		for rows.Next() {
			var id, tt, state string
			var total, cached, created int
			if rows.Scan(&id, &tt, &total, &cached, &state, &created) == nil {
				recent = append(recent, map[string]any{"id": id, "taskType": tt, "total": total,
					"cached": cached, "state": state, "createdAt": created})
			}
		}
		rows.Close()
	}
	writeJSON(w, map[string]any{"ok": true, "upstream": upstreamURL(),
		"cacheRows": cacheRows, "tasks": taskRows, "savedTotal": savedTotal,
		"kinds": kinds, "recent": recent})
}

// 定期清理：过期缓存、35 天前的任务记录和结果文件
func gcLoop() {
	for {
		time.Sleep(24 * time.Hour)
		now := time.Now()
		writeMu.Lock()
		seen := map[string]bool{}
		for _, def := range taskTypes {
			if def.ttl == 0 || seen[def.kind] {
				continue
			}
			seen[def.kind] = true
			_, _ = db.Exec("DELETE FROM cache WHERE kind=? AND checked_at < ?", def.kind, now.Add(-def.ttl).Unix())
		}
		cutoff := now.AddDate(0, 0, -35).Unix()
		rows, err := db.Query("SELECT id FROM tasks WHERE created_at < ?", cutoff)
		if err == nil {
			var old []string
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					old = append(old, id)
				}
			}
			rows.Close()
			for _, id := range old {
				_, _ = db.Exec("DELETE FROM task_items WHERE task_id=?", id)
				_, _ = db.Exec("DELETE FROM tasks WHERE id=?", id)
				_ = os.Remove(filepath.Join(dataDir, "results", id+".txt"))
			}
		}
		writeMu.Unlock()
	}
}
