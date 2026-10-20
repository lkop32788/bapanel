package main

// WhatsApp Session Factory：用六段凭证登录（whatsmeow），
// 把 session 转成 Baileys creds.json 格式返回给面板直接使用。
//
// POST /api/wa/seg6-login
//   { phone, noisePriv, identityPriv, hash, platform, proxy? }
// 返回：{ code, message, data: { credsB64, jid, platform } }
//   credsB64 = base64(Baileys creds.json)，面板解码后写入 wa_sessions/<wsId>/<slotId>/creds.json

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waAdv"
	"go.mau.fi/whatsmeow/proto/waWa6"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"go.mau.fi/whatsmeow/util/keys"
	"golang.org/x/net/proxy"
	"google.golang.org/protobuf/proto"
)

// ─────────────────────────────────────────────
// 请求 / 响应结构
// ─────────────────────────────────────────────

type Seg6Request struct {
	Phone        string `json:"phone"`
	NoisePriv    string `json:"noisePriv"`
	IdentityPriv string `json:"identityPriv"`
	Hash         string `json:"hash"`
	Platform     string `json:"platform"`
	Proxy        string `json:"proxy"`
}

type WaFactoryResp struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// ─────────────────────────────────────────────
// Baileys creds.json 结构
// Baileys 用 BufferJSON：每个二进制字段序列化成 {type:"Buffer",data:"<base64>"}；
// advSecretKey 例外（initAuthCreds 里就是裸 base64 字符串）。公钥存 32 字节裸
// （Baileys Curve.generateKeyPair 去掉了版本字节），与 X25519 输出一致。
// 登录 vs 二维码只看 creds.me：有 me.id → generateLoginNode 以已配对设备登录。
// ─────────────────────────────────────────────

type bufJSON struct {
	Type string `json:"type"`
	Data string `json:"data"`
}

func buf(b []byte) bufJSON { return bufJSON{Type: "Buffer", Data: b64enc(b)} }

type KeyPair struct {
	Private bufJSON `json:"private"`
	Public  bufJSON `json:"public"`
}

type PreKey struct {
	KeyID     int     `json:"keyId"`
	KeyPair  KeyPair `json:"keyPair"`
	Signature bufJSON `json:"signature"`
}

type meInfo struct {
	ID string `json:"id"`
}

type BaileysCreds struct {
	NoiseKey                KeyPair  `json:"noiseKey"`
	PairingEphemeralKeyPair KeyPair  `json:"pairingEphemeralKeyPair"`
	SignedIdentityKey       KeyPair  `json:"signedIdentityKey"`
	SignedPreKey            PreKey   `json:"signedPreKey"`
	RegistrationID          int      `json:"registrationId"`
	AdvSecretKey            string   `json:"advSecretKey"`
	ProcessedHistoryMessages []any   `json:"processedHistoryMessages"`
	NextPreKeyID            int      `json:"nextPreKeyId"`
	FirstUnuploadedPreKeyID int      `json:"firstUnuploadedPreKeyId"`
	AccountSyncCounter      int      `json:"accountSyncCounter"`
	AccountSettings         struct {
		UnarchiveChats bool `json:"unarchiveChats"`
	} `json:"accountSettings"`
	Registered bool    `json:"registered"`
	Me         *meInfo `json:"me,omitempty"`
}

// ─────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────

func b64pad(s string) string {
	for len(s)%4 != 0 {
		s += "="
	}
	return s
}

func b64enc(b []byte) string {
	return base64.StdEncoding.EncodeToString(b)
}

func b64dec(s string) []byte {
	b, _ := base64.StdEncoding.DecodeString(b64pad(strings.TrimSpace(s)))
	return b
}

// ─────────────────────────────────────────────
// HTTP 客户端（强制 HTTP/1.1）
// ─────────────────────────────────────────────

