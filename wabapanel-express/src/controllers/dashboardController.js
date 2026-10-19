const Message = require('../models/Message');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Campaign = require('../models/Campaign');
const User = require('../models/User');

// Agent-scoped dashboard: only the caller's own conversations/messages/reminders.
const buildAgentDashboard = async (req, since, until, days, todayStart, now) => {
  const ContactNote = require('../models/ContactNote');
  const workspaceId = req.workspace._id;
  const me = req.user._id;
  const ac = Array.isArray(req.user.allowedChannels) ? req.user.allowedChannels : [];
  const chanQ = ac.length ? { channel: { $in: ac } } : {};
  const openQ = { workspace: workspaceId, assignedAgent: me, status: { $in: ['active', 'pending', 'snoozed'] }, isResolved: { $ne: true }, ...chanQ };
  const rangeQ = until ? { $gte: since, $lte: until } : { $gte: since };
  const end = until || now;
  const in24h = new Date(now.getTime() + 86400000);

  const [assigned, awaitingReply, sentToday, waiting, myContacts, convDaily, msgDaily, respMsgs] = await Promise.all([
    Conversation.countDocuments(openQ),
    Conversation.countDocuments({ ...openQ, 'lastMessage.direction': 'inbound' }),
    Message.countDocuments({ workspace: workspaceId, sentBy: me, createdAt: { $gte: todayStart } }),
    Conversation.find({ ...openQ, 'lastMessage.direction': 'inbound', 'lastMessage.timestamp': { $lte: new Date(now.getTime() - 60 * 60000) } })
      .populate('contact', 'name phone').select('contact channel lastMessage').sort('lastMessage.timestamp').limit(10).lean(),
    Contact.find({ workspace: workspaceId, assignedAgent: me }).select('_id').limit(1000).lean(),
    Conversation.aggregate([
      { $match: { workspace: workspaceId, assignedAgent: me, createdAt: rangeQ, ...chanQ } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    Message.aggregate([
      { $match: { workspace: workspaceId, sentBy: me, createdAt: rangeQ } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    // response-time scan limited to my conversations
    Conversation.find({ workspace: workspaceId, assignedAgent: me, ...chanQ }).select('_id').sort('-updatedAt').limit(1000).lean()
      .then(convs => Message.find({ workspace: workspaceId, conversation: { $in: convs.map(c => c._id) }, createdAt: rangeQ })
        .select('conversation direction createdAt').sort('createdAt').limit(3000).lean()),
  ]);

  const lastInbound = new Map();
  const diffs = [];
  for (const msg of respMsgs) {
    const key = String(msg.conversation);
    if (msg.direction === 'inbound') lastInbound.set(key, msg.createdAt);
    else if (lastInbound.has(key)) {
      const diff = (new Date(msg.createdAt) - new Date(lastInbound.get(key))) / 60000;
      if (diff >= 0 && diff <= 24 * 60) diffs.push(diff);
      lastInbound.delete(key);
    }
  }
  const avgResponseMins = diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length * 10) / 10 : null;

  const reminderDocs = await ContactNote.find({
    workspace: workspaceId, contacted: { $ne: true }, remindAt: { $gte: now, $lte: in24h },
    $or: [{ createdBy: me }, { contact: { $in: myContacts.map(c => c._id) } }],
  }).populate('contact', 'name phone').select('text remindAt contact').sort('remindAt').limit(10).lean();

  const cMap = Object.fromEntries(convDaily.map(d => [d._id, d.count]));
  const mMap = Object.fromEntries(msgDaily.map(d => [d._id, d.count]));
  const daily = [];
  const fmt = (d) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  for (let d = new Date(since.getFullYear(), since.getMonth(), since.getDate()); d <= end && daily.length < 366; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const k = fmt(d);
    daily.push({ date: k, conversations: cMap[k] || 0, messages: mMap[k] || 0 });
  }

  return {
    role: 'agent',
    today: { assigned, awaitingReply, sentToday, avgResponseMins },
    needsAction: {
      unanswered: waiting.map(c => ({
        conversationId: c._id,
        contactName: c.contact?.name || c.contact?.phone || '',
        channel: c.channel,
        minutesWaiting: Math.round((now - new Date(c.lastMessage.timestamp)) / 60000),
      })),
      reminders: reminderDocs.map(r => ({ contactId: r.contact?._id, contactName: r.contact?.name || r.contact?.phone || '', remindAt: r.remindAt, note: r.text })),
    },
    trends: { daily },
  };
};

// @GET /api/dashboard (Client Dashboard)
const getClientDashboard = async (req, res) => {
  try {
    const workspaceId = req.workspace._id;
    const now = new Date();
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    let thirtyDaysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Optional custom range (?from=&to=, ISO dates); both must be valid, else fall back to `days`
    const qFrom = new Date(req.query.from), qTo = new Date(req.query.to);
    let rangeEnd = null;
    if (req.query.from && req.query.to && !isNaN(qFrom) && !isNaN(qTo) && qFrom <= qTo) {
      thirtyDaysAgo = qFrom;
      rangeEnd = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to)) ? new Date(qTo.getTime() + 86400000 - 1) : qTo;
    }
    const rangeQ = rangeEnd ? { $gte: thirtyDaysAgo, $lte: rangeEnd } : { $gte: thirtyDaysAgo };
    const rangeDays = rangeEnd ? Math.min(366, Math.max(1, Math.ceil((rangeEnd - thirtyDaysAgo) / 86400000))) : days;

    const { computeAgentPerformance } = require('./teamController');
    const uid = String(req.user._id);
    const isManager = req.user.role === 'super_admin' || String(req.workspace.owner) === uid
      || (req.workspace.members || []).some(m => String(m.user) === uid && ['owner', 'admin'].includes(m.role));
    if (!isManager) return res.json({ success: true, data: await buildAgentDashboard(req, thirtyDaysAgo, rangeEnd, rangeDays, todayStart, now) });

    const [
      totalContacts,
      totalConversations,
      activeConversations,
      messageStats,
      recentMessages,
      recentConversations,
    ] = await Promise.all([
      Contact.countDocuments({ workspace: workspaceId }),
      Conversation.countDocuments({ workspace: workspaceId }),
      Conversation.countDocuments({ workspace: workspaceId, status: 'active' }),
      Message.aggregate([
        { $match: { workspace: workspaceId, createdAt: rangeQ } },
        { $group: {
          _id: '$status',
          count: { $sum: 1 },
        }},
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, createdAt: rangeQ } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sent: { $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] } },
          received: { $sum: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] } },
          total: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
      Conversation.find({ workspace: workspaceId })
        .populate('contact', 'name phone')
        .populate('lastMessage', 'text')
        .sort('-updatedAt')
        .limit(5)
        .lean(),
    ]);

    const stats = {};
    messageStats.forEach(s => { stats[s._id] = s.count; });

    const Template = require('../models/Template');
    const PresetMessage = require('../models/PresetMessage');
    const CallSession = require('../models/CallSession');
    const Keyword = require('../models/Keyword');

    const [
      campaignAgg, templateAgg, presetCount, callAgg,
      keywordCount, unreadAgg, newContacts, contactChart,
      todayMsgAgg, campaignRecent, callChart,
    ] = await Promise.all([
      Campaign.aggregate([
        { $match: { workspace: workspaceId } },
        { $group: { _id: '$status', count: { $sum: 1 }, sent: { $sum: { $ifNull: ['$stats.sent', 0] } } } },
      ]),
      Template.aggregate([
        { $match: { workspace: workspaceId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      PresetMessage.countDocuments({ workspace: workspaceId }),
      CallSession.aggregate([
        { $match: { workspace: workspaceId } },
        { $group: { _id: null, total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $in: ['$status', ['failed', 'rejected']] }, 1, 0] } },
          seconds: { $sum: { $ifNull: ['$duration', 0] } } } },
      ]),
      Keyword.countDocuments({ workspace: workspaceId }),
      Conversation.aggregate([
        { $match: { workspace: workspaceId } },
        { $group: { _id: null, unread: { $sum: { $ifNull: ['$unreadCount', 0] } } } },
      ]),
      Contact.countDocuments({ workspace: workspaceId, createdAt: rangeQ }),
      Contact.aggregate([
        { $match: { workspace: workspaceId, createdAt: rangeQ } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: todayStart } } },
        { $group: { _id: '$direction', count: { $sum: 1 } } },
      ]),
      Campaign.find({ workspace: workspaceId }).select('name type status stats createdAt').sort('-createdAt').limit(5).lean(),
      CallSession.aggregate([
        { $match: { workspace: workspaceId, createdAt: rangeQ } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, seconds: { $sum: { $ifNull: ['$duration', 0] } } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const campaignStats = { total: 0, running: 0, scheduled: 0, completed: 0, draft: 0, paused: 0, failed: 0, sentTotal: 0 };
    campaignAgg.forEach(c => { campaignStats.total += c.count; campaignStats.sentTotal += c.sent || 0; if (campaignStats[c._id] !== undefined) campaignStats[c._id] = c.count; });
    const templateStats = { total: 0, approved: 0, pending: 0, rejected: 0 };
    templateAgg.forEach(t => { templateStats.total += t.count; if (templateStats[t._id] !== undefined) templateStats[t._id] = t.count; });
    const calls = callAgg[0] || { total: 0, completed: 0, failed: 0, seconds: 0 };
    const [hourlyAgg, weekdayAgg, topCustomersAgg, campaignTable, typeAgg, respMsgs] = await Promise.all([
      Message.aggregate([
        { $match: { workspace: workspaceId, direction: 'inbound', createdAt: rangeQ } },
        { $group: { _id: { $dateToString: { format: '%H', date: '$createdAt', timezone: 'Asia/Shanghai' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, direction: 'inbound', createdAt: rangeQ } },
        { $group: { _id: { $dateToString: { format: '%u', date: '$createdAt', timezone: 'Asia/Shanghai' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, createdAt: rangeQ } },
        { $group: { _id: '$contact', total: { $sum: 1 },
          inbound: { $sum: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] } },
          outbound: { $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] } },
          lastAt: { $max: '$createdAt' } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'contacts', localField: '_id', foreignField: '_id', as: 'contact' } },
        { $unwind: { path: '$contact', preserveNullAndEmptyArrays: true } },
        { $project: { total: 1, inbound: 1, outbound: 1, lastAt: 1, name: '$contact.name', phone: '$contact.phone' } },
      ]),
      Campaign.find({ workspace: workspaceId }).select('name type status stats createdAt').sort('-createdAt').limit(100).lean(),
      Message.aggregate([
        { $match: { workspace: workspaceId, direction: 'outbound', createdAt: rangeQ } },
        { $group: { _id: { $ifNull: ['$metadata.source', { $cond: [{ $eq: ['$type', 'template'] }, 'template', 'manual'] }] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Message.find({ workspace: workspaceId, createdAt: rangeQ })
        .select('conversation direction createdAt').sort('createdAt').limit(3000).lean(),
    ]);

    // Average response time: inbound followed by next outbound in same conversation
    const lastInbound = new Map();
    const respDiffs = [];
    for (const msg of respMsgs) {
      const key = String(msg.conversation);
      if (msg.direction === 'inbound') {
        lastInbound.set(key, msg.createdAt);
      } else if (lastInbound.has(key)) {
        const diff = (new Date(msg.createdAt) - new Date(lastInbound.get(key))) / 60000;
        if (diff >= 0 && diff <= 24 * 60) respDiffs.push(diff);
        lastInbound.delete(key);
      }
    }
    respDiffs.sort((a, b) => a - b);
    const avgResponseMin = respDiffs.length ? respDiffs.reduce((a, b) => a + b, 0) / respDiffs.length : 0;
    const medianResponseMin = respDiffs.length ? respDiffs[Math.floor(respDiffs.length / 2)] : 0;


    const ContactNote = require('../models/ContactNote');
    const BotFlow = require('../models/BotFlow');
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const [dueReminders, resolvedCount, botFlowsActive] = await Promise.all([
      ContactNote.find({ workspace: workspaceId, remindAt: { $lte: todayEnd }, contacted: { $ne: true } })
        .populate('contact', 'name phone').select('text remindAt contact').sort('remindAt').limit(6).lean(),
      Conversation.countDocuments({ workspace: workspaceId, status: 'closed' }),
      BotFlow.countDocuments({ workspace: workspaceId, isActive: true }),
    ]);

    const agentPerformance = await computeAgentPerformance(req.workspace, days, {
      userId: req.user._id, ...(rangeEnd ? { from: thirtyDaysAgo, to: rangeEnd } : {}),
    });

    const todayMsgs = { sent: 0, received: 0 };
    todayMsgAgg.forEach(m => { if (m._id === 'outbound') todayMsgs.sent = m.count; if (m._id === 'inbound') todayMsgs.received = m.count; });

    res.json({
      success: true,
      data: {
        contacts: totalContacts,
        conversations: {
          total: totalConversations,
          active: activeConversations,
        },
        messages: {
          sent: stats.sent || 0,
          delivered: stats.delivered || 0,
          read: stats.read || 0,
          failed: stats.failed || 0,
          total: Object.values(stats).reduce((a, b) => a + b, 0),
        },
        messageChart: recentMessages,
        recentConversations,
        whatsappConnected: req.workspace.whatsapp?.isConnected || false,
        campaigns: campaignStats,
        recentCampaigns: campaignRecent,
        templates: templateStats,
        presets: presetCount,
        aiCalls: { total: calls.total, completed: calls.completed, failed: calls.failed, minutes: Math.round((calls.seconds || 0) / 60) },
        callChart,
        keywords: keywordCount,
        unreadCount: unreadAgg[0]?.unread || 0,
        newContacts,
        contactChart,
        today: todayMsgs,
        rangeDays: rangeDays,
        role: 'owner',
        agentPerformance,
        hourlyActivity: hourlyAgg.map(h => ({ hour: parseInt(h._id, 10), count: h.count })),
        weekdayActivity: weekdayAgg.map(w => ({ day: parseInt(w._id, 10), count: w.count })),
        topCustomers: topCustomersAgg,
        campaignTable,
        typeBreakdown: typeAgg.map(t => ({ source: t._id || 'manual', count: t.count })),
        responseTime: { avgMinutes: Math.round(avgResponseMin * 10) / 10, medianMinutes: Math.round(medianResponseMin * 10) / 10, samples: respDiffs.length },
        dueReminders,
        resolvedCount,
        botFlowsActive,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/admin/dashboard
const getAdminDashboard = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const rangeQ = { $gte: thirtyDaysAgo };
    const Workspace = require('../models/Workspace');
    const CallSession = require('../models/CallSession');
    const [totalUsers, activeUsers, recentSignups, todaySignups, userGrowthChart,
      workspaces, msgSent30, msgRecv30, campaigns, aiCalls30, msgToday] = await Promise.all([
      User.countDocuments({ role: 'vendor' }),
      User.countDocuments({ role: 'vendor', status: 'active' }),
      User.find({ role: 'vendor' }).select('name email status createdAt lastLogin').sort('-createdAt').limit(10),
      User.countDocuments({ role: 'vendor', createdAt: { $gte: todayStart } }),
      User.aggregate([
        { $match: { role: 'vendor', createdAt: rangeQ } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Workspace.countDocuments({}),
      Message.countDocuments({ direction: 'outbound', createdAt: rangeQ }),
      Message.countDocuments({ direction: 'inbound', createdAt: rangeQ }),
      Campaign.countDocuments({}),
      CallSession.countDocuments({ createdAt: rangeQ }),
      Message.countDocuments({ createdAt: { $gte: todayStart } }),
    ]);
    res.json({ success: true, data: {
      users: { total: totalUsers, active: activeUsers },
      recentSignups, todaySignups, userGrowthChart,
      platform: { workspaces, msgSent30, msgRecv30, campaigns, aiCalls30, msgToday },
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getClientDashboard, getAdminDashboard };
