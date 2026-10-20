package whatsmeow

import (
	"context"
	"strings"

	waBinary "go.mau.fi/whatsmeow/binary"
	"go.mau.fi/whatsmeow/types"
)

// IsOnWhatsAppMode checks phone registration like IsOnWhatsApp but uses the specified
// usync context. 协议层 usync context 属性只能是 "message"/"notification"/"interactive"
// 三者之一；"background" 与原生 GetUserInfo 一致、已验证可用。
// sidelist 场景走独立实现 IsOnWhatsAppSidelist（见 isync_sidelist.go），因为它用的是
// side_list 容器 + user 级 LID 寻址，结构上和这里的 list 容器查询不同，不适合共用本函数。
func (cli *Client) IsOnWhatsAppMode(ctx context.Context, phones []string, syncCtx string) ([]types.IsOnWhatsAppResponse, error) {
	jids := make([]types.JID, len(phones))
	for i := range jids {
		jids[i] = types.NewJID(phones[i], types.LegacyUserServer)
	}
	// 不使用 addressing_mode=lid：WA 服务器可能只返回 LID JID 而不返回 pn_jid，
	// 导致 Query 取到 LID 号而非手机号，全部匹配失败。
	// 不带该属性时服务器使用传统手机号寻址，响应可正常解析。
	list, err := cli.usync(ctx, jids, "query", syncCtx, []waBinary.Node{
		{Tag: "contact"},
	})
	if err != nil {
		return nil, err
	}
	output := make([]types.IsOnWhatsAppResponse, 0, len(jids))
	querySuffix := "@" + types.LegacyUserServer
	for _, child := range list.GetChildren() {
		ag := child.AttrGetter()
		jid := ag.OptionalJIDOrEmpty("jid")
		pnJID := ag.OptionalJIDOrEmpty("pn_jid")
		if child.Tag != "user" || (jid.IsEmpty() && pnJID.IsEmpty()) {
			continue
		}
		var info types.IsOnWhatsAppResponse
		info.JID = jid
		if jid.IsEmpty() {
			info.JID = pnJID
		}
		info.PhoneNumber = pnJID
		contactNode := child.GetChildByTag("contact")
		info.IsIn = contactNode.AttrGetter().String("type") == "in"
		contactQuery, _ := contactNode.Content.([]byte)
		info.Query = strings.TrimSuffix(string(contactQuery), querySuffix)
		// <contact> 无内容时用 pn_jid 或 jid 兜底。
		// 注意：若 jid.Server == HiddenUserServer（LID），jid.User 是 LID 号而非手机号，不可用。
		if info.Query == "" {
			if !info.PhoneNumber.IsEmpty() {
				info.Query = info.PhoneNumber.User
			} else if !info.JID.IsEmpty() && info.JID.Server != "lid" {
				info.Query = info.JID.User
			}
		}
		output = append(output, info)
	}
	return output, nil
}
