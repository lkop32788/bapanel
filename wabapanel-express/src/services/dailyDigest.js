// Messaging summaries and owner alerts.
const cron = require('node-cron');



async function runDailySummary() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Workspace = require('../models/Workspace');
  const Conversation = require('../models/Conversation');
  const Contact = require('../models/Contact');
  const Message = require('../models/Message');
  const User = require('../models/User');
  const WhatsAppService = require('./whatsappService');

  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const todayStr = nowIST.toISOString().slice(0, 10);

  const allSettings = await AutomationSettings.find({ 'dailySummary.enabled': true });
  for (const st of allSettings) {
    try {
      const hour = Number(st.dailySummary.hour ?? 9);
      if (nowIST.getHours() < hour) continue;
      if (st.dailySummary.lastSentDate === todayStr) continue;
      const workspace = await Workspace.findById(st.workspace);
      if (!workspace || !workspace.whatsapp?.isConnected) continue;

      let phone = st.dailySummary.phone;
      if (!phone) {
        const owner = await User.findById(workspace.owner).select('phone').lean();
        phone = owner?.phone;
      }
      if (!phone) continue;

      // Yesterday 00:00 IST to today 00:00 IST, converted to UTC
      const startIST = new Date(nowIST); startIST.setHours(0, 0, 0, 0); startIST.setDate(startIST.getDate() - 1);
      const endIST = new Date(nowIST); endIST.setHours(0, 0, 0, 0);
      const istOffset = 5.5 * 60 * 60 * 1000;
      const start = new Date(startIST.getTime() - istOffset);
      const end = new Date(endIST.getTime() - istOffset);
      const range = { $gte: start, $lt: end };

      const [newConvs, newContacts, msgIn, msgOut, openConvs] = await Promise.all([
        Conversation.countDocuments({ workspace: st.workspace, createdAt: range }),
        Contact.countDocuments({ workspace: st.workspace, createdAt: range }),
        Message.countDocuments({ workspace: st.workspace, direction: 'inbound', createdAt: range }),
        Message.countDocuments({ workspace: st.workspace, direction: 'outbound', createdAt: range }),
        Conversation.countDocuments({ workspace: st.workspace, status: 'active' }),
      ]);

      const dateLabel = startIST.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const msg = `📊 *Daily Summary — ${dateLabel}*\n\n` +
        `💬 New chats: ${newConvs}\n` +
        `👤 New contacts: ${newContacts}\n` +
        `📥 Messages received: ${msgIn}\n` +
        `📤 Messages sent: ${msgOut}\n` +
        `🔓 Open chats now: ${openConvs}\n\n` +
        `— ${workspace.name || 'WabaPanel'}`;

      const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
      await wa.sendTextMessage(phone, msg);
      st.dailySummary.lastSentDate = todayStr;
      await st.save();
      console.log('[DailySummary] sent to', phone, 'for workspace', workspace.name);
    } catch (e) { console.error('[DailySummary] workspace error:', e.message); }
  }
}

async function runWeeklyReport() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Conversation = require('../models/Conversation');
  const Contact = require('../models/Contact');
  const Message = require('../models/Message');
  const ownerNotify = require('./ownerNotify');

  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  if (nowIST.getDay() !== 0 || nowIST.getHours() < 9) return; // Sunday, 9am+ IST
  const todayStr = nowIST.toISOString().slice(0, 10);

  const allSettings = await AutomationSettings.find({ 'ownerAlerts.enabled': true, 'ownerAlerts.weeklyReport': true });
  for (const st of allSettings) {
    try {
      if (st.ownerAlerts.weeklyLastSent === todayStr) continue;
      const endIST = new Date(nowIST); endIST.setHours(0, 0, 0, 0);
      const istOffset = 5.5 * 3600 * 1000;
      const end = new Date(endIST.getTime() - istOffset);
      const start7 = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
      const range = { $gte: start7, $lt: end };
      const [newConvs, newContacts, msgIn, msgOut, openConvs] = await Promise.all([
        Conversation.countDocuments({ workspace: st.workspace, createdAt: range }),
        Contact.countDocuments({ workspace: st.workspace, createdAt: range }),
        Message.countDocuments({ workspace: st.workspace, direction: 'inbound', createdAt: range }),
        Message.countDocuments({ workspace: st.workspace, direction: 'outbound', createdAt: range }),
        Conversation.countDocuments({ workspace: st.workspace, status: 'active' }),
      ]);
      const msg = `\ud83d\udcc8 *Weekly Report (last 7 days)*\n\n\ud83d\udcac New chats: ${newConvs}\n\ud83d\udc64 New contacts: ${newContacts}\n\ud83d\udce5 Messages received: ${msgIn}\n\ud83d\udce4 Messages sent: ${msgOut}\n\ud83d\udd13 Open chats now: ${openConvs}`;
      const sent = await ownerNotify.notifyOwner(st.workspace, msg);
      if (sent) {
        st.ownerAlerts.weeklyLastSent = todayStr;
        await st.save();
        console.log('[WeeklyReport] sent for workspace', String(st.workspace));
      }
    } catch (e) { console.error('[WeeklyReport] workspace error:', e.message); }
  }
}

