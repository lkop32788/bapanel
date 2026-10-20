package main

// WhatsApp 常驻桥接：用六段凭证登录 whatsmeow 并保持在线，面板通过 external_api
// 渠道收发。入站消息回推面板 webhook；外发由面板内部直调 /api/wa/bridge/send。
//
// 为什么不转 Baileys：六段凭证是主设备(device 0)凭证，Baileys 只支持伴侣设备登录，
// 实测恒 401。whatsmeow 能持有主设备会话，故在本服务常驻。
//
// 持久化：设备(signal 密钥等)存持久 SQLite container（data/wa_store.db，whatsmeow 自管）；
// 路由映射(jid→wsId/slotId/secret/webhook/platform)存 Mongo，启动时据此重连并挂回调。
//
// 端点（均 loopbackOnly）：
//   POST /api/wa/bridge/login    { phone,noisePriv,identityPriv,hash,platform,proxy, wsId,slotId,secret,webhook }
//   POST /api/wa/bridge/send     { wsId,slotId,to,text }
//   POST /api/wa/bridge/logout   { wsId,slotId }
//   GET  /api/wa/bridge/sessions

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waAdv"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/proto/waWa6"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"go.mau.fi/whatsmeow/util/keys"
	"google.golang.org/protobuf/proto"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ─────────────────────────────────────────────
// 会话注册表 + 持久 container
// ─────────────────────────────────────────────

type waBridgeSession struct {
	cli     *whatsmeow.Client
	jid     string
	phone   string
	wsID    string
	slotID  string
	secret  string
	webhook string // 面板根地址，如 https://ws.37182.club
	plat    string
	status  string
}

var (
	waBridgeContainer *sqlstore.Container
	waBridgeInitErr   error
	waBridgeOnce      sync.Once
	waSessions        = map[string]*waBridgeSession{} // key: wsId:slotId
	waSessionsMu      sync.RWMutex
	waInboundClient   = &http.Client{Timeout: 15 * time.Second}
)

func bridgeCol() *mongo.Collection { return mdb.Collection("wa_bridge_sessions") }
func slotKey(wsID, slotID string) string { return wsID + ":" + slotID }

func initWaBridge() error {
	waBridgeOnce.Do(func() {
		log := waLog.Stdout("WA-STORE", "ERROR", false)
		dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)", filepath.Join(dataDir, "wa_store.db"))
		c, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		waBridgeContainer, waBridgeInitErr = sqlstore.New(c, "sqlite", dsn, log)
		if waBridgeInitErr == nil {
			_, _ = bridgeCol().Indexes().CreateOne(c, mongo.IndexModel{
				Keys: bson.D{{Key: "wsId", Value: 1}, {Key: "slotId", Value: 1}}, Options: options.Index().SetUnique(true),
			})
		}
	})
	return waBridgeInitErr
}

func registerSession(s *waBridgeSession) {
	waSessionsMu.Lock()
	waSessions[slotKey(s.wsID, s.slotID)] = s
	waSessionsMu.Unlock()
}

func getSession(wsID, slotID string) *waBridgeSession {
	waSessionsMu.RLock()
	defer waSessionsMu.RUnlock()
	return waSessions[slotKey(wsID, slotID)]
}

// ─────────────────────────────────────────────
// 设备构造 + 设备指纹（复用 wa_factory.go 的 b64dec / platFromStr / defaultFinger）
// ─────────────────────────────────────────────

func bridgeBuildDevice(dev *store.Device, noisePriv, identPriv, hashBytes []byte) {
	regID := binary.BigEndian.Uint32(hashBytes[:4])
	advKey := make([]byte, 32)
	copy(advKey, hashBytes)
	dev.NoiseKey = keys.NewKeyPairFromPrivateKey(*(*[32]byte)(noisePriv))
	dev.IdentityKey = keys.NewKeyPairFromPrivateKey(*(*[32]byte)(identPriv))
	dev.RegistrationID = regID
	dev.AdvSecretKey = advKey
	dev.Account = &waAdv.ADVSignedDeviceIdentity{
		Details:             []byte{},
		AccountSignature:    make([]byte, 64),
		AccountSignatureKey: make([]byte, 32),
		DeviceSignature:     make([]byte, 64),
	}
	dev.SignedPreKey = dev.IdentityKey.CreateSignedPreKey(1)
}

