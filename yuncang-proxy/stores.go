package main

// 云仓管理：号码仓库。上传号码（待入仓）→ 先对共享缓存，再由后台工作器
// 自动提交 th333 检测 → 沉淀为有效/无效两个池子，可分别导出 txt。
// 自动检测使用「设置」里保存的上游 token（settings 表 k='token'）。

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func buildCreateForm(values []string, country, taskType, taskName string) (io.Reader, string) {
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
	return &buf, mw.FormDataContentType()
}

const storeSchema = `
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, remark TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '', task_type TEXT NOT NULL,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS store_numbers (
  store_id INTEGER NOT NULL, value TEXT NOT NULL,
  status TEXT NOT NULL, -- pending | checking | valid | invalid
  job_id INTEGER NOT NULL DEFAULT 0,
  extra TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
  PRIMARY KEY (store_id, value)
);
CREATE INDEX IF NOT EXISTS idx_store_status ON store_numbers(store_id, status);
CREATE TABLE IF NOT EXISTS store_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL, upstream_id TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`

func getSetting(k string) string {
	var v string
	_ = db.QueryRow("SELECT v FROM settings WHERE k=?", k).Scan(&v)
	return v
}

// 从上游 consume 字段解析本次扣费
func consumeDeduction(raw json.RawMessage) float64 {
	if len(raw) == 0 {
		return 0
	}
	var c struct {
		Deduction float64 `json:"deduction"`
	}
	_ = json.Unmarshal(raw, &c)
	return c.Deduction
}

// 上游地址：设置里保存的优先，留空回退启动默认（env SAVER_UPSTREAM 或 th333）
func upstreamURL() string {
	if v := strings.TrimRight(strings.TrimSpace(getSetting("upstream")), "/"); v != "" {
		return v
	}
	return upstream
}

func setSetting(k, v string) error {
	writeMu.Lock()
	defer writeMu.Unlock()
	_, err := db.Exec("INSERT OR REPLACE INTO settings (k,v) VALUES (?,?)", k, v)
	return err
}

// ---------- 上游调用（带显式 token，供后台工作器使用） ----------