func newNoH2Client(proxyURL string) (*http.Client, error) {
	transport := &http.Transport{
		DialContext: (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		TLSClientConfig: &tls.Config{NextProtos: []string{"http/1.1"}},
	}

	if proxyURL != "" {
		parsed, err := url.Parse(proxyURL)
		if err != nil {
			return nil, err
		}
		switch parsed.Scheme {
		case "http", "https":
			transport.Proxy = http.ProxyURL(parsed)
		case "socks5":
			px, err := proxy.FromURL(parsed, proxy.Direct)
			if err != nil {
				return nil, err
			}
			pxc, ok := px.(proxy.ContextDialer)
			if !ok {
				return nil, fmt.Errorf("socks5 dialer 不支持")
			}
			transport.DialContext = pxc.DialContext
		default:
			return nil, fmt.Errorf("不支持的代理协议 %q", parsed.Scheme)
		}
	}
	return &http.Client{Transport: transport}, nil
}

// ─────────────────────────────────────────────
// 设备指纹
// ─────────────────────────────────────────────

type FingerInfo struct {
	Mcc, Mnc, OsVersion, Manufacturer, Device, OsBuildNumber, Lc, Lg string
}

func platFromStr(s string) waWa6.ClientPayload_UserAgent_Platform {
	switch s {
	case "1":
		return waWa6.ClientPayload_UserAgent_IOS
	case "10":
		return waWa6.ClientPayload_UserAgent_SMB_ANDROID
	case "12":
		return waWa6.ClientPayload_UserAgent_SMB_IOS
	default:
		return waWa6.ClientPayload_UserAgent_ANDROID
	}
}

func defaultFinger(plat waWa6.ClientPayload_UserAgent_Platform) FingerInfo {
	switch plat {
	case waWa6.ClientPayload_UserAgent_IOS:
		return FingerInfo{
			Mcc: "310", Mnc: "410", OsVersion: "18.0",
			Manufacturer: "Apple", Device: "iPhone16,2", OsBuildNumber: "22A3354",
			Lc: "US", Lg: "en",
		}
	case waWa6.ClientPayload_UserAgent_SMB_IOS:
		return FingerInfo{
			Mcc: "311", Mnc: "480", OsVersion: "17.5.1",
			Manufacturer: "Apple", Device: "iPhone15,2", OsBuildNumber: "21F90",
			Lc: "US", Lg: "en",
		}
	case waWa6.ClientPayload_UserAgent_SMB_ANDROID:
		return FingerInfo{
			Mcc: "510", Mnc: "01", OsVersion: "14",
			Manufacturer: "samsung", Device: "SM-A546E", OsBuildNumber: "UP1A.231005.007",
			Lc: "ID", Lg: "en",
		}
	default:
		return FingerInfo{
			Mcc: "510", Mnc: "11", OsVersion: "13",
			Manufacturer: "XIAOMI", Device: "22101316UG", OsBuildNumber: "TQ1A.221205.012",
			Lc: "ID", Lg: "en",
		}
	}
}

// ─────────────────────────────────────────────
// 6段凭证登录（同步）
// ─────────────────────────────────────────────

func seg6Login(phone, noisePrivB64, identityPrivB64, hashB64, platform, proxyURL string) (jid string, dev *store.Device, err error) {
	noisePriv := b64dec(noisePrivB64)
	identPriv := b64dec(identityPrivB64)
	hashBytes := b64dec(hashB64)

	if len(noisePriv) != 32 || len(identPriv) != 32 || len(hashBytes) < 4 {
		return "", nil, fmt.Errorf("密钥长度错误: noisePriv=%d identityPriv=%d hash=%d（需要 32/32/4+）",
			len(noisePriv), len(identPriv), len(hashBytes))
	}

	plat := platFromStr(platform)
	finger := defaultFinger(plat)

	regID := binary.BigEndian.Uint32(hashBytes[:4])
	advKey := make([]byte, 32)
	copy(advKey, hashBytes)

	dev = &store.Device{}
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

	jidObj := types.NewJID(phone, types.DefaultUserServer)
	dev.ID = &jidObj

	log := waLog.Stdout("WAF:"+phone[:minInt(8, len(phone))], "ERROR", false)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cli := whatsmeow.NewClient(dev, log)

	// 覆盖 GetClientPayload 以注入设备指纹
	cli.GetClientPayload = func() *waWa6.ClientPayload {
		p := dev.GetClientPayload()
		// Platform 必须覆盖（BaseClientPayload 默认是 WEB）
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

	done := make(chan string, 1)
	cli.AddEventHandler(func(evt interface{}) {
		switch v := evt.(type) {
		case *events.Connected:
			done <- cli.Store.ID.String()
		case *events.LoggedOut:
			done <- fmt.Sprintf("!logout:%v", v.Reason)
		case *events.ConnectFailure:
			done <- fmt.Sprintf("!fail:%d:%s", v.Reason, v.Message)
		case *events.ClientOutdated:
			done <- "!outdated"
		}
	})

	if proxyURL != "" {
		hc, herr := newNoH2Client(proxyURL)
		if herr == nil {
			cli.SetWebsocketHTTPClient(hc)
		}
	}

	if err := cli.Connect(); err != nil {
		return "", nil, fmt.Errorf("连接失败: %w", err)
	}
	defer cli.Disconnect()

	select {
	case result := <-done:
		if strings.HasPrefix(result, "!") {
			return "", nil, fmt.Errorf("登录失败: %s", result[1:])
		}
		return result, dev, nil
	case <-ctx.Done():
		return "", nil, fmt.Errorf("登录超时（30s）")
	}
}

// ─────────────────────────────────────────────
// Device → Baileys creds.json
// 公钥直接取 whatsmeow 构造 KeyPair 时用 ScalarBaseMult 算好的 Pub，
// 不要自行 ECDH 反推（私钥对、公钥错会导致 Baileys 握手失败）。
// ─────────────────────────────────────────────

// meID 非空时 creds.me.id=meID 且 registered=true（Baileys 以已配对设备登录）；
// 为空时产出未注册 creds（convert 预览用，Baileys 会走二维码）。
func deviceToBaileysCreds(dev *store.Device, meID string) *BaileysCreds {
	var sigBytes []byte
	if dev.SignedPreKey.Signature != nil {
		sigBytes = dev.SignedPreKey.Signature[:]
	}

	// pairingEphemeralKeyPair 配对后不再用，给个合法随机对占位
	eph := keys.NewKeyPair()

	c := &BaileysCreds{
		NoiseKey: KeyPair{
			Private: buf(dev.NoiseKey.Priv[:]),
			Public:  buf(dev.NoiseKey.Pub[:]),
		},
		PairingEphemeralKeyPair: KeyPair{
			Private: buf(eph.Priv[:]),
			Public:  buf(eph.Pub[:]),
		},
		SignedIdentityKey: KeyPair{
			Private: buf(dev.IdentityKey.Priv[:]),
			Public:  buf(dev.IdentityKey.Pub[:]),
		},
		SignedPreKey: PreKey{
			KeyID: int(dev.SignedPreKey.KeyID),
			KeyPair: KeyPair{
				Private: buf(dev.SignedPreKey.KeyPair.Priv[:]),
				Public:  buf(dev.SignedPreKey.Pub[:]),
			},
			Signature: buf(sigBytes),
		},
		RegistrationID:          int(dev.RegistrationID),
		AdvSecretKey:            b64enc(dev.AdvSecretKey),
		ProcessedHistoryMessages: []any{},
		// 从 100 起避免与原设备已上传的低位 preKeyId 冲突
		NextPreKeyID:            100,
		FirstUnuploadedPreKeyID: 100,
		AccountSyncCounter:      0,
	}
	c.AccountSettings.UnarchiveChats = true
	if meID != "" {
		c.Me = &meInfo{ID: meID}
		c.Registered = true
	}
	return c
}

// baileysMeID 从登录后的 device JID 构造 Baileys me.id：
// 固定 <手机号>:<设备号>@s.whatsapp.net（剥离 agent，保证 Baileys jidDecode 拿到纯数字 user）
func baileysMeID(dev *store.Device) string {
	if dev.ID == nil {
		return ""
	}
	return fmt.Sprintf("%s:%d@s.whatsapp.net", dev.ID.User, dev.ID.Device)
}

// ─────────────────────────────────────────────
// HTTP 端点
// ─────────────────────────────────────────────

func handleWAFLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiErrWA(w, "method not allowed")
		return
	}
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	var req Seg6Request
	if err := json.Unmarshal(body, &req); err != nil {
		apiErrWA(w, "JSON 解析失败: "+err.Error())
		return
	}
	handleSeg6Login(w, &req)
}

