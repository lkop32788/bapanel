// Sends preset campaigns over the Aliyun Chat App channel. Unlike the QR
// (Baileys) channel this is an official, rate-limited API — no human-like
// warm-up/daily-cap engine is needed, so this is a simpler loop than
// qrCampaign.js: just pause/stop support and per-contact error accounting.
const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const CHANNEL = 'whatsapp_chatapp';

async function sendToContact(workspace, campaign, preset, contact, io) {
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspace._id, contact: contact._id, channel: CHANNEL },
    { workspace: workspace._id, contact: contact._id, channel: CHANNEL, status: 'active' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const sender = require('./botFlowEngine').getSender(workspace, conversation);
  const { sendPreset } = require('./presetSend');
  const { result, msgType, renderedText } = await sendPreset(sender, contact.phone, preset, contact);
  if (!result?.success) return false;
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
    metadata: { source: 'chatapp_campaign', campaignId: campaign._id, channel: CHANNEL },
  });
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: { text, timestamp: new Date(), direction: 'outbound', type: msgType || 'text' },
    lastMessageAt: new Date(),
  });
  if (io) io.to(`workspace:${workspace._id}`).emit('new_message', { message: msg, conversationId: conversation._id });
  return true;
}

// Runs (or continues) a Chat App preset campaign over the given contacts.
async function execute(campaign, workspace, contacts, io) {
  const preset = campaign.presetMessage;
  if (!preset) {
    campaign.status = 'failed';
    await campaign.save();
    return;
  }
  for (const rawContact of contacts) {
    let contact = rawContact;
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
          (await Contact.create({ workspace: workspace._id, phone, name: 'WA ' + phone, channel: CHANNEL }));
      }
      const ok = await sendToContact(workspace, campaign, preset, contact, io);
      if (ok) campaign.stats.sent++;
      else campaign.stats.failed++;
    } catch (e) {
      campaign.stats.failed++;
    }
  }
  campaign.status = 'completed';
  campaign.completedAt = new Date();
  await campaign.save();
  require('./ownerNotify').broadcastDone(campaign).catch(() => {});
}

module.exports = { execute };
