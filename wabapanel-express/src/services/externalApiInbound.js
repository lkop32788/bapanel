/**
 * externalApiInbound.js — 外部 API 渠道入站处理
 * 与 waQrService.handleIncoming 同构：联系人/会话 upsert（防并发重复、吃唯一索引）、
 * 消息去重、未读数、socket 推送、退订与机器人自动化触发、状态回执。
 */

const crypto = require('crypto');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Workspace = require('../models/Workspace');

const CHANNEL = 'external_api';

// 状态回执：{ event:'status', messageId, status }
async function handleStatus({ workspace, messageId, status }) {
  const allowed = ['sent', 'delivered', 'read', 'failed'];
  if (!allowed.includes(status) || !messageId) return;
  const msg = await Message.findOneAndUpdate(
    { workspace: workspace._id, waMessageId: `ext_${messageId}` },
    { $set: { status } },
    { new: true }
  );
  if (msg && global.io) {
    global.io.to(`workspace:${workspace._id}`).emit('message_status', {
      messageId: msg._id, conversationId: msg.conversation, status,
    });
  }
}

async function handleInbound({ workspace, slotId, from, type = 'text', text = '', messageId, media }) {
  const wsId = workspace._id;
  const phone = String(from).replace(/[^\d+]/g, '') || String(from);
  const safeType = ['text', 'image', 'video', 'audio', 'document', 'sticker'].includes(type) ? type : 'text';
  const preview = text || `[${safeType}]`;

  const contact = await Contact.findOneAndUpdate(
    { workspace: wsId, phone },
    {
      $set: { workspace: wsId, phone, lastMessageAt: new Date() },
      $setOnInsert: { name: phone, source: CHANNEL },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // 会话唯一键是 (workspace, contact, channel)——过滤条件绝不能带 waNumberId，
  // 否则同一联系人换槽位入站会撞唯一索引。槽位绑定只在新建时写入。
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: wsId, contact: contact._id, channel: CHANNEL },
    {
      $set: { lastMessage: preview, lastMessageAt: new Date(), status: 'active' },
      $setOnInsert: { workspace: wsId, contact: contact._id, channel: CHANNEL, waNumberId: `ext:${slotId}` },
      $inc: { unreadCount: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!conversation.waNumberId) {
    await Conversation.updateOne(
      { _id: conversation._id, $or: [{ waNumberId: null }, { waNumberId: '' }] },
      { $set: { waNumberId: `ext:${slotId}` } }
    ).catch(() => {});
    conversation.waNumberId = `ext:${slotId}`;
  }

  // 去重：第三方重推同一 messageId 只入库一次
  const waMessageId = `ext_${messageId || crypto.randomBytes(8).toString('hex')}`;
  if (messageId && await Message.findOne({ workspace: wsId, waMessageId })) return;

  const message = await Message.create({
    workspace: wsId, conversation: conversation._id, contact: contact._id,
    direction: 'inbound', type: safeType, text: text || `[${safeType} received]`,
    media: media && media.url ? { url: media.url, caption: media.caption || '' } : undefined,
    waMessageId, status: 'delivered',
    metadata: { source: CHANNEL, slotId },
  });

  Workspace.updateOne(
    { _id: wsId, 'externalApiSlots.slotId': slotId },
    { $set: { 'externalApiSlots.$[s].lastInboundAt': new Date() } },
    { arrayFilters: [{ 's.slotId': slotId }] }
  ).catch(() => {});

  if (global.io) {
    global.io.to(`workspace:${wsId}`).emit('new_message', { message, conversationId: conversation._id });
    global.io.to(`workspace:${wsId}`).emit('conversation_updated', conversation);
  }
  try {
    require('../controllers/pushController').notifyWorkspace(wsId, {
      title: contact.name || contact.phone, body: preview.slice(0, 120),
      url: '/client/chat', tag: String(conversation._id),
    });
  } catch (e) { /* noop */ }

  // 退订优先于自动化（与 waQr 一致），退订确认从同槽位回复
  if (text) {
    let optOutHandled = false;
    try {
      const extSvc = require('./externalApiService');
      const oo = await require('./optOut').handleInbound({
        workspace, contact,
        text: String(text).toLowerCase().trim(),
        wa: { sendTextMessage: (to, body) => extSvc.sendMessage(wsId, to, { type: 'text', text: body }, slotId) },
      });
      optOutHandled = oo.changed;
      if (oo.changed && global.io) global.io.to(`workspace:${wsId}`).emit('conversation_updated', conversation);
    } catch (e) { console.error(`[ExtAPI:${wsId}:${slotId}] optOut:`, e.message); }
    if (!optOutHandled) {
      require('./qrAutomation')
        .processIncoming({ workspace, conversation, contact, phone, text, buttonId: null })
        .catch((e) => console.error(`[ExtAPI:${wsId}:${slotId}] automation error:`, e.message));
    }
  }
}

module.exports = { handleInbound, handleStatus };
