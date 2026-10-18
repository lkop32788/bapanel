// Sends WhatsApp alerts to the workspace owner (human-transfer requests,
// appointment bookings, appointment reminders).

async function getOwnerTarget(workspaceId, kind) {
  const AutomationSettings = require('../models/AutomationSettings');
  const Workspace = require('../models/Workspace');
  const User = require('../models/User');
  const st = await AutomationSettings.findOne({ workspace: workspaceId });
  if (!st?.ownerAlerts?.enabled) return null;
  if (kind && st.ownerAlerts[kind] === false) return null;
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace?.whatsapp?.isConnected) return null;
  let phone = (st.ownerAlerts.phone || '').replace(/[^0-9]/g, '');
  if (!phone) {
    const owner = await User.findById(workspace.owner).select('phone').lean();
    phone = (owner?.phone || '').replace(/[^0-9]/g, '');
  }
  if (!phone) return null;
  if (phone.length === 10) phone = '91' + phone;
  return { workspace, phone };
}

async function notifyOwner(workspaceId, text, kind) {
  try {
    const target = await getOwnerTarget(workspaceId, kind);
    if (!target) return false;
    const WhatsAppService = require('./whatsappService');
    const wa = new WhatsAppService(target.workspace.whatsapp.accessToken, target.workspace.whatsapp.phoneNumberId);
    await wa.sendTextMessage(target.phone, text);
    console.log('[OwnerAlert] sent to', target.phone);
    return true;
  } catch (e) {
    console.error('[OwnerAlert] failed:', e.message);
    return false;
  }
}



async function humanRequested(workspaceId, phone, reason) {
  try {
    const AutomationSettings = require('../models/AutomationSettings');
    await AutomationSettings.updateOne({ workspace: workspaceId }, { $set: { 'ownerAlerts.lastHumanReqPhone': (phone || '').replace(/[^0-9]/g, '') } });
  } catch (e) { /* noop */ }
  return notifyOwner(workspaceId, `🙋 *Customer wants to talk to a human*\n\n📞 ${phone || 'Unknown number'}\n📝 ${reason || 'No reason given'}\n\nPlease call/reply to them soon.`, 'onHumanRequest');
}





const failAlertTimes = new Map();


function contactLabel(c) {
  if (!c) return '';
  return `${c.name || c.profileName || 'Customer'} (${c.phone || ''})`;
}









async function complaintDetected(workspaceId, contact, text) {
  return notifyOwner(workspaceId, `\ud83d\ude21 *Angry customer / complaint*\n\n\ud83d\udc64 ${contactLabel(contact)}\n\ud83d\udcac "${String(text).slice(0, 200)}"\n\nAttend to this immediately.`, 'onComplaint');
}



async function missedCall(workspaceId, from) {
  return notifyOwner(workspaceId, `\ud83d\udcf5 *Missed call*\n\n\ud83d\udcde ${from}\n\nThe customer's call was missed \u2014 please call them back.`, 'onMissedCall');
}



async function callSummary(workspaceId, phone, summary) {
  return notifyOwner(workspaceId, `\ud83e\udd16 *AI call summary* (${phone})\n\n${summary}`, 'onCallSummary');
}

async function badRating(workspaceId, contact, rating) {
  return notifyOwner(workspaceId, `\u2b50 *Bad rating received: ${rating}/5*\n\n\ud83d\udc64 ${contactLabel(contact)}\n\nTalk to the customer and resolve the issue.`, 'onBadRating');
}

async function repeatCustomer(workspaceId, contact, days) {
  return notifyOwner(workspaceId, `\ud83d\udd01 *Repeat customer is back!*\n\n\ud83d\udc64 ${contactLabel(contact)}\n\u23f3 Messaged after ${days} days.`, 'onRepeatCustomer');
}

async function broadcastDone(campaign) {
  const s = campaign.stats || {};
  return notifyOwner(campaign.workspace, `\ud83d\udce3 *Broadcast complete: ${campaign.name || ''}*\n\n\ud83d\udc65 Recipients: ${s.totalRecipients || 0}\n\u2705 Sent: ${s.sent || 0}\n\ud83d\udce9 Delivered: ${s.delivered || 0}\n\ud83d\udc41 Read: ${s.read || 0}\n\u274c Failed: ${s.failed || 0}${s.skipped ? '\n\u23ed Skipped: ' + s.skipped : ''}`, 'onBroadcastDone');
}

