package main

// Mongo 存储层（2026-10-19 由 SQLite 迁来，应对缓存长期增长）。
// 连接本机 MongoDB（与面板共用实例、独立库 yuncang）。
// 环境变量：YC_MONGO_URI(默认 mongodb://127.0.0.1:27017) YC_MONGO_DB(默认 yuncang)
//
// 集合：
//   cache         {kind, value, valid, extra, checkedAt}   唯一索引 {kind,value}
//   tasks         {_id(本地任务号), upstreamId, taskType, country, name, total,
//                  cachedCount, cachedValid, state, ingested, createdAt, ownerId, ownerName, deduction}
//   task_items    {taskId, value, source(hit|miss), valid, extra}  索引 {taskId}
//   stores        {_id(自增int), name, remark, country, taskType, lastError, createdAt, updatedAt}
//   store_numbers {storeId, value, status(pending|checking|valid|invalid), jobId, extra, updatedAt}
//                  唯一索引 {storeId,value}，索引 {storeId,status} {jobId}
//   store_jobs    {_id(自增int), storeId, upstreamId, count, state, createdAt, deduction}
//   settings      {_id(k), v}
//   counters      {_id(name), seq}   自增序号（stores/store_jobs 的数字 id）

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	mdb        *mongo.Database
	colCache   *mongo.Collection
	colTasks   *mongo.Collection
	colItems   *mongo.Collection
	colStores  *mongo.Collection
	colNumbers *mongo.Collection
	colJobs    *mongo.Collection
	colSet     *mongo.Collection
	colCnt     *mongo.Collection
)

func ctx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 30*time.Second)
}

// 大批量读写用的长超时上下文
func context120() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 120*time.Second)
}

func optFindSortLimit(field string, dir int, limit int64) *options.FindOptions {
	return options.Find().SetSort(bson.D{{Key: field, Value: dir}}).SetLimit(limit)
}

func initMongo() {
	uri := envOr("YC_MONGO_URI", "mongodb://127.0.0.1:27017")
	dbName := envOr("YC_MONGO_DB", "yuncang")
	c, cancel := ctx()
	defer cancel()
	client, err := mongo.Connect(c, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatal("mongo connect: ", err)
	}
	if err := client.Ping(c, nil); err != nil {
		log.Fatal("mongo ping: ", err)
	}
	mdb = client.Database(dbName)
	colCache = mdb.Collection("cache")
	colTasks = mdb.Collection("tasks")
	colItems = mdb.Collection("task_items")
	colStores = mdb.Collection("stores")
	colNumbers = mdb.Collection("store_numbers")
	colJobs = mdb.Collection("store_jobs")
	colSet = mdb.Collection("settings")
	colCnt = mdb.Collection("counters")

	uniq := options.Index().SetUnique(true)
	_, _ = colCache.Indexes().CreateOne(c, mongo.IndexModel{Keys: bson.D{{Key: "kind", Value: 1}, {Key: "value", Value: 1}}, Options: uniq})
	_, _ = colCache.Indexes().CreateOne(c, mongo.IndexModel{Keys: bson.D{{Key: "kind", Value: 1}, {Key: "checkedAt", Value: 1}}})
	_, _ = colItems.Indexes().CreateOne(c, mongo.IndexModel{Keys: bson.D{{Key: "taskId", Value: 1}}})
	_, _ = colNumbers.Indexes().CreateOne(c, mongo.IndexModel{Keys: bson.D{{Key: "storeId", Value: 1}, {Key: "value", Value: 1}}, Options: uniq})
	_, _ = colNumbers.Indexes().CreateOne(c, mongo.IndexModel{Keys: bson.D{{Key: "storeId", Value: 1}, {Key: "status", Value: 1}}})
	_, _ = colNumbers.Indexes().CreateOne(c, mongo.IndexModel{Keys: bson.D{{Key: "jobId", Value: 1}}})
	_, _ = colTasks.Indexes().CreateOne(c, mongo.IndexModel{Keys: bson.D{{Key: "createdAt", Value: -1}}})
}

// ---------- 通用 ----------

func nextSeq(name string) int64 {
	c, cancel := ctx()
	defer cancel()
	var doc struct {
		Seq int64 `bson:"seq"`
	}
	after := options.After
	err := colCnt.FindOneAndUpdate(c,
		bson.M{"_id": name},
		bson.M{"$inc": bson.M{"seq": int64(1)}},
		options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(after),
	).Decode(&doc)
	if err != nil {
		log.Printf("nextSeq %s: %v", name, err)
		return time.Now().UnixNano() // 兜底：极端失败时用时间戳避免冲突
	}
	return doc.Seq
}