async function runUnansweredCheck() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Conversation = require('../models/Conversation');
  const ownerNotify = require('./ownerNotify');

  const allSettings = await AutomationSettings.find({ 'ownerAlerts.enabled': true, 'ownerAlerts.onUnanswered': true }).lean();
  for (const st of allSettings) {
    try {
      const mins = Number(st.ownerAlerts.unansweredMins) || 15;
      const cutoff = new Date(Date.now() - mins * 60 * 1000);
      const convs = await Conversation.find({
        workspace: st.workspace,
        status: 'active',
        unreadCount: { $gt: 0 },
        'lastMessage.direction': 'inbound',
        'lastMessage.timestamp': { $lt: cutoff },
      }).populate('contact', 'name profileName phone').limit(20);
      for (const conv of convs) {
        if (conv.unansweredAlertAt && conv.lastMessage?.timestamp && conv.unansweredAlertAt > conv.lastMessage.timestamp) continue;
        const c = conv.contact;
        const label = c ? `${c.name || c.profileName || 'Customer'} (${c.phone || ''})` : 'Customer';
        await ownerNotify.notifyOwner(st.workspace, `\u23f3 *Chat unanswered for ${mins}+ min*\n\n\ud83d\udc64 ${label}\n\ud83d\udcac "${(conv.lastMessage?.text || '').slice(0, 150)}"\n\nPlease reply soon.`);
        conv.unansweredAlertAt = new Date();
        await conv.save();
      }
    } catch (e) { console.error('[UnansweredAlert] workspace error:', e.message); }
  }
}


async function runDailyUnread() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Conversation = require('../models/Conversation');
  const ownerNotify = require('./ownerNotify');
  const allSettings = await AutomationSettings.find({ 'ownerAlerts.enabled': true, 'ownerAlerts.onDailyUnread': true }).lean();
  for (const st of allSettings) {
    try {
      const count = await Conversation.countDocuments({ workspace: st.workspace, status: 'active', unreadCount: { $gt: 0 } });
      if (count > 0) await ownerNotify.dailyUnreadSummary(st.workspace, count);
    } catch (e) { console.error('[DailyUnread]', e.message); }
  }
}



async function runHourlyPulse() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Message = require('../models/Message');
  const Conversation = require('../models/Conversation');
  const ownerNotify = require('./ownerNotify');
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const allSettings = await AutomationSettings.find({ 'ownerAlerts.enabled': true, 'ownerAlerts.onHourlyPulse': true }).lean();
  for (const st of allSettings) {
    try {
      const [msgIn, msgOut, unread] = await Promise.all([
        Message.countDocuments({ workspace: st.workspace, direction: 'inbound', createdAt: { $gte: hourAgo } }),
        Message.countDocuments({ workspace: st.workspace, direction: 'outbound', createdAt: { $gte: hourAgo } }),
        Conversation.countDocuments({ workspace: st.workspace, status: 'active', unreadCount: { $gt: 0 } }),
      ]);
      if (msgIn + msgOut > 0) await ownerNotify.hourlyPulse(st.workspace, msgIn, msgOut, unread);
    } catch (e) { console.error('[HourlyPulse]', e.message); }
  }
}