func bridgeApplyFinger(cli *whatsmeow.Client, dev *store.Device, platform string) {
	plat := platFromStr(platform)
	finger := defaultFinger(plat)
	cli.GetClientPayload = func() *waWa6.ClientPayload {
		p := dev.GetClientPayload()
		p.UserAgent.Platform = plat.Enum()
		p.UserAgent.AppVersion = store.GetWAVersion().ProtoAppVersion()
		p.UserAgent.Mcc = proto.String(finger.Mcc)
		p.UserAgent.Mnc = proto.String(finger.Mnc)
		p.UserAgent.OsVersion = proto.String(finger.OsVersion)
		p.UserAgent.Manufacturer = proto.String(finger.Manufacturer)
		p.UserAgent.Device = proto.String(finger.Device)
		p.UserAgent.OsBuildNumber = proto.String(finger.OsBuildNumber)
		p.UserAgent.LocaleLanguageIso6391 = proto.String(finger.Lg)
		p.UserAgent.LocaleCountryIso31661Alpha2 = proto.String(finger.Lc)
		return p
	}
}

// 挂事件回调（持久）：入站转发、登出标记、状态跟踪
func (s *waBridgeSession) attachHandlers(ready chan<- error) {
	s.cli.AddEventHandler(func(evt interface{}) {
		switch v := evt.(type) {
		case *events.Connected:
			if s.cli.Store.ID != nil {
				s.jid = s.cli.Store.ID.String()
			}
			s.status = "connected"
			if ready != nil {
				select { case ready <- nil: default: }
			}
		case *events.LoggedOut:
			s.status = "logged_out"
			if ready != nil {
				select { case ready <- fmt.Errorf("logout:%v", v.Reason): default: }
			}
			s.updateStatusDB("logged_out")
		case *events.ConnectFailure:
			if ready != nil {
				select { case ready <- fmt.Errorf("fail:%d:%s", v.Reason, v.Message): default: }
			}
		case *events.Disconnected:
			if s.status == "connected" {
				s.status = "disconnected"
			}
		case *events.Message:
			s.onMessage(v)
		}
	})
}

// ─────────────────────────────────────────────
// 入站：whatsmeow 收到消息 → 回推面板 external_api webhook
// ─────────────────────────────────────────────

func extractText(m *waE2E.Message) string {
	if m == nil {
		return ""
	}
	if c := m.GetConversation(); c != "" {
		return c
	}
	if e := m.GetExtendedTextMessage(); e != nil {
		return e.GetText()
	}
	return ""
}

func (s *waBridgeSession) onMessage(v *events.Message) {
	if v.Info.IsFromMe || v.Info.IsGroup { // 一期：只处理 1:1、非自己发的
		return
	}
	text := extractText(v.Message)
	if text == "" { // 一期：只文本
		return
	}
	payload := map[string]any{
		"from":      v.Info.Sender.User,
		"type":      "text",
		"text":      text,
		"messageId": v.Info.ID,
	}
	body, _ := json.Marshal(payload)
	url := fmt.Sprintf("%s/api/webhook/extapi/%s/%s?secret=%s",
		strings.TrimRight(s.webhook, "/"), s.wsID, s.slotID, s.secret)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := waInboundClient.Do(req)
	if err != nil {
		fmt.Printf("[WABridge] 入站回推失败 %s→%s: %v\n", s.phone, s.wsID, err)
		return
	}
	resp.Body.Close()
}

func (s *waBridgeSession) updateStatusDB(status string) {
	c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = bridgeCol().UpdateOne(c,
		bson.M{"wsId": s.wsID, "slotId": s.slotID},
		bson.M{"$set": bson.M{"status": status, "updatedAt": time.Now()}})
}

// ─────────────────────────────────────────────
// 登录并常驻
// ─────────────────────────────────────────────

type bridgeLoginReq struct {
	Phone        string `json:"phone"`
	NoisePriv    string `json:"noisePriv"`
	IdentityPriv string `json:"identityPriv"`
	Hash         string `json:"hash"`
	Platform     string `json:"platform"`
	Proxy        string `json:"proxy"`
	WsID         string `json:"wsId"`
	SlotID       string `json:"slotId"`
	Secret       string `json:"secret"`
	Webhook      string `json:"webhook"`
}

