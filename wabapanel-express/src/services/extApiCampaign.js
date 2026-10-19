// 外部 API 渠道群发 — 通过运营者自配的 HTTP endpoint 逐条发送。
// 结构同 chatAppCampaign.js（无暖机/日限，直接发送）
const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const extSvc = require('./externalApiService');

const CHANNEL = 'external_api';

async function sendToContact(workspace, campaign, preset, contact, slotId, io) {
  const waNumberId = `ext:${slotId}`;
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspace._id, contact: contact._id, channel: CHANNEL, waNumberId },
    { workspace: workspace._id, contact: contact._id, channel: CHANNEL, waNumberId, status: 'active' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // 简单文本/媒体发送（不走 presetSend 模板变量渲染，直接 HTTP POST）
  const body = String(preset.body || '').replace(/\{\{name\}\}/gi, contact.name || contact.phone);
  const payload = { type: preset.mediaUrl ? 'image' : 'text', text: body };
  if (preset.mediaUrl) { payload.media = { url: preset.mediaUrl, caption: body }; payload.text = undefined; }

  const result = await extSvc.sendMessage(workspace._id, contact.phone, payload, slotId);
  const msgId = result?.messageId ? 'ext_' + result.messageId : '';
  const msg = await Message.create({
    workspace: workspace._id,
    conversation: conversation._id,
    contact: contact._id,
    direction: 'outbound',
    type: payload.type,
    text: body,
    media: preset.mediaUrl ? { url: preset.mediaUrl } : undefined,
    waMessageId: msgId,
    status: 'sent',
    metadata: { source: 'extapi_campaign', campaignId: campaign._id },
  });
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: { text: body, timestamp: new Date(), direction: 'outbound', type: payload.type },
    lastMessageAt: new Date(),
  });
  if (io) io.to(`workspace:${workspace._id}`).emit('new_message', { message: msg, conversationId: conversation._id });
  return true;
}

async function execute(campaign, workspace, contacts, io) {
  const preset = campaign.presetMessage;
  if (!preset) { campaign.status = 'failed'; await campaign.save(); return; }

  // 号池：每次群发从可用槽轮询（不粘会话，群发结束后会话 waNumberId 不写回）
  const slots = (workspace.externalApiSlots || []).filter((s) => s.enabled && s.endpoint);
  if (!slots.length) {
    await Campaign.findByIdAndUpdate(campaign._id, { status: 'failed', $set: { 'stats.failed': contacts.length } });
    return;
  }
  let cursor = 0;

  for (const rawContact of contacts) {
    let contact = rawContact;
    try {
      const fresh = await Campaign.findById(campaign._id).select('status').lean();
      if (!fresh || fresh.status === 'paused' || fresh.status === 'failed') {
        await Campaign.findByIdAndUpdate(campaign._id, { stats: campaign.stats });
        return;
      }
      if (!contact._id) {
        const found = await Contact.findOne({ workspace: workspace._id, phone: new RegExp(contact.phone + '$') });
        if (!found) { campaign.stats.skipped++; continue; }
        contact = found;
      }
      const slotId = slots[cursor % slots.length].slotId;
      cursor++;
      await sendToContact(workspace, campaign, preset, contact, slotId, io);
      campaign.stats.sent++;
    } catch (e) {
      console.error('[ExtApiCampaign] contact error:', e.message);
      campaign.stats.failed++;
    }
    await Campaign.findByIdAndUpdate(campaign._id, { stats: campaign.stats });
    // 模拟人工发送间隔（500ms）
    await new Promise((r) => setTimeout(r, 500));
  }

  // 原子完成
  const done = await Campaign.findOneAndUpdate(
    { _id: campaign._id, status: 'running' },
    { $set: { status: 'completed', completedAt: new Date(), stats: campaign.stats } },
    { new: true }
  );
  if (done && io) io.to(`workspace:${workspace._id}`).emit('campaign_completed', { campaignId: campaign._id, stats: done.stats });
}

module.exports = { execute };