async function runSlaCheck() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Conversation = require('../models/Conversation');
  const ownerNotify = require('./ownerNotify');
  const allSettings = await AutomationSettings.find({ 'ownerAlerts.enabled': true, 'ownerAlerts.onSlaBreach': true }).lean();
  for (const st of allSettings) {
    try {
      const hours = Number(st.ownerAlerts.slaHours) || 24;
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      const convs = await Conversation.find({
        workspace: st.workspace, status: 'active', unreadCount: { $gt: 0 },
        'lastMessage.direction': 'inbound', 'lastMessage.timestamp': { $lt: cutoff },
      }).populate('contact', 'name profileName phone').limit(10);
      for (const conv of convs) {
        if (conv.unansweredAlertAt && conv.lastMessage?.timestamp && conv.unansweredAlertAt > conv.lastMessage.timestamp) continue;
        const hrs = Math.round((Date.now() - new Date(conv.lastMessage.timestamp).getTime()) / 3600000);
        await ownerNotify.slaBreachAlert(conv.workspace, conv.contact, hrs);
        conv.unansweredAlertAt = new Date();
        await conv.save();
      }
    } catch (e) { console.error('[SLA]', e.message); }
  }
}

async function runMonthlyReport() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Conversation = require('../models/Conversation');
  const Contact = require('../models/Contact');
  const Message = require('../models/Message');
  const ownerNotify = require('./ownerNotify');
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  if (nowIST.getDate() !== 1 || nowIST.getHours() < 9) return;
  const todayStr = nowIST.toISOString().slice(0, 10);
  const allSettings = await AutomationSettings.find({ 'ownerAlerts.enabled': true, 'ownerAlerts.monthlyReport': true });
  for (const st of allSettings) {
    try {
      if (st.ownerAlerts.monthlyLastSent === todayStr) continue;
      const endIST = new Date(nowIST); endIST.setHours(0, 0, 0, 0);
      const startIST = new Date(endIST); startIST.setDate(startIST.getDate() - 30);
      const istOffset = 5.5 * 3600 * 1000;
      const start = new Date(startIST.getTime() - istOffset);
      const end = new Date(endIST.getTime() - istOffset);
      const range = { $gte: start, $lt: end };
      const [newConvs, newContacts, msgIn, msgOut, openConvs] = await Promise.all([
        Conversation.countDocuments({ workspace: st.workspace, createdAt: range }),
        Contact.countDocuments({ workspace: st.workspace, createdAt: range }),
        Message.countDocuments({ workspace: st.workspace, direction: 'inbound', createdAt: range }),
        Message.countDocuments({ workspace: st.workspace, direction: 'outbound', createdAt: range }),
        Conversation.countDocuments({ workspace: st.workspace, status: 'active' }),
      ]);
      const sent = await ownerNotify.monthlyReportSend(st.workspace, { newConvs, newContacts, msgIn, msgOut, openConvs });
      if (sent) { st.ownerAlerts.monthlyLastSent = todayStr; await st.save(); }
    } catch (e) { console.error('[MonthlyReport]', e.message); }
  }
}





async function runSentimentScore() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Conversation = require('../models/Conversation');
  const ownerNotify = require('./ownerNotify');
  const allSettings = await AutomationSettings.find({ 'ownerAlerts.enabled': true, 'ownerAlerts.onSentimentScore': true }).lean();
  for (const st of allSettings) {
    try {
      const [pos, neg, neu] = await Promise.all([
        Conversation.countDocuments({ workspace: st.workspace, sentiment: 'positive' }),
        Conversation.countDocuments({ workspace: st.workspace, sentiment: 'negative' }),
        Conversation.countDocuments({ workspace: st.workspace, sentiment: 'neutral' }),
      ]);
      const total = pos + neg + neu;
      if (total > 0) await ownerNotify.sentimentScore(st.workspace, pos, neg, neu, total);
    } catch (e) { console.error('[SentimentScore]', e.message); }
  }
}

async function runScheduledMessages() {
  try {
    const mongoose = require("mongoose");
    let SM;
    try { SM = mongoose.model("ScheduledMessage"); } catch { return; }
    const due = await SM.find({ sent: false, scheduledAt: { $lte: new Date() } }).limit(50);
    const wa = require("./whatsappService");
    const Conversation = require("../models").Conversation;
    for (const m of due) {
      try {
        const conv = await Conversation.findById(m.conversation).populate("contact");
        if (!conv || !conv.contact) { m.sent = true; await m.save(); continue; }
        await wa.sendTextMessage(conv.workspace, conv.contact.phone, m.text);
        m.sent = true; await m.save();
      } catch (e) { console.error("[SchedMsg]", e.message); }
    }
  } catch (e) { console.error("[SchedMsg]", e.message); }
}
// Cart abandoned: alert the owner once, the hour after an order crosses the 2h unpaid mark.


