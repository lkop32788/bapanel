// 号池（2026-10-19）：WhatsApp Cloud API 多号轮询分配。
// 用在两处：①群发选"号池轮询"时按受众轮流分摊发送号；②客服新开会话/
// 首次回复没有绑定发送号时自动从池里取号，并绑定到会话（粘住：同一客户
// 后续始终用同一个号沟通，不会换脸）。
// 池成员 = 主号 + 未配置独立 WABA/token 的 extraNumbers（同一 WABA，模板
// 通用）；带独立 wabaId/accessToken 的号不进池——它们的模板命名空间不同，
// 轮发模板会被 Meta 拒绝，仍可在群发里手动单选使用。
const Workspace = require('../models/Workspace');

const poolNumbers = (waCfg) => {
  const list = [];
  if (waCfg?.phoneNumberId) list.push(waCfg.phoneNumberId);
  for (const n of (waCfg?.extraNumbers || [])) {
    if (n.phoneNumberId && !n.wabaId && !n.accessToken) list.push(n.phoneNumberId);
  }
  return list;
};

// 原子游标轮询取下一个号；单号/无号时直接返回
async function pickNumber(workspaceId, waCfg) {
  const nums = poolNumbers(waCfg);
  if (!nums.length) return '';
  if (nums.length === 1) return nums[0];
  const w = await Workspace.findOneAndUpdate(
    { _id: workspaceId },
    { $inc: { 'whatsapp.poolCursor': 1 } },
    { new: true, select: 'whatsapp.poolCursor' });
  const cursor = Number(w?.whatsapp?.poolCursor || 0);
  return nums[cursor % nums.length];
}

module.exports = { poolNumbers, pickNumber };
