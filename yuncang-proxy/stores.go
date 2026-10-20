package main

// 云仓管理：号码仓库。上传号码（待入仓）→ 先对共享缓存，再由后台工作器
// 自动提交 th333 检测 → 沉淀为有效/无效两个池子，可分别导出 txt。
// 自动检测使用「设置」里保存的上游 token（settings 集合 _id='token'）。

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
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

// ---------- 云仓文档 ----------

type storeDoc struct {
	ID        int64  `bson:"_id"`
	Name      string `bson:"name"`
	Remark    string `bson:"remark"`
	Country   string `bson:"country"`
	TaskType  string `bson:"taskType"`
	LastError string `bson:"lastError"`
	CreatedAt int64  `bson:"createdAt"`
	UpdatedAt int64  `bson:"updatedAt"`
}

type numberDoc struct {
	StoreID   int64  `bson:"storeId"`
	Value     string `bson:"value"`
	Status    string `bson:"status"` // pending | checking | valid | invalid
	JobID     int64  `bson:"jobId"`
	Extra     string `bson:"extra"`
	UpdatedAt int64  `bson:"updatedAt"`
}

type jobDoc struct {
	ID         int64   `bson:"_id"`
	StoreID    int64   `bson:"storeId"`
	UpstreamID string  `bson:"upstreamId"`
	Count      int     `bson:"count"`
	State      string  `bson:"state"`
	CreatedAt  int64   `bson:"createdAt"`
	Deduction  float64 `bson:"deduction"`
}

// ---------- 云仓 CRUD ----------

