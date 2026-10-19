// Sends preset campaigns over the WhatsApp QR (Baileys) channel.
// Uses the QR sender adapter (numbered-option buttons, media, lists) and the
// QR warm-up/daily-limit engine; when the daily cap is hit the campaign
// auto-pauses and resumes when quota is available again.
//
// 号池模式（campaign.senderNumberId === 'pool'，2026-10-20）：
// - 每个受众在可用槽位（已连接 + enabled + 今日未达日限额，含 default）间
//   原子轮询取槽发送；已绑定 qr:<slot> 的会话优先用原槽（粘住，客户视角不换号）
// - 某槽发送中达到日限额自动换下一个可用槽重试
// - 全部槽位不可用时沿用原有"自动暂停 + resumePending 恢复"机制
// 非 pool 时行为与旧版完全一致（default 槽）。
const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const Workspace = require('../models/Workspace');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const LIMIT_ERR = /Daily safety limit reached/i;

// slotId 为空 = 旧行为（default 槽，走 botFlowEngine.getSender）；
// 传了 slotId = 号池模式，按槽发送并把新建会话绑定到 'qr:<slotId>'。
async function sendToContact(workspace, campaign, preset, contact, io, slotId) {
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspace._id, contact: contact._id, channel: 'whatsapp_qr' },
    {
      $set: { status: 'active' },
      // 新建会话绑定发送槽位（$setOnInsert：已有会话不覆盖其 waNumberId）
      $setOnInsert: {
        workspace: workspace._id, contact: contact._id, channel: 'whatsapp_qr',
        ...(slotId ? { waNumberId: `qr:${slotId}` } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  // 号池模式：老会话没绑定号的补绑到本次发送槽（仅当为空，不覆盖已有）
  if (slotId && !conversation.waNumberId) {
    try {
      await Conversation.updateOne(
        { _id: conversation._id, $or: [{ waNumberId: null }, { waNumberId: '' }] },
        { $set: { waNumberId: `qr:${slotId}` } }
      );
    } catch (e) { /* noop */ }
  }
  const sender = slotId
    ? require('./waQrService').makeSlotSender(workspace, conversation, slotId)
    : require('./botFlowEngine').getSender(workspace, conversation);
  const { sendPreset } = require('./presetSend');
  const { result, msgType, renderedText } = await sendPreset(sender, contact.phone, preset, contact);
  if (!result?.success) {
    if (LIMIT_ERR.test(result?.error?.message || '')) {
      const err = new Error(result.error.message);
      err.qrLimit = true;
      throw err;
    }
    return false;
  }
  const text = renderedText || preset.body || `[${msgType}]`;
  const msg = await Message.create({
    workspace: workspace._id,
    conversation: conversation._id,
    contact: contact._id,
    direction: 'outbound',
    type: msgType || 'text',
    text,
    media: preset.mediaUrl ? { url: preset.mediaUrl } : undefined,
    waMessageId: result.data?.messages?.[0]?.id || '',
    status: 'sent',
    metadata: { source: 'qr_campaign', campaignId: campaign._id, channel: 'whatsapp_qr', ...(slotId ? { qrSlotId: slotId } : {}) },
  });
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: { text, timestamp: new Date(), direction: 'outbound', type: msgType || 'text' },
    lastMessageAt: new Date(),
  });
  if (io) io.to(`workspace:${workspace._id}`).emit('new_message', { message: msg, conversationId: conversation._id });
  return true;
}

// 号池模式下给单个受众发送：粘住优先 + 限额自动换槽。
// 全部槽位不可用时抛 qrLimit 错误（外层据此自动暂停）。
async function sendViaPool(workspace, campaign, preset, contact, io) {
  const waQr = require('./waQrService');
  // 粘住：会话已绑定 qr:<slot> 且该槽当前可用则继续用原槽
  let slotId = '';
  try {
    const conv = await Conversation.findOne({ workspace: workspace._id, contact: contact._id, channel: 'whatsapp_qr' })
      .select('waNumberId').lean();
    const m = conv && /^qr:(.+)$/.exec(conv.waNumberId || '');
    if (m) {
      const usable = await waQr.usableSlots(workspace._id);
      if (usable.includes(m[1])) slotId = m[1];
    }
  } catch (e) { /* noop */ }
  if (!slotId) slotId = await waQr.pickPoolSlot(workspace._id);
  let attempts = 0;
  let lastErr = null;
  while (slotId) {
    try {
      return await sendToContact(workspace, campaign, preset, contact, io, slotId);
    } catch (e) {
      if (!e.qrLimit) throw e;
      // 该槽发送中达到日限额：换下一个可用槽重试（pickPoolSlot 会自动跳过已满的槽）
      lastErr = e;
      if (++attempts >= 20) break;
      slotId = await waQr.pickPoolSlot(workspace._id);
    }
  }
  const err = lastErr || new Error('Daily safety limit reached (号池所有槽位均不可用或已达日限额)');
  err.qrLimit = true;
  throw err;
}