async function msgFail(workspaceId, detail) {
  const key = String(workspaceId);
  const last = failAlertTimes.get(key) || 0;
  if (Date.now() - last < 60 * 60 * 1000) return false;
  failAlertTimes.set(key, Date.now());
  return notifyOwner(workspaceId, `\ud83d\udeab *Message delivery is failing*\n\n${detail || ''}\n\nCheck your WhatsApp quality rating/token.`, 'onMsgFail');
}

async function leadSource(workspaceId, contact, source) {
  return notifyOwner(workspaceId, `\ud83c\udd95 *New lead*\n\n\ud83d\udc64 ${contactLabel(contact)}\n\ud83d\udccd Source: ${source}`, 'onLeadSource');
}



async function agentLogin(workspaceId, user) {
  return notifyOwner(workspaceId, `\ud83d\udc64 *Agent logged in*\n\n${user.name || ''} (${user.email || ''})`, 'onAgentLogin');
}

// Alert the owner of a workspace that is about to be disconnected (uses the
// still-valid credentials, so it must run BEFORE clearing them).
async function disconnectAlert(workspace) {
  try {
    const AutomationSettings = require('../models/AutomationSettings');
    const User = require('../models/User');
    const st = await AutomationSettings.findOne({ workspace: workspace._id });
    if (!st?.ownerAlerts?.enabled || st.ownerAlerts.onDisconnect === false) return;
    let phone = (st.ownerAlerts.phone || '').replace(/[^0-9]/g, '');
    if (!phone) {
      const owner = await User.findById(workspace.owner).select('phone').lean();
      phone = (owner?.phone || '').replace(/[^0-9]/g, '');
    }
    if (!phone) return;
    if (phone.length === 10) phone = '91' + phone;
    const WhatsAppService = require('./whatsappService');
    const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
    await wa.sendTextMessage(phone, '\ud83d\udcf5 *WhatsApp disconnected*\n\nYour WhatsApp number was connected to another workspace, so it has been disconnected from this workspace. Please go to the panel to reconnect.');
  } catch (e) { console.error('[OwnerAlert] disconnect:', e.message); }
}

async function buildTodayReport(workspaceId) {
  const Conversation = require('../models/Conversation');
  const Contact = require('../models/Contact');
  const Message = require('../models/Message');
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const startIST = new Date(nowIST); startIST.setHours(0, 0, 0, 0);
  const start = new Date(startIST.getTime() - 5.5 * 3600 * 1000);
  const range = { $gte: start };
  const [newConvs, newContacts, msgIn, msgOut, openConvs] = await Promise.all([
    Conversation.countDocuments({ workspace: workspaceId, createdAt: range }),
    Contact.countDocuments({ workspace: workspaceId, createdAt: range }),
    Message.countDocuments({ workspace: workspaceId, direction: 'inbound', createdAt: range }),
    Message.countDocuments({ workspace: workspaceId, direction: 'outbound', createdAt: range }),
    Conversation.countDocuments({ workspace: workspaceId, status: 'active' }),
  ]);
  return `\ud83d\udcca *Today's report (so far)*\n\n\ud83d\udcac New chats: ${newConvs}\n\ud83d\udc64 New contacts: ${newContacts}\n\ud83d\udce5 Messages received: ${msgIn}\n\ud83d\udce4 Messages sent: ${msgOut}\n\ud83d\udd13 Open chats: ${openConvs}`;
}