func handleStores(w http.ResponseWriter, r *http.Request) {
	filter := bson.M{}
	if kw := strings.TrimSpace(r.URL.Query().Get("kw")); kw != "" {
		filter["name"] = bson.M{"$regex": regexp.QuoteMeta(kw), "$options": "i"}
	}
	if cc := r.URL.Query().Get("country"); cc != "" {
		filter["country"] = cc
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 10
	}

	c, cancel := ctx()
	defer cancel()
	total, _ := colStores.CountDocuments(c, filter)
	cur, err := colStores.Find(c, filter, options.Find().
		SetSort(bson.D{{Key: "updatedAt", Value: -1}}).
		SetSkip(int64((page-1)*limit)).SetLimit(int64(limit)))
	if err != nil {
		apiErr(w, err.Error())
		return
	}
	var list []storeDoc
	_ = cur.All(c, &list)

	out := make([]map[string]any, 0, len(list))
	for _, s := range list {
		counts := map[string]int{}
		if cr, err := colNumbers.Aggregate(c, []bson.M{
			{"$match": bson.M{"storeId": s.ID}},
			{"$group": bson.M{"_id": "$status", "n": bson.M{"$sum": 1}}},
		}); err == nil {
			var rows []struct {
				ID string `bson:"_id"`
				N  int    `bson:"n"`
			}
			if cr.All(c, &rows) == nil {
				for _, row := range rows {
					counts[row.ID] = row.N
				}
			}
		}
		out = append(out, map[string]any{
			"id": s.ID, "name": s.Name, "remark": s.Remark, "country": s.Country,
			"taskType": s.TaskType, "lastError": s.LastError,
			"pending": counts["pending"] + counts["checking"], "checking": counts["checking"],
			"valid": counts["valid"], "invalid": counts["invalid"],
			"createdAt": s.CreatedAt, "updatedAt": s.UpdatedAt,
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
	c, cancel := ctx()
	defer cancel()
	var err error
	if in.ID > 0 {
		_, err = colStores.UpdateOne(c, bson.M{"_id": in.ID},
			bson.M{"$set": bson.M{"name": in.Name, "remark": in.Remark, "country": in.Country, "updatedAt": now}})
	} else {
		_, err = colStores.InsertOne(c, storeDoc{
			ID: nextSeq("stores"), Name: in.Name, Remark: in.Remark, Country: in.Country,
			TaskType: in.TaskType, CreatedAt: now, UpdatedAt: now,
		})
	}
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
	id, _ := strconv.ParseInt(r.URL.Query().Get("id"), 10, 64)
	c, cancel := ctx()
	defer cancel()
	_, _ = colNumbers.DeleteMany(c, bson.M{"storeId": id})
	_, _ = colJobs.DeleteMany(c, bson.M{"storeId": id})
	_, err := colStores.DeleteOne(c, bson.M{"_id": id})
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
	c, cancel := ctx()
	var store storeDoc
	err := colStores.FindOne(c, bson.M{"_id": id}).Decode(&store)
	cancel()
	if err != nil {
		apiErr(w, "云仓不存在")
		return
	}
	def := taskTypes[store.TaskType]
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
	docs := make([]interface{}, 0, len(values))
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
		docs = append(docs, numberDoc{StoreID: id, Value: v, Status: st, Extra: extra, UpdatedAt: now})
	}
	// 无序批量插入：已存在的（唯一索引冲突）自动跳过，等价于原 INSERT OR IGNORE
	for i := 0; i < len(docs); i += 5000 {
		end := i + 5000
		if end > len(docs) {
			end = len(docs)
		}
		c2, cancel2 := ctx()
		res, err := colNumbers.InsertMany(c2, docs[i:end], options.InsertMany().SetOrdered(false))
		cancel2()
		if res != nil {
			added += len(res.InsertedIDs)
		}
		if err != nil && !mongo.IsDuplicateKeyError(err) {
			if _, ok := err.(mongo.BulkWriteException); !ok {
				apiErr(w, err.Error())
				return
			}
		}
	}
	c3, cancel3 := ctx()
	_, _ = colStores.UpdateOne(c3, bson.M{"_id": id}, bson.M{"$set": bson.M{"updatedAt": now}})
	cancel3()
	writeJSON(w, map[string]any{"code": 0, "message": "success",
		"parsed": len(values), "added": added, "fromCache": fromCache})
}

// 导出：type=valid|invalid|pending
func handleStoreExport(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.URL.Query().Get("id"), 10, 64)
	typ := r.URL.Query().Get("type")
	if typ != "valid" && typ != "invalid" && typ != "pending" {
		apiErr(w, "type 应为 valid/invalid/pending")
		return
	}
	c, cancel := ctx()
	defer cancel()
	var store storeDoc
	_ = colStores.FindOne(c, bson.M{"_id": id}).Decode(&store)
	label := map[string]string{"valid": "有效", "invalid": "无效", "pending": "待检测"}[typ]
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename*=UTF-8''%s-%s.txt`,
		strings.ReplaceAll(store.Name, " ", "_"), label))
	filter := bson.M{"storeId": id, "status": typ}
	if typ == "pending" {
		filter = bson.M{"storeId": id, "status": bson.M{"$in": []string{"pending", "checking"}}}
	}
	cur, err := colNumbers.Find(c, filter)
	if err != nil {
		return
	}
	defer cur.Close(c)
	for cur.Next(c) {
		var n numberDoc
		if cur.Decode(&n) == nil {
			if n.Extra != "" {
				_, _ = io.WriteString(w, n.Extra+"\n")
			} else {
				_, _ = io.WriteString(w, n.Value+"\n")
			}
		}
	}
}

// ---------- 历史数据直接导入缓存 ----------

// 有效结果必须携带附加数据的缓存命名空间（性别年龄/UID/型号/运营商等）：
// 读路径在 extra 非空时用 extra 替代号码输出，缺 extra 的「有效」行等于没有交付内容
var payloadKinds = map[string]bool{
	"wsGender": true, "tgGender": true, "fbGender": true, "linkedinGender": true,
	"lineGender": true, "viberGender": true, "botimGender": true, "zaloGender": true,
	"fbUid": true, "wxAll": true, "iosAll": true, "numberStatus": true,
	"operatorStandard": true, "phoneUsCarrier": true,
}

var impColRe = regexp.MustCompile(`[,;\t]`)

func handleCacheImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiErr(w, "method not allowed")
		return
	}
	// 跨站表单会自动附带浏览器缓存的 Basic 凭据；要求自定义头（跨站发送需 CORS
	// 预检，本服务不回 CORS 头即被浏览器拦截），挡 CSRF
	if r.Header.Get("X-Requested-With") != "XMLHttpRequest" {
		apiErr(w, "非法请求来源")
		return
	}
	if r.ContentLength > 64<<20 {
		apiErr(w, "文件超过 64MB，请拆分后分次导入")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<20)

	mr, err := r.MultipartReader()
	if err != nil {
		apiErr(w, "表单解析失败")
		return
	}

	kind, validStr := "", ""
	var def typeDef
	valid := true
	parsed, skipped := 0, 0
	var upserted int64
	now := time.Now().Unix()
	batch := make([]cacheDoc, 0, 5000)
	batchIdx := map[string]int{} // 批内去重：同一无序 BulkWrite 里对同一新键双重 upsert 会报 E11000
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		n, err := cacheWriteBatch(def.kind, batch, now)
		upserted += n
		batch = batch[:0]
		batchIdx = map[string]int{}
		return err
	}

	fileDone := false
	for !fileDone {
		part, perr := mr.NextPart()
		if perr == io.EOF {
			break
		}
		if perr != nil {
			apiErr(w, fmt.Sprintf("表单读取失败（已写入 %d 条）：%v", upserted, perr))
			return
		}
		switch part.FormName() {
		case "kind":
			b, _ := io.ReadAll(io.LimitReader(part, 256))
			kind = strings.TrimSpace(string(b))
		case "valid":
			b, _ := io.ReadAll(io.LimitReader(part, 16))
			validStr = strings.TrimSpace(string(b))
		case "file":
			// 前端保证 kind/valid 字段排在文件 part 之前
			var ok bool
			def, ok = taskTypes[kind]
			if !ok {
				apiErr(w, "未知的检测类型")
				return
			}
			if def.ttl == 0 {
				apiErr(w, "该类型为实时检测，缓存不生效，不支持导入")
				return
			}
			valid = validStr != "false"
			needExtra := valid && payloadKinds[def.kind]

			sc := bufio.NewScanner(part)
			sc.Buffer(make([]byte, 64<<10), 1<<20)
			for sc.Scan() {
				line := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(sc.Text()), "\ufeff"))
				if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
					continue
				}
				cols := impColRe.Split(line, -1)
				first := strings.TrimSpace(cols[0])
				value := ""
				switch def.input {
				case "email":
					if v := strings.ToLower(first); emailRe.MatchString(v) {
						value = v
					}
				case "username":
					if v := strings.TrimPrefix(first, "@"); v != "" && len(v) <= 64 && !strings.ContainsAny(v, " \t,;") {
						value = v
					}
				default:
					value = normPhone(first)
				}
				if value == "" {
					continue
				}
				parsed++
				extra := ""
				nonEmpty := 0
				for _, col := range cols {
					if strings.TrimSpace(col) != "" {
						nonEmpty++
					}
				}
				// ≥2 个非空列：整行存 extra（与正常入库一致，extra 是含号码的完整结果行，
				// 导出路径 extra 非空时输出 extra 替代号码）
				if nonEmpty >= 2 {
					extra = line
				}
				if needExtra && extra == "" {
					skipped++
					continue
				}
				doc := cacheDoc{Value: value, Valid: valid, Extra: extra}
				if i, dup := batchIdx[value]; dup {
					batch[i] = doc
				} else {
					batchIdx[value] = len(batch)
					batch = append(batch, doc)
				}
				if len(batch) >= 5000 {
					if err := flush(); err != nil {
						apiErr(w, fmt.Sprintf("已写入 %d 条后出错：%v", upserted, err))
						return
					}
				}
			}
			if err := sc.Err(); err != nil {
				apiErr(w, fmt.Sprintf("读取文件失败（可能超过 64MB 被截断，已写入 %d 条）：%v", upserted, err))
				return
			}
			fileDone = true
		}
	}
	if !fileDone {
		apiErr(w, "缺少文件")
		return
	}
	if parsed == 0 {
		apiErr(w, "文件里没有识别到有效内容")
		return
	}
	if skipped == parsed {
		apiErr(w, "该类型的有效数据需要每行附带检测结果，格式应为「号码,检测结果」")
		return
	}
	if err := flush(); err != nil {
		apiErr(w, fmt.Sprintf("已写入 %d 条后出错：%v", upserted, err))
		return
	}
	writeJSON(w, map[string]any{"code": 0, "message": "success",
		"parsed": parsed, "upserted": upserted, "skipped": skipped})
}

// ---------- 设置 / 余额 ----------

var trcAddrRe = regexp.MustCompile(`^T[1-9A-HJ-NP-Za-km-z]{33}$`)

func handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var in struct {
			Token       *string `json:"token"`
			Upstream    *string `json:"upstream"`
			UsdtAddress *string `json:"usdtAddress"`
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
		if in.UsdtAddress != nil {
			a := strings.TrimSpace(*in.UsdtAddress)
			if a != "" && !trcAddrRe.MatchString(a) {
				apiErr(w, "USDT 地址格式不对：应为 T 开头的 34 位 TRC20 地址")
				return
			}
			if err := setSetting("usdtAddress", a); err != nil {
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
		"upstream": getSetting("upstream"), "upstreamEffective": upstreamURL(), "upstreamDefault": upstream,
		"usdtAddress": getSetting("usdtAddress")})
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
	c, cancel := ctx()
	defer cancel()

	owners := []map[string]any{}
	if cur, err := colTasks.Aggregate(c, []bson.M{
		{"$group": bson.M{"_id": bson.M{"oid": "$ownerId", "oname": "$ownerName"},
			"n": bson.M{"$sum": 1}, "total": bson.M{"$sum": "$total"},
			"cached": bson.M{"$sum": "$cachedCount"}, "ded": bson.M{"$sum": "$deduction"}}},
		{"$sort": bson.M{"ded": -1, "n": -1}},
	}); err == nil {
		var rows []struct {
			ID struct {
				Oid   string `bson:"oid"`
				Oname string `bson:"oname"`
			} `bson:"_id"`
			N      int     `bson:"n"`
			Total  int     `bson:"total"`
			Cached int     `bson:"cached"`
			Ded    float64 `bson:"ded"`
		}
		if cur.All(c, &rows) == nil {
			for _, r := range rows {
				owners = append(owners, map[string]any{"ownerId": r.ID.Oid, "ownerName": r.ID.Oname,
					"tasks": r.N, "total": r.Total, "cached": r.Cached, "forwarded": r.Total - r.Cached, "deduction": r.Ded})
			}
		}
	}

	storesAgg := []map[string]any{}
	if cur, err := colJobs.Aggregate(c, []bson.M{
		{"$group": bson.M{"_id": "$storeId", "jobs": bson.M{"$sum": 1},
			"count": bson.M{"$sum": "$count"}, "ded": bson.M{"$sum": "$deduction"}}},
		{"$sort": bson.M{"ded": -1}},
	}); err == nil {
		var rows []struct {
			ID    int64   `bson:"_id"`
			Jobs  int     `bson:"jobs"`
			Count int     `bson:"count"`
			Ded   float64 `bson:"ded"`
		}
		if cur.All(c, &rows) == nil {
			for _, r := range rows {
				var s storeDoc
				name := fmt.Sprintf("云仓-%d", r.ID)
				if colStores.FindOne(c, bson.M{"_id": r.ID}).Decode(&s) == nil {
					name = s.Name
				}
				storesAgg = append(storesAgg, map[string]any{"id": r.ID, "name": name,
					"jobs": r.Jobs, "count": r.Count, "deduction": r.Ded})
			}
		}
	}

	var taskDed, jobDed float64
	var taskCached, taskForwarded, jobForwarded int
	if cur, err := colTasks.Aggregate(c, []bson.M{{"$group": bson.M{"_id": nil,
		"ded": bson.M{"$sum": "$deduction"}, "cached": bson.M{"$sum": "$cachedCount"},
		"fwd": bson.M{"$sum": bson.M{"$subtract": []any{"$total", "$cachedCount"}}}}}}); err == nil {
		var rows []struct {
			Ded    float64 `bson:"ded"`
			Cached int     `bson:"cached"`
			Fwd    int     `bson:"fwd"`
		}
		if cur.All(c, &rows) == nil && len(rows) > 0 {
			taskDed, taskCached, taskForwarded = rows[0].Ded, rows[0].Cached, rows[0].Fwd
		}
	}
	if cur, err := colJobs.Aggregate(c, []bson.M{{"$group": bson.M{"_id": nil,
		"ded": bson.M{"$sum": "$deduction"}, "cnt": bson.M{"$sum": "$count"}}}}); err == nil {
		var rows []struct {
			Ded float64 `bson:"ded"`
			Cnt int     `bson:"cnt"`
		}
		if cur.All(c, &rows) == nil && len(rows) > 0 {
			jobDed, jobForwarded = rows[0].Ded, rows[0].Cnt
		}
	}
	storeChecked := int(countDocs(colNumbers, bson.M{"status": bson.M{"$in": []string{"valid", "invalid"}}}))
	// 云仓缓存直出 = 已出结果 - 经作业检测的（含进行中作业会轻微低估，可接受）
	jobIngested := 0
	if cur, err := colJobs.Aggregate(c, []bson.M{
		{"$match": bson.M{"state": "Done"}},
		{"$group": bson.M{"_id": nil, "cnt": bson.M{"$sum": "$count"}}},
	}); err == nil {
		var rows []struct {
			Cnt int `bson:"cnt"`
		}
		if cur.All(c, &rows) == nil && len(rows) > 0 {
			jobIngested = rows[0].Cnt
		}
	}
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
	c, cancel := ctx()
	// 有 pending 号码的仓
	pendingIDs, err := colNumbers.Distinct(c, "storeId", bson.M{"status": "pending"})
	if err != nil {
		cancel()
		return
	}
	// 有未完结作业的仓（跳过）
	activeIDs, _ := colJobs.Distinct(c, "storeId", bson.M{"state": bson.M{"$nin": []string{"Done", "Fail", "Close"}}})
	cancel()
	active := map[int64]bool{}
	for _, v := range activeIDs {
		if id, ok := v.(int64); ok {
			active[id] = true
		}
	}

	for _, v := range pendingIDs {
		storeID, ok := v.(int64)
		if !ok || active[storeID] {
			continue
		}
		c1, cancel1 := ctx()
		var s storeDoc
		err := colStores.FindOne(c1, bson.M{"_id": storeID}).Decode(&s)
		cancel1()
		if err != nil {
			continue
		}
		def, ok := taskTypes[s.TaskType]
		if !ok {
			continue
		}

		c2, cancel2 := context120()
		cur, err := colNumbers.Find(c2, bson.M{"storeId": storeID, "status": "pending"},
			options.Find().SetLimit(100000))
		if err != nil {
			cancel2()
			continue
		}
		var values []string
		for cur.Next(c2) {
			var n numberDoc
			if cur.Decode(&n) == nil {
				values = append(values, n.Value)
			}
		}
		cur.Close(c2)
		cancel2()
		if len(values) == 0 {
			continue
		}

		// 提交前再对一次缓存（可能别的任务刚检测过）
		hits := cacheLookup(def.kind, values, def.ttl)
		now := time.Now().Unix()
		var misses []string
		models := make([]mongo.WriteModel, 0)
		for _, v := range values {
			if h, ok := hits[v]; ok {
				st := "invalid"
				if h.valid {
					st = "valid"
				}
				models = append(models, mongo.NewUpdateOneModel().
					SetFilter(bson.M{"storeId": storeID, "value": v}).
					SetUpdate(bson.M{"$set": bson.M{"status": st, "extra": h.extra, "updatedAt": now}}))
			} else {
				misses = append(misses, v)
			}
		}
		if len(models) > 0 {
			c3, cancel3 := context120()
			_, _ = colNumbers.BulkWrite(c3, models, options.BulkWrite().SetOrdered(false))
			cancel3()
		}
		if len(misses) == 0 {
			continue
		}

		ur, err := upstreamCreateWithToken(token, misses, s.Country, s.TaskType, fmt.Sprintf("云仓-%d", s.ID))
		if err != nil || ur.Code != 0 || ur.Data.TaskID == "" {
			msg := "提交检测失败"
			if err != nil {
				msg += "：" + err.Error()
			} else if ur.Message != "" {
				msg += "：" + ur.Message
			}
			c4, cancel4 := ctx()
			_, _ = colStores.UpdateOne(c4, bson.M{"_id": s.ID},
				bson.M{"$set": bson.M{"lastError": msg, "updatedAt": time.Now().Unix()}})
			cancel4()
			log.Printf("store %d submit: %s", s.ID, msg)
			continue
		}
		jobID := nextSeq("store_jobs")
		c5, cancel5 := context120()
		_, _ = colJobs.InsertOne(c5, jobDoc{
			ID: jobID, StoreID: s.ID, UpstreamID: ur.Data.TaskID, Count: len(misses),
			State: "Waiting", CreatedAt: time.Now().Unix(), Deduction: consumeDeduction(ur.Consume),
		})
		_, _ = colNumbers.UpdateMany(c5,
			bson.M{"storeId": s.ID, "value": bson.M{"$in": misses}, "status": "pending"},
			bson.M{"$set": bson.M{"status": "checking", "jobId": jobID, "updatedAt": time.Now().Unix()}})
		_, _ = colStores.UpdateOne(c5, bson.M{"_id": s.ID},
			bson.M{"$set": bson.M{"lastError": "", "updatedAt": time.Now().Unix()}})
		cancel5()
		log.Printf("store %d submitted %d numbers → %s (job %d)", s.ID, len(misses), ur.Data.TaskID, jobID)
	}
}

func pollStoreJobs(token string) {
	c, cancel := ctx()
	cur, err := colJobs.Find(c, bson.M{"state": bson.M{"$nin": []string{"Done", "Fail", "Close"}}})
	if err != nil {
		cancel()
		return
	}
	var jobs []jobDoc
	_ = cur.All(c, &jobs)
	cancel()

	for _, j := range jobs {
		state, err := upstreamProgressWithToken(token, j.UpstreamID)
		if err != nil {
			continue // 网络抖动下轮再试
		}
		if state != "Finish" && state != "Fail" && state != "Close" {
			c1, cancel1 := ctx()
			_, _ = colJobs.UpdateOne(c1, bson.M{"_id": j.ID}, bson.M{"$set": bson.M{"state": state}})
			cancel1()
			continue
		}
		if state == "Fail" || state == "Close" {
			// 平台失败已退款：号码退回待入仓，下轮重试
			c2, cancel2 := ctx()
			_, _ = colNumbers.UpdateMany(c2, bson.M{"jobId": j.ID},
				bson.M{"$set": bson.M{"status": "pending", "jobId": int64(0)}})
			_, _ = colJobs.UpdateOne(c2, bson.M{"_id": j.ID}, bson.M{"$set": bson.M{"state": state}})
			_, _ = colStores.UpdateOne(c2, bson.M{"_id": j.StoreID},
				bson.M{"$set": bson.M{"lastError": "检测平台返回 " + state + "，已退回待入仓", "updatedAt": time.Now().Unix()}})
			cancel2()
			continue
		}
		// Finish：下载结果，沉淀有效/无效，同时写共享缓存
		text, err := upstreamResultWithToken(token, j.UpstreamID)
		if err != nil {
			log.Printf("store job %d download: %v", j.ID, err)
			continue
		}
		c3, cancel3 := ctx()
		var s storeDoc
		_ = colStores.FindOne(c3, bson.M{"_id": j.StoreID}).Decode(&s)
		cancel3()
		def := taskTypes[s.TaskType]
		validMap := parseResultText(text, def.input)
		now := time.Now().Unix()

		c4, cancel4 := context120()
		cur2, err := colNumbers.Find(c4, bson.M{"jobId": j.ID})
		var vals []string
		if err == nil {
			for cur2.Next(c4) {
				var n numberDoc
				if cur2.Decode(&n) == nil {
					vals = append(vals, n.Value)
				}
			}
			cur2.Close(c4)
		}
		cancel4()

		cacheRows := map[string]struct {
			Valid bool
			Extra string
		}{}
		models := make([]mongo.WriteModel, 0, len(vals))
		for _, v := range vals {
			lookup := v
			if def.input != "phone" {
				lookup = strings.ToLower(v)
			}
			extra, okv := validMap[lookup]
			st := "invalid"
			if okv {
				st = "valid"
			}
			models = append(models, mongo.NewUpdateOneModel().
				SetFilter(bson.M{"jobId": j.ID, "value": v}).
				SetUpdate(bson.M{"$set": bson.M{"status": st, "extra": extra, "jobId": int64(0), "updatedAt": now}}))
			cacheRows[v] = struct {
				Valid bool
				Extra string
			}{okv, extra}
		}
		for i := 0; i < len(models); i += 2000 {
			end := i + 2000
			if end > len(models) {
				end = len(models)
			}
			c5, cancel5 := context120()
			_, _ = colNumbers.BulkWrite(c5, models[i:end], options.BulkWrite().SetOrdered(false))
			cancel5()
		}
		cachePutMany(def.kind, cacheRows, now)
		c6, cancel6 := ctx()
		_, _ = colJobs.UpdateOne(c6, bson.M{"_id": j.ID}, bson.M{"$set": bson.M{"state": "Done"}})
		_, _ = colStores.UpdateOne(c6, bson.M{"_id": j.StoreID},
			bson.M{"$set": bson.M{"lastError": "", "updatedAt": now}})
		cancel6()
		log.Printf("store %d job %d done: %d numbers ingested", j.StoreID, j.ID, len(vals))
	}
}