// Runs (or continues) a QR preset campaign over the given contacts.
async function execute(campaign, workspace, contacts, io) {
  const preset = campaign.presetMessage;
  if (!preset) {
    campaign.status = 'failed';
    await campaign.save();
    return;
  }
  const poolMode = campaign.senderNumberId === 'pool';
  for (let i = 0; i < contacts.length; i++) {
    let contact = contacts[i];
    try {
      // Honor pause/stop requested from the UI while running.
      const fresh = await Campaign.findById(campaign._id).select('status').lean();
      if (!fresh || fresh.status === 'paused' || fresh.status === 'failed') {
        await Campaign.findByIdAndUpdate(campaign._id, { stats: campaign.stats });
        return;
      }
      if (!contact._id) {
        const phone = String(contact.phone || '').replace(/\D/g, '');
        if (!phone) { campaign.stats.skipped++; continue; }
        contact =
          (await Contact.findOne({ workspace: workspace._id, phone: new RegExp(phone + '$') })) ||
          (await Contact.create({ workspace: workspace._id, phone, name: 'WA ' + phone, channel: 'whatsapp_qr' }));
      }
      const ok = poolMode
        ? await sendViaPool(workspace, campaign, preset, contact, io)
        : await sendToContact(workspace, campaign, preset, contact, io);
      if (ok) campaign.stats.sent++;
      else campaign.stats.failed++;
    } catch (e) {
      if (e.qrLimit) {
        // Daily cap reached: pause and remember who is still pending.
        // 号池模式下走到这里 = 全部槽位都满/不可用（单槽满会自动换槽）。
        const remaining = contacts.slice(i)
          .map((c) => (c._id ? String(c._id) : String(c.phone || '')))
          .filter(Boolean);
        campaign.status = 'paused';
        campaign.variables = Object.assign({}, campaign.variables, { qrPending: remaining, qrAutoPaused: true });
        campaign.markModified('variables');
        await campaign.save();
        return;
      }
      campaign.stats.failed++;
    }
  }
  campaign.status = 'completed';
  campaign.completedAt = new Date();
  campaign.variables = Object.assign({}, campaign.variables, { qrPending: [], qrAutoPaused: false });
  campaign.markModified('variables');
  await campaign.save();
  require('./ownerNotify').broadcastDone(campaign).catch(() => {});
}

// Cron hook: continue auto-paused QR campaigns once quota/connection allows.
async function resumePending() {
  const campaigns = await Campaign.find({
    sendChannel: 'whatsapp_qr',
    status: 'paused',
    'variables.qrAutoPaused': true,
  }).populate('presetMessage');
  for (const campaign of campaigns) {
    try {
      const waQr = require('./waQrService');
      if (campaign.senderNumberId === 'pool') {
        // 号池模式：任一槽位可用（已连接且今日未满额）即可恢复
        const usable = await waQr.usableSlots(campaign.workspace);
        if (!usable.length) continue;
      } else {
        const st = await waQr.getStatus(campaign.workspace);
        if (st.status !== 'connected' || st.sentToday >= st.todayCap) continue;
      }
      const workspace = await Workspace.findById(campaign.workspace);
      if (!workspace) continue;
      const pending = (campaign.variables && campaign.variables.qrPending) || [];
      if (!pending.length) {
        campaign.status = 'completed';
        campaign.completedAt = new Date();
        campaign.variables = Object.assign({}, campaign.variables, { qrAutoPaused: false });
        campaign.markModified('variables');
        await campaign.save();
        continue;
      }
      const ids = pending.filter((p) => /^[0-9a-f]{24}$/i.test(p));
      const phones = pending.filter((p) => !/^[0-9a-f]{24}$/i.test(p));
      const contacts = [
        ...(await Contact.find({ _id: { $in: ids }, workspace: workspace._id })),
        ...phones.map((p) => ({ _id: null, phone: p })),
      ];
      campaign.status = 'running';
      campaign.variables = Object.assign({}, campaign.variables, { qrAutoPaused: false });
      campaign.markModified('variables');
      await campaign.save();
      execute(campaign, workspace, contacts, global.io).catch((e) =>
        console.error('[QRCampaign] resume error:', e.message)
      );
    } catch (e) {
      console.error('[QRCampaign] resumePending error:', e.message);
    }
  }
}

module.exports = { execute, resumePending };
