// 外部 API 渠道群发 — 结构同 chatAppCampaign，但：
//  - 槽位轮询分摊：未绑定槽位的会话按序分到可用槽并写回绑定（粘住，客户视角不换号）
//  - 统计用 $inc 原子累加（SEC-CONC：整写 stats 会和并发路径互相覆盖）
//  - 单槽连续失败 3 次本轮跳过该槽；全部槽失效则任务置 failed
const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const CHANNEL = 'external_api';

const bump = (campaignId, field, n = 1) =>
  Campaign.updateOne({ _id: campaignId }, { $inc: { [`stats.${field}`]: n } }).catch(() => {});

async function sendToContact(workspace, campaign, preset, contact, slotId, io) {
  // 唯一键 (workspace, contact, channel)：过滤不带 waNumberId，绑定只在新建时写
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspace._id, contact: contact._id, channel: CHANNEL },
    {
      $set: { status: 'active' },
      $setOnInsert: { workspace: workspace._id, contact: contact._id, channel: CHANNEL, waNumberId: `ext:${slotId}` },
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

  // getSender → qrAutomation.channelSend 走会话绑定的槽位；sendPreset 负责变量渲染/媒体
  const sender = require('./botFlowEngine').getSender(workspace, conversation);
  const { sendPreset } = require('./presetSend');
  const { result, msgType, renderedText } = await sendPreset(sender, contact.phone, preset, contact);
  if (!result?.success) throw new Error(result?.error?.message || 'Failed to send');

  const text = renderedText || preset.body || `[${msgType}]`;
  const msg = await Message.create({
    workspace: workspace._id, conversation: conversation._id, contact: contact._id,
    direction: 'outbound', type: msgType || 'text', text,
    media: preset.mediaUrl ? { url: preset.mediaUrl } : undefined,
    waMessageId: result.data?.messages?.[0]?.id || '',
    status: 'sent',
    metadata: { source: 'extapi_campaign', campaignId: campaign._id, channel: CHANNEL, slotId: conversation.waNumberId },
  });
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: text, lastMessageAt: new Date(),
  });
  if (io) io.to(`workspace:${workspace._id}`).emit('new_message', { message: msg, conversationId: conversation._id });
}

async function execute(campaign, workspace, contacts, io) {
  const preset = campaign.presetMessage;
  if (!preset) {
    await Campaign.updateOne({ _id: campaign._id }, { $set: { status: 'failed' } });
    return;
  }
  const extSvc = require('./externalApiService');
  const slots = extSvc.usableSlots(workspace).map((s) => ({ slotId: s.slotId, fails: 0 }));
  if (!slots.length) {
    await Campaign.updateOne({ _id: campaign._id }, { $set: { status: 'failed' } });
    return;
  }
  let cursor = 0;
  const nextSlot = () => {
    const alive = slots.filter((s) => s.fails < 3);
    if (!alive.length) return null;
    return alive[cursor++ % alive.length];
  };

  for (const rawContact of contacts) {
    let contact = rawContact;
    let slot = null;
    try {
      // 响应 UI 的暂停/停止；任务被删时 fresh 为空直接退出
      const fresh = await Campaign.findById(campaign._id).select('status').lean();
      if (!fresh || fresh.status === 'paused' || fresh.status === 'failed') return;

      if (!contact._id) {
        const phone = String(contact.phone || '').replace(/\D/g, '');
        if (!phone) { await bump(campaign._id, 'skipped'); continue; }
        contact =
          (await Contact.findOne({ workspace: workspace._id, phone: new RegExp(phone + '$') })) ||
          (await Contact.create({ workspace: workspace._id, phone, name: phone, source: CHANNEL }));
      }

      slot = nextSlot();
      if (!slot) {
        console.error('[ExtApiCampaign] 所有槽位连续失败，任务终止');
        await Campaign.updateOne({ _id: campaign._id, status: 'running' }, { $set: { status: 'failed' } });
        return;
      }
      await sendToContact(workspace, campaign, preset, contact, slot.slotId, io);
      slot.fails = 0;
      await bump(campaign._id, 'sent');
    } catch (e) {
      if (slot) slot.fails++;
      console.error('[ExtApiCampaign] contact error:', e.message);
      await bump(campaign._id, 'failed');
    }
    // 发送间隔 400–900ms 抖动
    await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 500)));
  }

  // 原子完成：只有仍在 running 的才能转 completed（中途被暂停/删除的不动）
  const done = await Campaign.findOneAndUpdate(
    { _id: campaign._id, status: 'running' },
    { $set: { status: 'completed', completedAt: new Date() } },
    { new: true }
  );
  if (done) {
    require('./ownerNotify').broadcastDone(done).catch(() => {});
    if (io) io.to(`workspace:${workspace._id}`).emit('campaign_completed', { campaignId: done._id, stats: done.stats });
  }
}

module.exports = { execute };