func upstreamCreateWithToken(token string, values []string, country, taskType, taskName string) (*upstreamCreateResp, error) {
	body, ct := buildCreateForm(values, country, taskType, taskName)
	req, err := http.NewRequest(http.MethodPost, upstreamURL()+"/api/task/create", body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("token", token)
	req.Header.Set("Content-Type", ct)
	c := &http.Client{Timeout: 180 * time.Second}
	resp, err := c.Do(req)
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

func upstreamProgressWithToken(token, upstreamID string) (state string, err error) {
	req, _ := http.NewRequest(http.MethodGet, upstreamURL()+"/api/task/progress?taskId="+upstreamID, nil)
	req.Header.Set("token", token)
	c := &http.Client{Timeout: 30 * time.Second}
	resp, err := c.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var up struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			TaskState string `json:"taskState"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&up); err != nil {
		return "", fmt.Errorf("上游响应异常(HTTP %d)", resp.StatusCode)
	}
	if up.Code != 0 {
		return "", fmt.Errorf("%s", up.Message)
	}
	return up.Data.TaskState, nil
}

func upstreamResultWithToken(token, upstreamID string) (string, error) {
	req, _ := http.NewRequest(http.MethodGet, upstreamURL()+"/api/task/result?taskId="+upstreamID, nil)
	req.Header.Set("token", token)
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("下载结果失败(HTTP %d)", resp.StatusCode)
	}
	buf, _ := io.ReadAll(io.LimitReader(resp.Body, 512<<20))
	return resultToText(buf), nil
}

// ---------- 云仓 CRUD ----------

type storeRow struct {
	ID                                   int64
	Name, Remark, Country, TaskType, Err string
	Created, Updated                     int64
	Pending, Checking, Valid, Invalid    int
}

func handleStores(w http.ResponseWriter, r *http.Request) {
	q := "SELECT id,name,remark,country,task_type,last_error,created_at,updated_at FROM stores WHERE 1=1"
	var args []any
	if kw := strings.TrimSpace(r.URL.Query().Get("kw")); kw != "" {
		q += " AND name LIKE ?"
		args = append(args, "%"+kw+"%")
	}
	if c := r.URL.Query().Get("country"); c != "" {
		q += " AND country=?"
		args = append(args, c)
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 10
	}
	var total int
	_ = db.QueryRow("SELECT COUNT(*) FROM ("+q+")", args...).Scan(&total)
	q += " ORDER BY updated_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, (page-1)*limit)

	rows, err := db.Query(q, args...)
	if err != nil {
		apiErr(w, err.Error())
		return
	}
	var list []storeRow
	for rows.Next() {
		var s storeRow
		if rows.Scan(&s.ID, &s.Name, &s.Remark, &s.Country, &s.TaskType, &s.Err, &s.Created, &s.Updated) == nil {
			list = append(list, s)
		}
	}
	rows.Close()
	out := make([]map[string]any, 0, len(list))
	for _, s := range list {
		cr, _ := db.Query("SELECT status, COUNT(*) FROM store_numbers WHERE store_id=? GROUP BY status", s.ID)
		for cr.Next() {
			var st string
			var n int
			if cr.Scan(&st, &n) == nil {
				switch st {
				case "pending":
					s.Pending = n
				case "checking":
					s.Checking = n
				case "valid":
					s.Valid = n
				case "invalid":
					s.Invalid = n
				}
			}
		}
		cr.Close()
		out = append(out, map[string]any{
			"id": s.ID, "name": s.Name, "remark": s.Remark, "country": s.Country,
			"taskType": s.TaskType, "lastError": s.Err,
			"pending": s.Pending + s.Checking, "checking": s.Checking,
			"valid": s.Valid, "invalid": s.Invalid,
			"createdAt": s.Created, "updatedAt": s.Updated,
		})
	}
	writeJSON(w, map[string]any{"code": 0, "data": out, "total": total, "page": page, "limit": limit})
}

func handleStoreSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiErr(w, "method not allowed")
		return
	}
	var in struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Remark   string `json:"remark"`
		Country  string `json:"country"`
		TaskType string `json:"taskType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		apiErr(w, "参数错误")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		apiErr(w, "请填写名称")
		return
	}
	def, ok := taskTypes[in.TaskType]
	if !ok {
		apiErr(w, "无效的检测类型")
		return
	}
	if def.input == "phone" && in.Country == "" {
		apiErr(w, "该检测类型需要选择国家")
		return
	}
	now := time.Now().Unix()
	writeMu.Lock()
	var err error
	if in.ID > 0 {
		_, err = db.Exec("UPDATE stores SET name=?, remark=?, country=?, updated_at=? WHERE id=?",
			in.Name, in.Remark, in.Country, now, in.ID)
	} else {
		_, err = db.Exec("INSERT INTO stores (name,remark,country,task_type,created_at,updated_at) VALUES (?,?,?,?,?,?)",
			in.Name, in.Remark, in.Country, in.TaskType, now, now)
	}
	writeMu.Unlock()
	if err != nil {
		apiErr(w, err.Error())
		return
	}
	writeJSON(w, map[string]any{"code": 0, "message": "success"})
}

func handleStoreDel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiErr(w, "method not allowed")
		return
	}
	id := r.URL.Query().Get("id")
	writeMu.Lock()
	_, _ = db.Exec("DELETE FROM store_numbers WHERE store_id=?", id)
	_, _ = db.Exec("DELETE FROM store_jobs WHERE store_id=?", id)
	_, err := db.Exec("DELETE FROM stores WHERE id=?", id)
	writeMu.Unlock()
	if err != nil {
		apiErr(w, err.Error())
		return
	}
	writeJSON(w, map[string]any{"code": 0, "message": "success"})
}