// Agent activity alerts (idle / offline). Repeat suppression is in-memory: key -> last alert time.
const agentAlerted = new Map();
function alertedRecently(key, minutes) {
  const prev = agentAlerted.get(key) || 0;
  if (Date.now() - prev < minutes * 60 * 1000) return true;
  agentAlerted.set(key, Date.now());
  return false;
}

async function runAgentActivityAlerts() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Workspace = require('../models/Workspace');
  const User = require('../models/User');
  const Message = require('../models/Message');
  const ownerNotify = require('./ownerNotify');

  const all = await AutomationSettings.find({
    'ownerAlerts.enabled': true,
    $or: [{ 'ownerAlerts.onAgentIdle': true }, { 'ownerAlerts.onAgentOffline': true }],
  }).lean();
  const hourIST = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
  for (const st of all) {
    try {
      const ws = await Workspace.findById(st.workspace).select('members').lean();
      const agentIds = (ws?.members || []).filter((m) => m.role === 'agent' && m.user).map((m) => m.user);
      if (!agentIds.length) continue;
      const idleMins = Number(st.ownerAlerts.agentIdleMins) || 30;
      const offHours = Number(st.ownerAlerts.agentOfflineHours) || 4;
      const users = await User.find({ _id: { $in: agentIds } }).select('name email lastLogin').lean();
      for (const u of users) {
        const loginAgoH = u.lastLogin ? (Date.now() - new Date(u.lastLogin).getTime()) / 36e5 : Infinity;
        // Offline: was active this week but has not logged in for the configured hours.
        if (st.ownerAlerts.onAgentOffline && loginAgoH >= offHours && loginAgoH <= 24 * 7) {
          if (!alertedRecently('off:' + st.workspace + ':' + u._id, 24 * 60)) {
            await ownerNotify.agentOfflineAlert(st.workspace, u, Math.round(loginAgoH));
          }
          continue;
        }
        // Idle: logged in and inside working hours, but has sent no message for the configured minutes.
        if (st.ownerAlerts.onAgentIdle && loginAgoH < offHours && hourIST >= 9 && hourIST < 21) {
          const last = await Message.findOne({ workspace: st.workspace, sentBy: u._id }).sort('-createdAt').select('createdAt').lean();
          const lastAt = last?.createdAt || u.lastLogin;
          const mins = Math.round((Date.now() - new Date(lastAt).getTime()) / 60000);
          if (mins >= idleMins && !alertedRecently('idle:' + st.workspace + ':' + u._id, Math.max(idleMins, 60))) {
            await ownerNotify.agentIdleAlert(st.workspace, u, mins);
          }
        }
      }
    } catch (e) { console.error('[AgentActivityAlert] workspace error:', e.message); }
  }
}

function start() {
  cron.schedule('*/15 * * * *', () => runAgentActivityAlerts().catch((e) => console.error('[AgentActivityAlert]', e.message)), { timezone: 'Asia/Kolkata' });
  cron.schedule('5 * * * *', () => runDailySummary().catch((e) => console.error('[DailySummary]', e.message)), { timezone: 'Asia/Kolkata' });
  cron.schedule('10 9-12 * * 0', () => runWeeklyReport().catch((e) => console.error('[WeeklyReport]', e.message)), { timezone: 'Asia/Kolkata' });
  cron.schedule('*/5 * * * *', () => runUnansweredCheck().catch((e) => console.error('[UnansweredAlert]', e.message)), { timezone: 'Asia/Kolkata' });
  cron.schedule('0 18 * * *', () => runDailyUnread().catch((e) => console.error('[DailyUnread]', e.message)), { timezone: 'Asia/Kolkata' });
  cron.schedule('0 * * * *', () => runHourlyPulse().catch((e) => console.error('[HourlyPulse]', e.message)), { timezone: 'Asia/Kolkata' });
  cron.schedule('30 * * * *', () => runSlaCheck().catch((e) => console.error('[SLA]', e.message)), { timezone: 'Asia/Kolkata' });
  cron.schedule('15 9-10 1 * *', () => runMonthlyReport().catch((e) => console.error('[MonthlyReport]', e.message)), { timezone: 'Asia/Kolkata' });
  cron.schedule('0 21 * * *', () => runSentimentScore().catch((e) => console.error('[SentimentScore]', e.message)), { timezone: 'Asia/Kolkata' });
  cron.schedule("*/1 * * * *", runScheduledMessages); // every minute
}

module.exports = { start, runDailySummary, runAgentActivityAlerts };