// Owner replies/commands over WhatsApp: "report", "ai on/off", "ok", "help".
async function handleOwnerCommand(workspace, fromDigits, text) {
  try {
    const AutomationSettings = require('../models/AutomationSettings');
    const User = require('../models/User');
    const st = await AutomationSettings.findOne({ workspace: workspace._id });
    if (!st?.ownerAlerts?.enabled || !st.ownerAlerts.waCommands) return false;
    let phone = (st.ownerAlerts.phone || '').replace(/[^0-9]/g, '');
    if (!phone) {
      const owner = await User.findById(workspace.owner).select('phone').lean();
      phone = (owner?.phone || '').replace(/[^0-9]/g, '');
    }
    const from = String(fromDigits || '').replace(/[^0-9]/g, '');
    if (!phone || from.slice(-10) !== phone.slice(-10)) return false;
    const cmd = String(text || '').trim().toLowerCase();
    const WhatsAppService = require('./whatsappService');
    const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
    if (cmd === 'report') {
      await wa.sendTextMessage(from, await buildTodayReport(workspace._id));
      return true;
    }
    if (cmd === 'ai on' || cmd === 'ai off') {
      const AISettings = require('../models/AISettings');
      await AISettings.updateOne({ workspace: workspace._id }, { $set: { 'callTargeting.mode': cmd === 'ai on' ? 'all' : 'manual' } });
      await wa.sendTextMessage(from, cmd === 'ai on' ? '\ud83e\udd16 AI calling is now ON (all incoming calls).' : '\ud83e\udd16 AI calling is now OFF.');
      return true;
    }
    if (cmd === 'ok') {
      const reqPhone = (st.ownerAlerts.lastHumanReqPhone || '').replace(/[^0-9]/g, '');
      if (!reqPhone) { await wa.sendTextMessage(from, 'No pending human request found.'); return true; }
      const Contact = require('../models/Contact');
      const Conversation = require('../models/Conversation');
      const c = await Contact.findOne({ workspace: workspace._id, phone: { $regex: reqPhone.slice(-10) + '$' } });
      if (c) await Conversation.updateOne({ workspace: workspace._id, contact: c._id }, { $set: { assignedAgent: workspace.owner, status: 'active' } });
      await wa.sendTextMessage(from, c ? `\u2705 The chat with ${c.name || reqPhone} has been assigned to you.` : 'Contact not found.');
      return true;
    }
    if (cmd === 'help' || cmd === 'commands') {
      await wa.sendTextMessage(from, '\ud83d\udee0 Commands:\n\u2022 report \u2014 today summary\n\u2022 ai on / ai off \u2014 turn AI calling on/off\n\u2022 ok \u2014 assign the last human-request chat to yourself\n\u2022 help \u2014 this list');
      return true;
    }
    // Any other message from owner -> send today's report
    await wa.sendTextMessage(from, await buildTodayReport(workspace._id));
    return true;
  } catch (e) { console.error('[OwnerCmd]', e.message); return false; }
}








async function tagChangeAlert(workspaceId, contact, added, removed) {
  const parts = [];
  if (added?.length) parts.push('\u2795 Added: ' + added.join(', '));
  if (removed?.length) parts.push('\u2796 Removed: ' + removed.join(', '));
  return notifyOwner(workspaceId, `\ud83c\udff7 *Contact tag change*\n\n\ud83d\udc64 ${contactLabel(contact)}\n${parts.join('\n')}`, 'onTagChange');
}

async function templateReject(workspaceId, templateName, reason) {
  return notifyOwner(workspaceId, `\u274c *WhatsApp template rejected*\n\n\ud83d\udcc4 ${templateName}\n\ud83d\udcdd Reason: ${reason || 'Unknown'}\n\nFix it and submit again.`, 'onTemplateReject');
}

async function keywordAlert(workspaceId, contact, keyword, text) {
  return notifyOwner(workspaceId, `\ud83d\udea8 *Keyword detected: "${keyword}"*\n\n\ud83d\udc64 ${contactLabel(contact)}\n\ud83d\udcac "${String(text).slice(0, 200)}"`, 'onDailyUnread');
}



async function firstMsgOfDay(workspaceId, contact) {
  return notifyOwner(workspaceId, `\u2600\ufe0f *First customer message of the day!*\n\n\ud83d\udc64 ${contactLabel(contact)}\n\nBusiness has started \u2014 good morning!`, 'onFirstMsg');
}

async function hourlyPulse(workspaceId, msgIn, msgOut, unread) {
  return notifyOwner(workspaceId, `\u23f0 *Hourly pulse*\n\n\ud83d\udce5 Received: ${msgIn}\n\ud83d\udce4 Sent: ${msgOut}\n\ud83d\udce8 Unread: ${unread}`, 'onHourlyPulse');
}

async function newDeviceLogin(workspaceId, user, ip) {
  return notifyOwner(workspaceId, `\ud83d\udd10 *New device login detected*\n\n\ud83d\udc64 ${user.name || ''} (${user.email || ''})\n\ud83c\udf10 IP: ${ip || 'Unknown'}\n\nIf this was not you, change your password immediately.`, 'onNewDevice');
}

async function bulkDeleteAlert(workspaceId, user, count, type) {
  return notifyOwner(workspaceId, `\u26a0\ufe0f *Bulk delete detected!*\n\n\ud83d\udc64 ${user.name || ''} deleted ${count} ${type} at once.\n\nPlease verify this was intentional.`, 'onBulkDelete');
}