// 上传号码进云仓：去重入库为 pending，并立即用共享缓存解析一轮
func handleStoreUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiErr(w, "method not allowed")
		return
	}
	id, _ := strconv.ParseInt(r.URL.Query().Get("id"), 10, 64)
	var taskType string
	if err := db.QueryRow("SELECT task_type FROM stores WHERE id=?", id).Scan(&taskType); err != nil {
		apiErr(w, "云仓不存在")
		return
	}
	def := taskTypes[taskType]
	if err := r.ParseMultipartForm(128 << 20); err != nil {
		apiErr(w, "表单解析失败")
		return
	}
	f, _, err := r.FormFile("file")
	if err != nil {
		apiErr(w, "缺少文件")
		return
	}
	raw, _ := io.ReadAll(io.LimitReader(f, 128<<20))
	f.Close()
	values := parseValues(string(raw), def.input)
	if len(values) == 0 {
		apiErr(w, "文件里没有识别到有效内容")
		return
	}

	hits := cacheLookup(def.kind, values, def.ttl)
	now := time.Now().Unix()
	added, fromCache := 0, 0
	writeMu.Lock()
	tx, err := db.Begin()
	if err == nil {
		ins, _ := tx.Prepare("INSERT OR IGNORE INTO store_numbers (store_id,value,status,extra,updated_at) VALUES (?,?,?,?,?)")
		for _, v := range values {
			st, extra := "pending", ""
			if h, ok := hits[v]; ok {
				fromCache++
				extra = h.extra
				if h.valid {
					st = "valid"
				} else {
					st = "invalid"
				}
			}
			if res, e := ins.Exec(id, v, st, extra, now); e == nil {
				if n, _ := res.RowsAffected(); n > 0 {
					added++
				}
			}
		}
		ins.Close()
		_, _ = tx.Exec("UPDATE stores SET updated_at=? WHERE id=?", now, id)
		err = tx.Commit()
	}
	writeMu.Unlock()
	if err != nil {
		apiErr(w, err.Error())
		return
	}
	writeJSON(w, map[string]any{"code": 0, "message": "success",
		"parsed": len(values), "added": added, "fromCache": fromCache})
}

// 导出：type=valid|invalid|pending
func handleStoreExport(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	typ := r.URL.Query().Get("type")
	if typ != "valid" && typ != "invalid" && typ != "pending" {
		apiErr(w, "type 应为 valid/invalid/pending")
		return
	}
	var name string
	_ = db.QueryRow("SELECT name FROM stores WHERE id=?", id).Scan(&name)
	label := map[string]string{"valid": "有效", "invalid": "无效", "pending": "待检测"}[typ]
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename*=UTF-8''%s-%s.txt`,
		strings.ReplaceAll(name, " ", "_"), label))
	cond := "status=?"
	args := []any{id, typ}
	if typ == "pending" {
		cond = "status IN ('pending','checking')"
		args = []any{id}
	}
	rows, err := db.Query("SELECT value, extra FROM store_numbers WHERE store_id=? AND "+cond, args...)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var v, extra string
		if rows.Scan(&v, &extra) == nil {
			if extra != "" {
				_, _ = io.WriteString(w, extra+"\n")
			} else {
				_, _ = io.WriteString(w, v+"\n")
			}
		}
	}
}

// ---------- 设置 / 余额 ----------

func handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var in struct {
			Token    *string `json:"token"`
			Upstream *string `json:"upstream"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			apiErr(w, "参数错误")
			return
		}
		if in.Upstream != nil {
			u := strings.TrimRight(strings.TrimSpace(*in.Upstream), "/")
			if u != "" && !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
				apiErr(w, "上游地址需以 http:// 或 https:// 开头")
				return
			}
			if err := setSetting("upstream", u); err != nil {
				apiErr(w, err.Error())
				return
			}
		}
		if in.Token != nil {
			if err := setSetting("token", strings.TrimSpace(*in.Token)); err != nil {
				apiErr(w, err.Error())
				return
			}
		}
		writeJSON(w, map[string]any{"code": 0, "message": "success"})
		return
	}
	tok := getSetting("token")
	masked := ""
	if len(tok) > 6 {
		masked = tok[:3] + "****" + tok[len(tok)-3:]
	} else if tok != "" {
		masked = "****"
	}
	writeJSON(w, map[string]any{"code": 0, "token": masked, "hasToken": tok != "",
		"upstream": getSetting("upstream"), "upstreamEffective": upstreamURL(), "upstreamDefault": upstream})
}

