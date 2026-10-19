/**
 * externalApiInbound.js — 处理外部 API 渠道的入站消息
 * 复用 WA QR / TG Personal 的相同模式：查/建联系人 → 查/建会话 → 存消息 → 推 socket
 */

const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

async function handleInbound({ workspace, slotId, from, type, text, messageId, media, io }) {
  const wsId = workspace._id;

  // 规范化来电号码（去掉非数字前缀，保持 E.164 风格）
  const phone = String(from).replace(/[^\d+]/g, '') || from;

  // 查或建联系人
  let contact = await Contact.findOne({ workspace: wsId, phone });
  if (!contact) {
    contact = await Contact.create({
      workspace: wsId,
      phone,
      name: phone,
    });
  }

  // 会话 channel key 用 external_api，waNumberId 绑定 ext:<slotId>
  const waNumberId = `ext:${slotId}`;
  let conversation = await Conversation.findOne({
    workspace: wsId,
    contact: contact._id,
    channel: 'external_api',
    waNumberId,
  });
  if (!conversation) {
    conversation = await Conversation.create({
      workspace: wsId,
      contact: contact._id,
      channel: 'external_api',
      waNumberId,
      status: 'open',
      lastMessage: { text: text || `[${type}]`, timestamp: new Date(), direction: 'inbound', type },
    });
  } else {
    conversation.lastMessage = { text: text || `[${type}]`, timestamp: new Date(), direction: 'inbound', type };
    conversation.status = 'open';
    await conversation.save();
  }

  // 存消息
  const msg = await Message.create({
    workspace: wsId,
    conversation: conversation._id,
    contact: contact._id,
    direction: 'inbound',
    type: type || 'text',
    text: text || '',
    media: media || undefined,
    waMessageId: messageId ? `ext_${messageId}` : '',
    status: 'delivered',
  });

  // 推 socket
  if (io) {
    const payload = {
      ...msg.toObject(),
      contact: contact.toObject(),
      conversation: conversation.toObject(),
    };
    io.to(`workspace:${wsId}`).emit('new_message', payload);
    io.to(`conversation:${conversation._id}`).emit('new_message', payload);
    io.to(`workspace:${wsId}`).emit('conversation_updated', {
      ...conversation.toObject(),
      contact: contact.toObject(),
    });
  }
}

module.exports = { handleInbound };