func handleSeg6Login(w http.ResponseWriter, req *Seg6Request) {
	phone := strings.TrimSpace(req.Phone)
	var digits strings.Builder
	for _, c := range phone {
		if c >= '0' && c <= '9' {
			digits.WriteRune(c)
		}
	}
	phone = digits.String()
	if len(phone) < 6 {
		apiErrWA(w, "手机号无效")
		return
	}
	if req.NoisePriv == "" || req.IdentityPriv == "" || req.Hash == "" {
		apiErrWA(w, "缺少凭据：noisePriv, identityPriv, hash")
		return
	}
	platform := req.Platform
	if platform == "" {
		platform = "0"
	}

	fmt.Printf("[WAF] 登录请求: phone=%s platform=%s proxy=%s\n", phone, platform, req.Proxy)

	jid, dev, err := seg6Login(phone, req.NoisePriv, req.IdentityPriv, req.Hash, platform, req.Proxy)
	if err != nil {
		fmt.Printf("[WAF] 登录失败 %s: %v\n", phone, err)
		apiErrWA(w, "登录失败: "+err.Error())
		return
	}

	creds := deviceToBaileysCreds(dev, baileysMeID(dev))
	credsJSON, _ := json.Marshal(creds)

	fmt.Printf("[WAF] 登录成功: %s -> %s\n", phone, jid)
	writeJSONWA(w, map[string]any{
		"code":    0,
		"message": "登录成功",
		"data": map[string]any{
			"jid":      jid,
			"phone":    phone,
			"platform": platform,
			"creds":    json.RawMessage(credsJSON),
			"credsB64": base64.StdEncoding.EncodeToString(credsJSON),
		},
	})
}