func handleAdminBalance(w http.ResponseWriter, r *http.Request) {
	tok := getSetting("token")
	if tok == "" {
		apiErr(w, "尚未保存上游 token")
		return
	}
	req, _ := http.NewRequest(http.MethodGet, upstreamURL()+"/api/user/balance", nil)
	req.Header.Set("token", tok)
	c := &http.Client{Timeout: 15 * time.Second}
	resp, err := c.Do(req)
	if err != nil {
		apiErr(w, "上游接口不可达："+err.Error())
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = io.Copy(w, io.LimitReader(resp.Body, 1<<20))
}

// ---------- 消耗统计（计费归属） ----------

func handleBilling(w http.ResponseWriter, _ *http.Request) {
	owners := []map[string]any{}
	if rows, err := db.Query(`SELECT owner_id, owner_name, COUNT(*), COALESCE(SUM(total),0),
		COALESCE(SUM(cached_count),0), COALESCE(SUM(deduction),0)
		FROM tasks GROUP BY owner_id, owner_name ORDER BY SUM(deduction) DESC, COUNT(*) DESC`); err == nil {
		for rows.Next() {
			var oid, oname string
			var n, total, cached int
			var ded float64
			if rows.Scan(&oid, &oname, &n, &total, &cached, &ded) == nil {
				owners = append(owners, map[string]any{"ownerId": oid, "ownerName": oname,
					"tasks": n, "total": total, "cached": cached, "forwarded": total - cached, "deduction": ded})
			}
		}
		rows.Close()
	}
	storesAgg := []map[string]any{}
	if rows, err := db.Query(`SELECT s.id, s.name, COUNT(j.id), COALESCE(SUM(j.count),0), COALESCE(SUM(j.deduction),0)
		FROM store_jobs j JOIN stores s ON s.id=j.store_id GROUP BY s.id, s.name ORDER BY SUM(j.deduction) DESC`); err == nil {
		for rows.Next() {
			var id int64
			var name string
			var n, cnt int
			var ded float64
			if rows.Scan(&id, &name, &n, &cnt, &ded) == nil {
				storesAgg = append(storesAgg, map[string]any{"id": id, "name": name,
					"jobs": n, "count": cnt, "deduction": ded})
			}
		}
		rows.Close()
	}
	var taskDed, jobDed float64
	var taskCached, taskForwarded, jobForwarded, storeChecked int
	_ = db.QueryRow("SELECT COALESCE(SUM(deduction),0), COALESCE(SUM(cached_count),0), COALESCE(SUM(total-cached_count),0) FROM tasks").Scan(&taskDed, &taskCached, &taskForwarded)
	_ = db.QueryRow("SELECT COALESCE(SUM(deduction),0), COALESCE(SUM(count),0) FROM store_jobs").Scan(&jobDed, &jobForwarded)
	_ = db.QueryRow("SELECT COUNT(*) FROM store_numbers WHERE status IN ('valid','invalid')").Scan(&storeChecked)
	// 云仓缓存直出 = 已出结果 - 经作业检测的（含进行中作业会轻微低估，可接受）
	var jobIngested int
	_ = db.QueryRow("SELECT COALESCE(SUM(count),0) FROM store_jobs WHERE state='Done'").Scan(&jobIngested)
	storeCached := storeChecked - jobIngested
	if storeCached < 0 {
		storeCached = 0
	}
	totalDed := taskDed + jobDed
	totalCached := taskCached + storeCached
	forwarded := taskForwarded + jobForwarded
	saved := 0.0
	if forwarded > 0 {
		saved = totalDed / float64(forwarded) * float64(totalCached) // 按平均单价估算
	}
	writeJSON(w, map[string]any{"code": 0, "owners": owners, "stores": storesAgg,
		"totalDeduction": totalDed, "totalCached": totalCached, "totalForwarded": forwarded,
		"estimatedSaved": saved})
}

// ---------- 后台工作器：待入仓 → 提交检测 → 沉淀有效/无效 ----------

func storeWorker() {
	for {
		time.Sleep(60 * time.Second)
		token := getSetting("token")
		if token == "" {
			continue
		}
		pollStoreJobs(token)
		submitPendingStores(token)
	}
}

func submitPendingStores(token string) {
	rows, err := db.Query(`SELECT s.id, s.country, s.task_type FROM stores s
		WHERE EXISTS (SELECT 1 FROM store_numbers n WHERE n.store_id=s.id AND n.status='pending')
		AND NOT EXISTS (SELECT 1 FROM store_jobs j WHERE j.store_id=s.id AND j.state NOT IN ('Done','Fail','Close'))`)
	if err != nil {
		return
	}
	type st struct {
		id              int64
		country, ttype  string
	}
	var list []st
	for rows.Next() {
		var s st
		if rows.Scan(&s.id, &s.country, &s.ttype) == nil {
			list = append(list, s)
		}
	}
	rows.Close()

	for _, s := range list {
		def, ok := taskTypes[s.ttype]
		if !ok {
			continue
		}
		vr, err := db.Query("SELECT value FROM store_numbers WHERE store_id=? AND status='pending' LIMIT 100000", s.id)
		if err != nil {
			continue
		}
		var values []string
		for vr.Next() {
			var v string
			if vr.Scan(&v) == nil {
				values = append(values, v)
			}
		}
		vr.Close()
		if len(values) == 0 {
			continue
		}

		// 提交前再对一次缓存（可能别的任务刚检测过）
		hits := cacheLookup(def.kind, values, def.ttl)
		now := time.Now().Unix()
		var misses []string
		writeMu.Lock()
		tx, _ := db.Begin()
		if tx != nil {
			upd, _ := tx.Prepare("UPDATE store_numbers SET status=?, extra=?, updated_at=? WHERE store_id=? AND value=?")
			for _, v := range values {
				if h, ok := hits[v]; ok {
					st := "invalid"
					if h.valid {
						st = "valid"
					}
					_, _ = upd.Exec(st, h.extra, now, s.id, v)
				} else {
					misses = append(misses, v)
				}
			}
			upd.Close()
			_ = tx.Commit()
		}
		writeMu.Unlock()
		if len(misses) == 0 {
			continue
		}

		ur, err := upstreamCreateWithToken(token, misses, s.country, s.ttype, fmt.Sprintf("云仓-%d", s.id))
		if err != nil || ur.Code != 0 || ur.Data.TaskID == "" {
			msg := "提交检测失败"
			if err != nil {
				msg += "：" + err.Error()
			} else if ur.Message != "" {
				msg += "：" + ur.Message
			}
			writeMu.Lock()
			_, _ = db.Exec("UPDATE stores SET last_error=?, updated_at=? WHERE id=?", msg, time.Now().Unix(), s.id)
			writeMu.Unlock()
			log.Printf("store %d submit: %s", s.id, msg)
			continue
		}
		writeMu.Lock()
		res, _ := db.Exec("INSERT INTO store_jobs (store_id,upstream_id,count,state,created_at,deduction) VALUES (?,?,?,?,?,?)",
			s.id, ur.Data.TaskID, len(misses), "Waiting", time.Now().Unix(), consumeDeduction(ur.Consume))
		jobID, _ := res.LastInsertId()
		upd2, _ := db.Prepare("UPDATE store_numbers SET status='checking', job_id=?, updated_at=? WHERE store_id=? AND value=? AND status='pending'")
		now2 := time.Now().Unix()
		for _, v := range misses {
			_, _ = upd2.Exec(jobID, now2, s.id, v)
		}
		upd2.Close()
		_, _ = db.Exec("UPDATE stores SET last_error='', updated_at=? WHERE id=?", now2, s.id)
		writeMu.Unlock()
		log.Printf("store %d submitted %d numbers → %s (job %d)", s.id, len(misses), ur.Data.TaskID, jobID)
	}
}

func pollStoreJobs(token string) {
	rows, err := db.Query("SELECT id, store_id, upstream_id FROM store_jobs WHERE state NOT IN ('Done','Fail','Close')")
	if err != nil {
		return
	}
	type job struct {
		id, storeID int64
		upID        string
	}
	var jobs []job
	for rows.Next() {
		var j job
		if rows.Scan(&j.id, &j.storeID, &j.upID) == nil {
			jobs = append(jobs, j)
		}
	}
	rows.Close()

	for _, j := range jobs {
		state, err := upstreamProgressWithToken(token, j.upID)
		if err != nil {
			continue // 网络抖动下轮再试
		}
		if state != "Finish" && state != "Fail" && state != "Close" {
			writeMu.Lock()
			_, _ = db.Exec("UPDATE store_jobs SET state=? WHERE id=?", state, j.id)
			writeMu.Unlock()
			continue
		}
		if state == "Fail" || state == "Close" {
			// 平台失败已退款：号码退回待入仓，下轮重试
			writeMu.Lock()
			_, _ = db.Exec("UPDATE store_numbers SET status='pending', job_id=0 WHERE job_id=?", j.id)
			_, _ = db.Exec("UPDATE store_jobs SET state=? WHERE id=?", state, j.id)
			_, _ = db.Exec("UPDATE stores SET last_error=?, updated_at=? WHERE id=?",
				"检测平台返回 "+state+"，已退回待入仓", time.Now().Unix(), j.storeID)
			writeMu.Unlock()
			continue
		}
		// Finish：下载结果，沉淀有效/无效，同时写共享缓存
		text, err := upstreamResultWithToken(token, j.upID)
		if err != nil {
			log.Printf("store job %d download: %v", j.id, err)
			continue
		}
		var ttype string
		_ = db.QueryRow("SELECT task_type FROM stores WHERE id=?", j.storeID).Scan(&ttype)
		def := taskTypes[ttype]
		validMap := parseResultText(text, def.input)
		now := time.Now().Unix()

		writeMu.Lock()
		vr, _ := db.Query("SELECT value FROM store_numbers WHERE job_id=?", j.id)
		var vals []string
		for vr.Next() {
			var v string
			if vr.Scan(&v) == nil {
				vals = append(vals, v)
			}
		}
		vr.Close()
		tx, txErr := db.Begin()
		if txErr == nil {
			upd, _ := tx.Prepare("UPDATE store_numbers SET status=?, extra=?, job_id=0, updated_at=? WHERE job_id=? AND value=?")
			ins, _ := tx.Prepare("INSERT OR REPLACE INTO cache (kind,value,valid,extra,checked_at) VALUES (?,?,?,?,?)")
			for _, v := range vals {
				lookup := v
				if def.input != "phone" {
					lookup = strings.ToLower(v)
				}
				extra, ok := validMap[lookup]
				st, b := "invalid", 0
				if ok {
					st, b = "valid", 1
				}
				_, _ = upd.Exec(st, extra, now, j.id, v)
				_, _ = ins.Exec(def.kind, v, b, extra, now)
			}
			upd.Close()
			ins.Close()
			_, _ = tx.Exec("UPDATE store_jobs SET state='Done' WHERE id=?", j.id)
			_, _ = tx.Exec("UPDATE stores SET last_error='', updated_at=? WHERE id=?", now, j.storeID)
			_ = tx.Commit()
		}
		writeMu.Unlock()
		log.Printf("store %d job %d done: %d numbers ingested", j.storeID, j.id, len(vals))
	}
}

var _ = sql.ErrNoRows
