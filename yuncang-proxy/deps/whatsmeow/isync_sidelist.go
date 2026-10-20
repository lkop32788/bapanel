package whatsmeow

import (
	"context"
	"fmt"
	"strings"

	waBinary "go.mau.fi/whatsmeow/binary"
	"go.mau.fi/whatsmeow/types"
)

// IsOnWhatsAppSidelist 实现"侍列表(side_list)"式的号码注册检测查询，用于比标准
// interactive 查询更贴近客户端真实 UI 行为（如新建群组时渲染可邀请联系人列表）的
// usync 请求形态，降低被识别为"批量探测号码"的风险。
//
// 协议细节来自对多个独立 go whatsmeow 衍生开源项目中已落地的真实 usync 请求构造
// 逻辑的交叉比对（三份互相独立的实现结构一致），而非 WhatsApp 官方文档，未经真实
// 账号大规模验证——建议先在小规模测试账号上验证可用性和风险表现，再放量使用：
//
//   - usync context 固定为 "interactive"（协议真实支持、已验证的取值；早期实现误把
//     "sidelist" 整个字符串当成 context 传给服务器，服务器不认识这个值会直接静默
//     丢弃请求，表现为检测任务卡在 75 秒 IQ 超时循环、长期 0 进度）
//   - user 列表容器用 "side_list" 而非标准 IsOnWhatsApp 用的 "list"
//   - 每个 user 节点以 attrs 形式标识：jid/lid 填同一个号码 JID 字符串并带
//     addressing_mode=lid（而不是像标准查询那样把手机号塞进 <contact> 子节点），
//     这是已知真实实现里让服务器按 side_list 场景处理该请求的 user 标识方式
//   - query 节点为 {contact(addressing_mode=lid), sidelist, lid, username}
//
// 响应结果可能落在 "list" 或 "side_list" 任一容器下，两者都解析并按 Query 去重。
func (cli *Client) IsOnWhatsAppSidelist(ctx context.Context, phones []string) ([]types.IsOnWhatsAppResponse, error) {
	if cli == nil {
		return nil, ErrClientIsNil
	}

	users := make([]waBinary.Node, len(phones))
	for i, phone := range phones {
		jidStr := types.NewJID(phone, types.LegacyUserServer).String()
		users[i] = waBinary.Node{
			Tag: "user",
			Attrs: waBinary.Attrs{
				"jid":             jidStr,
				"lid":             jidStr,
				"addressing_mode": "lid",
			},
		}
	}

	query := []waBinary.Node{
		{Tag: "contact", Attrs: waBinary.Attrs{"addressing_mode": "lid"}},
		{Tag: "sidelist"},
		{Tag: "lid"},
		{Tag: "username"},
	}

	resp, err := cli.sendIQ(ctx, infoQuery{
		Namespace: "usync",
		Type:      "get",
		To:        types.ServerJID,
		Content: []waBinary.Node{{
			Tag: "usync",
			Attrs: waBinary.Attrs{
				"sid":     cli.generateRequestID(),
				"mode":    "query",
				"last":    "true",
				"index":   "0",
				"context": "interactive",
			},
			Content: []waBinary.Node{
				{Tag: "query", Content: query},
				{Tag: "side_list", Content: users},
			},
		}},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to send usync side_list query: %w", err)
	}

	output := make([]types.IsOnWhatsAppResponse, 0, len(phones))
	seen := make(map[string]struct{}, len(phones))
	querySuffix := "@" + types.LegacyUserServer
	// 真实响应里结果可能落在 list 或 side_list 任一容器，两者都要检查。
	for _, containerTag := range []string{"list", "side_list"} {
		list, ok := resp.GetOptionalChildByTag("usync", containerTag)
		if !ok {
			continue
		}
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
			// 若 jid.Server == "lid"，jid.User 是 LID 号而非手机号，不可用。
			if info.Query == "" {
				if !info.PhoneNumber.IsEmpty() {
					info.Query = info.PhoneNumber.User
				} else if !info.JID.IsEmpty() && info.JID.Server != "lid" {
					info.Query = info.JID.User
				}
			}
			if info.Query == "" {
				continue
			}
			key := strings.TrimPrefix(info.Query, "+")
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			output = append(output, info)
		}
	}
	return output, nil
}