// handleWAFConvert 仅做格式转换（不实际登录）
func handleWAFConvert(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiErrWA(w, "method not allowed")
		return
	}
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	var req Seg6Request
	if err := json.Unmarshal(body, &req); err != nil {
		apiErrWA(w, "JSON 解析失败: "+err.Error())
		return
	}

	noisePriv := b64dec(req.NoisePriv)
	identPriv := b64dec(req.IdentityPriv)
	hashBytes := b64dec(req.Hash)
	if len(noisePriv) != 32 || len(identPriv) != 32 || len(hashBytes) < 4 {
		apiErrWA(w, fmt.Sprintf("密钥长度错误: noisePriv=%d identityPriv=%d hash=%d", len(noisePriv), len(identPriv), len(hashBytes)))
		return
	}

	regID := binary.BigEndian.Uint32(hashBytes[:4])
	advKey := make([]byte, 32)
	copy(advKey, hashBytes)

	var phoneDigits strings.Builder
	for _, c := range req.Phone {
		if c >= '0' && c <= '9' {
			phoneDigits.WriteRune(c)
		}
	}

	dev := &store.Device{}
	dev.NoiseKey = keys.NewKeyPairFromPrivateKey(*(*[32]byte)(noisePriv))
	dev.IdentityKey = keys.NewKeyPairFromPrivateKey(*(*[32]byte)(identPriv))
	dev.SignedPreKey = dev.IdentityKey.CreateSignedPreKey(1)
	dev.RegistrationID = regID
	dev.AdvSecretKey = advKey
	jidObj := types.NewJID(phoneDigits.String(), types.DefaultUserServer); dev.ID = &jidObj

	creds := deviceToBaileysCreds(dev, "") // 预览：无 me，Baileys 会走二维码
	credsJSON, _ := json.Marshal(creds)

	writeJSONWA(w, map[string]any{
		"code":    0,
		"message": "转换成功（未实际登录）",
		"data": map[string]any{
			"phone":          phoneDigits.String(),
			"registrationId": int(dev.RegistrationID),
			"creds":          json.RawMessage(credsJSON),
			"credsB64":       base64.StdEncoding.EncodeToString(credsJSON),
		},
	})
}

func handleWAFHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSONWA(w, map[string]any{
		"ok":      true,
		"service": "wa-factory",
		"time":    time.Now().Format(time.RFC3339),
	})
}

func apiErrWA(w http.ResponseWriter, msg string) {
	writeJSONWA(w, map[string]any{"code": 1, "message": msg})
}

func writeJSONWA(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(v)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