func bridgeLoginPersist(p *bridgeLoginReq) (*waBridgeSession, error) {
	if err := initWaBridge(); err != nil {
		return nil, fmt.Errorf("打开会话库失败: %w", err)
	}
	noisePriv := b64dec(p.NoisePriv)
	identPriv := b64dec(p.IdentityPriv)
	hashBytes := b64dec(p.Hash)
	if len(noisePriv) != 32 || len(identPriv) != 32 || len(hashBytes) < 4 {
		return nil, fmt.Errorf("密钥长度错误: noisePriv=%d identityPriv=%d hash=%d", len(noisePriv), len(identPriv), len(hashBytes))
	}
	phone := onlyDigits(p.Phone)
	if len(phone) < 6 {
		return nil, fmt.Errorf("手机号无效")
	}

	// 同槽位重复导入：先下掉旧会话
	if old := getSession(p.WsID, p.SlotID); old != nil && old.cli != nil {
		old.cli.Disconnect()
	}

	log := waLog.Stdout("WAB:"+phone[:minInt(8, len(phone))], "ERROR", false)
	dev := waBridgeContainer.NewDevice()
	bridgeBuildDevice(dev, noisePriv, identPriv, hashBytes)
	j := types.NewJID(phone, types.DefaultUserServer)
	dev.ID = &j

	cli := whatsmeow.NewClient(dev, log)
	bridgeApplyFinger(cli, dev, p.Platform)

	sess := &waBridgeSession{
		cli: cli, phone: phone, wsID: p.WsID, slotID: p.SlotID,
		secret: p.Secret, webhook: p.Webhook, plat: p.Platform, status: "connecting",
	}
	ready := make(chan error, 1)
	sess.attachHandlers(ready)

	if proxyURL := strings.TrimSpace(p.Proxy); proxyURL != "" {
		if hc, herr := newNoH2Client(proxyURL); herr == nil {
			cli.SetWebsocketHTTPClient(hc)
		}
	}

	if err := cli.Connect(); err != nil {
		return nil, fmt.Errorf("连接失败: %w", err)
	}
	select {
	case err := <-ready:
		if err != nil {
			cli.Disconnect()
			return nil, fmt.Errorf("登录失败: %s", err.Error())
		}
	case <-time.After(35 * time.Second):
		cli.Disconnect()
		return nil, fmt.Errorf("登录超时")
	}

	registerSession(sess)
	// 持久化路由映射（设备密钥已由 container 自动存 SQLite）
	c, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, _ = bridgeCol().UpdateOne(c,
		bson.M{"wsId": sess.wsID, "slotId": sess.slotID},
		bson.M{"$set": bson.M{
			"jid": sess.jid, "phone": sess.phone, "secret": sess.secret,
			"webhook": sess.webhook, "platform": sess.plat, "proxy": p.Proxy,
			"status": "connected", "updatedAt": time.Now(),
		}, "$setOnInsert": bson.M{"createdAt": time.Now()}},
		options.Update().SetUpsert(true))

	fmt.Printf("[WABridge] 常驻登录成功: %s → %s (ws=%s slot=%s)\n", phone, sess.jid, sess.wsID, sess.slotID)
	return sess, nil
}

// ─────────────────────────────────────────────
// 启动重连：读 Mongo 映射 + container 设备，逐个重连
// ─────────────────────────────────────────────

func restoreWaBridge() {
	if err := initWaBridge(); err != nil {
		fmt.Printf("[WABridge] 会话库打开失败，跳过重连: %v\n", err)
		return
	}
	c, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cur, err := bridgeCol().Find(c, bson.M{"status": bson.M{"$ne": "logged_out"}})
	if err != nil {
		return
	}
	var maps []struct {
		JID      string `bson:"jid"`
		Phone    string `bson:"phone"`
		WsID     string `bson:"wsId"`
		SlotID   string `bson:"slotId"`
		Secret   string `bson:"secret"`
		Webhook  string `bson:"webhook"`
		Platform string `bson:"platform"`
	}
	if err := cur.All(c, &maps); err != nil {
		return
	}
	devices, err := waBridgeContainer.GetAllDevices(c)
	if err != nil {
		fmt.Printf("[WABridge] 读取设备失败: %v\n", err)
		return
	}
	byJID := map[string]*store.Device{}
	for _, d := range devices {
		if d.ID != nil {
			byJID[d.ID.String()] = d
		}
	}
	n := 0
	for _, m := range maps {
		dev := byJID[m.JID]
		if dev == nil {
			continue // 设备丢失（库被清），跳过
		}
		log := waLog.Stdout("WAB:"+m.Phone[:minInt(8, len(m.Phone))], "ERROR", false)
		cli := whatsmeow.NewClient(dev, log)
		bridgeApplyFinger(cli, dev, m.Platform)
		sess := &waBridgeSession{
			cli: cli, jid: m.JID, phone: m.Phone, wsID: m.WsID, slotID: m.SlotID,
			secret: m.Secret, webhook: m.Webhook, plat: m.Platform, status: "connecting",
		}
		sess.attachHandlers(nil)
		registerSession(sess)
		if err := cli.Connect(); err != nil {
			fmt.Printf("[WABridge] 重连失败 %s: %v\n", m.Phone, err)
			continue
		}
		n++
	}
	fmt.Printf("[WABridge] 启动重连 %d 个常驻会话\n", n)
}