func getSetting(k string) string {
	c, cancel := ctx()
	defer cancel()
	var doc struct {
		V string `bson:"v"`
	}
	if err := colSet.FindOne(c, bson.M{"_id": k}).Decode(&doc); err != nil {
		return ""
	}
	return doc.V
}

func setSetting(k, v string) error {
	c, cancel := ctx()
	defer cancel()
	_, err := colSet.UpdateOne(c, bson.M{"_id": k}, bson.M{"$set": bson.M{"v": v}}, options.Update().SetUpsert(true))
	return err
}

// ---------- 缓存 ----------

type cacheDoc struct {
	Kind      string `bson:"kind"`
	Value     string `bson:"value"`
	Valid     bool   `bson:"valid"`
	Extra     string `bson:"extra"`
	CheckedAt int64  `bson:"checkedAt"`
}

func cacheLookup(kind string, values []string, ttl time.Duration) map[string]cacheHit {
	hits := map[string]cacheHit{}
	minTime := time.Now().Add(-ttl).Unix()
	for i := 0; i < len(values); i += 1000 {
		end := i + 1000
		if end > len(values) {
			end = len(values)
		}
		c, cancel := ctx()
		cur, err := colCache.Find(c, bson.M{"kind": kind, "checkedAt": bson.M{"$gte": minTime}, "value": bson.M{"$in": values[i:end]}})
		if err != nil {
			cancel()
			log.Printf("cacheLookup: %v", err)
			continue
		}
		for cur.Next(c) {
			var d cacheDoc
			if cur.Decode(&d) == nil {
				hits[d.Value] = cacheHit{d.Valid, d.Extra}
			}
		}
		cur.Close(c)
		cancel()
	}
	return hits
}

// 批量写缓存（upsert）
func cachePutMany(kind string, rows map[string]struct {
	Valid bool
	Extra string
}, now int64) {
	if len(rows) == 0 {
		return
	}
	models := make([]mongo.WriteModel, 0, len(rows))
	for v, r := range rows {
		models = append(models, mongo.NewReplaceOneModel().
			SetFilter(bson.M{"kind": kind, "value": v}).
			SetReplacement(cacheDoc{Kind: kind, Value: v, Valid: r.Valid, Extra: r.Extra, CheckedAt: now}).
			SetUpsert(true))
	}
	for i := 0; i < len(models); i += 2000 {
		end := i + 2000
		if end > len(models) {
			end = len(models)
		}
		c, cancel := ctx()
		_, err := colCache.BulkWrite(c, models[i:end], options.BulkWrite().SetOrdered(false))
		cancel()
		if err != nil {
			log.Printf("cachePutMany: %v", err)
		}
	}
}

// 批量写缓存并返回真实写入数（新增 + 修改）。与 cachePutMany 的区别：
// 错误上抛给调用方反馈用户（历史导入），不能只记日志吞掉。
func cacheWriteBatch(kind string, rows []cacheDoc, now int64) (int64, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	models := make([]mongo.WriteModel, 0, len(rows))
	for _, d := range rows {
		d.Kind, d.CheckedAt = kind, now
		models = append(models, mongo.NewReplaceOneModel().
			SetFilter(bson.M{"kind": kind, "value": d.Value}).
			SetReplacement(d).SetUpsert(true))
	}
	var written int64
	for i := 0; i < len(models); i += 2000 {
		end := i + 2000
		if end > len(models) {
			end = len(models)
		}
		c, cancel := context120()
		res, err := colCache.BulkWrite(c, models[i:end], options.BulkWrite().SetOrdered(false))
		cancel()
		if res != nil {
			written += res.UpsertedCount + res.ModifiedCount
		}
		if err != nil {
			return written, err
		}
	}
	return written, nil
}

// ---------- 任务 ----------

type taskDoc struct {
	ID          string  `bson:"_id"`
	UpstreamID  string  `bson:"upstreamId"`
	TaskType    string  `bson:"taskType"`
	Country     string  `bson:"country"`
	Name        string  `bson:"name"`
	Total       int     `bson:"total"`
	CachedCount int     `bson:"cachedCount"`
	CachedValid int     `bson:"cachedValid"`
	State       string  `bson:"state"`
	Ingested    int     `bson:"ingested"`
	CreatedAt   int64   `bson:"createdAt"`
	OwnerID     string  `bson:"ownerId"`
	OwnerName   string  `bson:"ownerName"`
	Deduction   float64 `bson:"deduction"`
}