async function sentimentScore(workspaceId, positive, negative, neutral, total) {
  const pct = total ? Math.round(positive / total * 100) : 0;
  const nPct = total ? Math.round(negative / total * 100) : 0;
  return notifyOwner(workspaceId, `\ud83d\ude00 *Daily sentiment score*\n\n\ud83d\udc4d Positive: ${positive} (${pct}%)\n\ud83d\udc4e Negative: ${negative} (${nPct}%)\n\ud83d\ude10 Neutral: ${neutral}\n\ud83d\udcca Total analyzed: ${total}`, 'onSentimentScore');
}

async function aiSuggestion(workspaceId, contact, suggestion) {
  return notifyOwner(workspaceId, `\ud83e\udde0 *AI suggestion*\n\n\ud83d\udc64 ${contactLabel(contact)}\n\ud83d\udca1 ${suggestion}`, 'onAiSuggestion');
}

async function aiCallFailed(workspaceId, phone, error) {
  return notifyOwner(workspaceId, `\u274c *AI call failed*\n\n\ud83d\udcde ${phone}\n\ud83d\udcdd Error: ${String(error).slice(0, 200)}\n\nCheck your API key/balance.`, 'onAiCallFailed');
}

async function agentIdleAlert(workspaceId, user, mins) {
  return notifyOwner(workspaceId, `\ud83d\udca4 *Agent is idle*\n\n\ud83d\udc64 ${user.name || ''} (${user.email || ''})\n\u23f1 No chats handled for ${mins} minutes.`, 'onAgentIdle');
}

async function chatReassigned(workspaceId, contact, fromAgent, toAgent) {
  return notifyOwner(workspaceId, `\ud83d\udd00 *Chat reassigned*\n\n\ud83d\udc64 ${contactLabel(contact)}\n${fromAgent || '?'} \u2192 ${toAgent || '?'}`, 'onChatReassign');
}

async function agentOfflineAlert(workspaceId, user, hours) {
  return notifyOwner(workspaceId, `\ud83d\udcf5 *Agent is offline*\n\n\ud83d\udc64 ${user.name || ''}\n\u23f1 Offline for ${hours}+ hours.`, 'onAgentOffline');
}

async function afterHoursMsg(workspaceId, contact) {
  return notifyOwner(workspaceId, `\ud83c\udf19 *Message received after office hours*\n\n\ud83d\udc64 ${contactLabel(contact)}`, 'onAfterHours');
}

async function monthlyReportSend(workspaceId, data) {
  const { newConvs, newContacts, msgIn, msgOut, openConvs } = data;
  return notifyOwner(workspaceId, `\ud83d\udcc5 *Monthly Report (last 30 days)*\n\n\ud83d\udcac New chats: ${newConvs}\n\ud83d\udc64 New contacts: ${newContacts}\n\ud83d\udce5 Messages received: ${msgIn}\n\ud83d\udce4 Messages sent: ${msgOut}\n\ud83d\udd13 Open chats: ${openConvs}`, 'onDailyUnread');
}

async function slaBreachAlert(workspaceId, contact, hours) {
  return notifyOwner(workspaceId, `\u23f0 *SLA breach!*\n\n\ud83d\udc64 ${contactLabel(contact)}\n\u23f1 Open for ${hours}+ hours without resolution.\n\nPlease resolve immediately.`, 'onSlaBreach');
}







async function dailyUnreadSummary(workspaceId, count) {
  return notifyOwner(workspaceId, `\ud83d\udce8 *Daily unread summary*\n\n${count} chats are still unread.\n\nEnd of day \u2014 please reply to them.`, 'onDailyUnread');
}

module.exports = {
  notifyOwner, humanRequested, complaintDetected,
  missedCall, callSummary, badRating, repeatCustomer,
  broadcastDone, msgFail, leadSource, agentLogin, disconnectAlert,
  handleOwnerCommand, buildTodayReport,
  tagChangeAlert, templateReject,
  keywordAlert, firstMsgOfDay, hourlyPulse, newDeviceLogin,
  bulkDeleteAlert, sentimentScore, aiSuggestion, aiCallFailed, agentIdleAlert,
  chatReassigned, agentOfflineAlert, afterHoursMsg, monthlyReportSend,
  slaBreachAlert, dailyUnreadSummary,
};
