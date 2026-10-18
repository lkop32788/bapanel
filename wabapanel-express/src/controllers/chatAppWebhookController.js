// Inbound webhook for Aliyun Chat App Message Service (CAMS). One global
// callback URL (configured once in the Alibaba Cloud Chat App console) serves
// every workspace; the workspace is resolved from CustSpaceId in the payload,
// mirroring how the Meta Cloud API webhook resolves by phoneNumberId.
const Workspace = require('../models/Workspace');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const chatApp = require('../services/chatAppService');

const CHANNEL = 'whatsapp_chatapp';

async function findWorkspace(event) {
  if (event.custSpaceId) {
    const w = await Workspace.findOne({ 'chatApp.custSpaceId': event.custSpaceId });
    if (w) return w;
  }
  if (event.to) {
    const w = await Workspace.findOne({ 'chatApp.phoneNumber': event.to });
    if (w) return w;
  }
  return null;
}

async function handleStatus(workspace, event) {
  if (!event.messageId) return;
  const waMessageId = 'ca_' + event.messageId;
  const statusMap = { delivered: 'delivered', read: 'read', sent: 'sent', failed: 'failed' };
  const status = statusMap[String(event.status || '').toLowerCase()];
  if (!status) return;
  const message = await Message.findOneAndUpdate(
    { workspace: workspace._id, waMessageId },
    { status },
    { new: true }
  );
  if (message && global.io) {
    global.io.to(`workspace:${workspace._id}`).emit('message_status', { messageId: message._id, conversationId: message.conversation, status });
  }
}

async function handleInboundMessage(workspace, event) {
  const workspaceId = workspace._id;
  const phone = String(event.from || '').replace(/[^0-9]/g, '');
  if (!phone) return;

  const waMessageId = 'ca_' + event.messageId;
  if (event.messageId && await Message.findOne({ workspace: workspaceId, waMessageId })) return; // dedupe retries

  const hasRealName = event.name && event.name !== phone;
  const contact = await Contact.findOneAndUpdate(
    { workspace: workspaceId, phone },
    hasRealName
      ? { $set: { workspace: workspaceId, phone, name: event.name, source: 'whatsapp_chatapp', lastMessageAt: new Date() } }
      : { $set: { workspace: workspaceId, phone, source: 'whatsapp_chatapp', lastMessageAt: new Date() }, $setOnInsert: { name: 'WA ' + phone } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const text = event.text || '';
  const mediaType = ['image', 'video', 'audio', 'document'].includes(event.type) ? event.type : null;

  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspaceId, contact: contact._id, channel: CHANNEL },
    {
      $set: { lastMessage: { text: text || `[${mediaType || event.type}]`, timestamp: new Date(), direction: 'inbound', type: mediaType || 'text' }, status: 'active' },
      $setOnInsert: { workspace: workspaceId, contact: contact._id, channel: CHANNEL },
      $inc: { unreadCount: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const message = await Message.create({
    workspace: workspaceId, conversation: conversation._id, contact: contact._id,
    direction: 'inbound', type: mediaType || 'text',
    text: text || (mediaType ? `[${mediaType} received]` : '[message received]'),
    media: event.mediaUrl ? { url: event.mediaUrl } : undefined,
    waMessageId, status: 'delivered',
    metadata: { source: CHANNEL },
  });

  if (global.io) {
    global.io.to(`workspace:${workspaceId}`).emit('new_message', { message, conversationId: conversation._id });
    global.io.to(`workspace:${workspaceId}`).emit('conversation_updated', conversation);
  }
  try {
    require('./pushController').notifyWorkspace(workspaceId, {
      title: contact.name || contact.phone, body: (text || '[media]').slice(0, 120),
      url: '/client/chat', tag: String(conversation._id),
    });
  } catch (e) { /* noop */ }

  let optOutHandled = false;
  try {
    const oo = await require('../services/optOut').handleInbound({
      workspace, contact, text: text.toLowerCase().trim(),
      wa: { sendTextMessage: (to, body) => chatApp.sendText(workspace.chatApp, to, body) },
    });
    optOutHandled = oo.changed;
    if (oo.changed && global.io) global.io.to(`workspace:${workspaceId}`).emit('conversation_updated', conversation);
  } catch (e) { console.error('[ChatApp] optOut error:', e.message); }

  if (!optOutHandled) {
    require('../services/qrAutomation')
      .processIncoming({ workspace, conversation, contact, phone, text })
      .catch((e) => console.error('[ChatApp] automation error:', e.message));
  }
}

// @POST /api/webhook/chatapp — must ack within 3s (Alibaba Cloud retries
// 3 times otherwise), so respond first and process afterwards.
const handleWebhook = async (req, res) => {
  res.status(200).json(chatApp.ackBody());
  try {
    const event = chatApp.parseInboundEvent(req.body);
    const workspace = await findWorkspace(event);
    if (!workspace) { console.error('[ChatApp] webhook: no workspace for CustSpaceId', event.custSpaceId); return; }
    if (event.isStatus) await handleStatus(workspace, event);
    else await handleInboundMessage(workspace, event);
  } catch (e) {
    console.error('[ChatApp] webhook error:', e.message);
  }
};

module.exports = { handleWebhook };