type itemDoc struct {
	TaskID string `bson:"taskId"`
	Value  string `bson:"value"`
	Source string `bson:"source"`
	Valid  bool   `bson:"valid"`
	Extra  string `bson:"extra"`
}

func insertTask(t taskDoc, items []itemDoc) error {
	c, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	if _, err := colTasks.InsertOne(c, t); err != nil {
		return err
	}
	docs := make([]interface{}, len(items))
	for i := range items {
		docs[i] = items[i]
	}
	for i := 0; i < len(docs); i += 5000 {
		end := i + 5000
		if end > len(docs) {
			end = len(docs)
		}
		if _, err := colItems.InsertMany(c, docs[i:end], options.InsertMany().SetOrdered(false)); err != nil {
			return err
		}
	}
	return nil
}

func getTask(id string) *taskRow {
	c, cancel := ctx()
	defer cancel()
	var d taskDoc
	if err := colTasks.FindOne(c, bson.M{"_id": id}).Decode(&d); err != nil {
		return nil
	}
	return &taskRow{ID: d.ID, UpstreamID: d.UpstreamID, TaskType: d.TaskType, Country: d.Country,
		Name: d.Name, State: d.State, Total: d.Total, CachedCount: d.CachedCount, CachedValid: d.CachedValid, Ingested: d.Ingested}
}

func updateTaskState(id, state string) {
	c, cancel := ctx()
	defer cancel()
	_, _ = colTasks.UpdateOne(c, bson.M{"_id": id}, bson.M{"$set": bson.M{"state": state}})
}

func taskMissValues(taskID string) []string {
	c, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	cur, err := colItems.Find(c, bson.M{"taskId": taskID, "source": "miss"})
	if err != nil {
		return nil
	}
	defer cur.Close(c)
	var out []string
	for cur.Next(c) {
		var d itemDoc
		if cur.Decode(&d) == nil {
			out = append(out, d.Value)
		}
	}
	return out
}

// 结果入库：更新 miss 项的判定 + 写共享缓存 + 标记 ingested
func ingestTaskResult(taskID, kind string, missVals []string, validMap map[string]string, phoneInput bool, now int64) {
	cacheRows := map[string]struct {
		Valid bool
		Extra string
	}{}
	models := make([]mongo.WriteModel, 0, len(missVals))
	for _, v := range missVals {
		lookup := v
		if !phoneInput {
			lookup = lowerASCII(v)
		}
		extra, ok := validMap[lookup]
		models = append(models, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"taskId": taskID, "value": v, "source": "miss"}).
			SetUpdate(bson.M{"$set": bson.M{"valid": ok, "extra": extra}}))
		cacheRows[v] = struct {
			Valid bool
			Extra string
		}{ok, extra}
	}
	for i := 0; i < len(models); i += 2000 {
		end := i + 2000
		if end > len(models) {
			end = len(models)
		}
		c, cancel := ctx()
		_, err := colItems.BulkWrite(c, models[i:end], options.BulkWrite().SetOrdered(false))
		cancel()
		if err != nil {
			log.Printf("ingest items: %v", err)
		}
	}
	cachePutMany(kind, cacheRows, now)
	c, cancel := ctx()
	defer cancel()
	_, _ = colTasks.UpdateOne(c, bson.M{"_id": taskID}, bson.M{"$set": bson.M{"ingested": 1}})
}

func taskHitItems(taskID string) [][2]string {
	c, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	cur, err := colItems.Find(c, bson.M{"taskId": taskID, "source": "hit", "valid": true})
	if err != nil {
		return nil
	}
	defer cur.Close(c)
	var out [][2]string
	for cur.Next(c) {
		var d itemDoc
		if cur.Decode(&d) == nil {
			out = append(out, [2]string{d.Value, d.Extra})
		}
	}
	return out
}

func countDocs(col *mongo.Collection, filter bson.M) int64 {
	c, cancel := ctx()
	defer cancel()
	n, _ := col.CountDocuments(c, filter)
	return n
}

func lowerASCII(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'A' && b[i] <= 'Z' {
			b[i] += 32
		}
	}
	return string(b)
}