// ─────────────────────────────────────────────
// HTTP 端点
// ─────────────────────────────────────────────

func handleBridgeLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiErrWA(w, "method not allowed")
		return
	}
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	var req bridgeLoginReq
	if err := json.Unmarshal(body, &req); err != nil {
		apiErrWA(w, "JSON 解析失败: "+err.Error())
		return
	}
	if req.WsID == "" || req.SlotID == "" || req.Secret == "" || req.Webhook == "" {
		apiErrWA(w, "缺少 wsId/slotId/secret/webhook")
		return
	}
	sess, err := bridgeLoginPersist(&req)
	if err != nil {
		fmt.Printf("[WABridge] 登录失败 %s: %v\n", req.Phone, err)
		apiErrWA(w, err.Error())
		return
	}
	writeJSONWA(w, map[string]any{"code": 0, "message": "登录成功", "data": map[string]any{
		"jid": sess.jid, "phone": sess.phone,
	}})
}

func handleBridgeSend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiErrWA(w, "method not allowed")
		return
	}
	body, _ := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	var req struct {
		WsID   string `json:"wsId"`
		SlotID string `json:"slotId"`
		To     string `json:"to"`
		Text   string `json:"text"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		apiErrWA(w, "JSON 解析失败: "+err.Error())
		return
	}
	sess := getSession(req.WsID, req.SlotID)
	if sess == nil || sess.cli == nil || !sess.cli.IsConnected() {
		apiErrWA(w, "会话未连接")
		return
	}
	to := onlyDigits(req.To)
	if len(to) < 6 || req.Text == "" {
		apiErrWA(w, "收件人或内容无效")
		return
	}
	toJID := types.NewJID(to, types.DefaultUserServer)
	c, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	resp, err := sess.cli.SendMessage(c, toJID, &waE2E.Message{Conversation: proto.String(req.Text)})
	if err != nil {
		apiErrWA(w, "发送失败: "+err.Error())
		return
	}
	writeJSONWA(w, map[string]any{"code": 0, "message": "已发送", "data": map[string]any{"messageId": resp.ID}})
}

func handleBridgeLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiErrWA(w, "method not allowed")
		return
	}
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	var req struct {
		WsID   string `json:"wsId"`
		SlotID string `json:"slotId"`
	}
	_ = json.Unmarshal(body, &req)
	sess := getSession(req.WsID, req.SlotID)
	if sess != nil && sess.cli != nil {
		_ = sess.cli.Logout(context.Background())
		sess.cli.Disconnect()
		waSessionsMu.Lock()
		delete(waSessions, slotKey(req.WsID, req.SlotID))
		waSessionsMu.Unlock()
	}
	c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = bridgeCol().DeleteOne(c, bson.M{"wsId": req.WsID, "slotId": req.SlotID})
	writeJSONWA(w, map[string]any{"code": 0, "message": "已下线"})
}

func handleBridgeSessions(w http.ResponseWriter, _ *http.Request) {
	waSessionsMu.RLock()
	defer waSessionsMu.RUnlock()
	out := make([]map[string]any, 0, len(waSessions))
	for _, s := range waSessions {
		connected := s.cli != nil && s.cli.IsConnected()
		out = append(out, map[string]any{
			"wsId": s.wsID, "slotId": s.slotID, "phone": s.phone,
			"jid": s.jid, "status": s.status, "connected": connected,
		})
	}
	writeJSONWA(w, map[string]any{"code": 0, "data": out})
}

func onlyDigits(s string) string {
	var b strings.Builder
	for _, c := range s {
		if c >= '0' && c <= '9' {
			b.WriteRune(c)
		}
	}
	return b.String()
}
