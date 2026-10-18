const Message = require('../models/Message');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Campaign = require('../models/Campaign');
const User = require('../models/User');

// @GET /api/dashboard (Client Dashboard)
const getClientDashboard = async (req, res) => {
  try {
    const workspaceId = req.workspace._id;
    const now = new Date();
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const thirtyDaysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
        { $match: { workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: '$status',
          count: { $sum: 1 },
        }},
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } } },
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
      Contact.countDocuments({ workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } }),
      Contact.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: todayStart } } },
        { $group: { _id: '$direction', count: { $sum: 1 } } },
      ]),
      Campaign.find({ workspace: workspaceId }).select('name type status stats createdAt').sort('-createdAt').limit(5).lean(),
      CallSession.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } } },
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
        { $match: { workspace: workspaceId, direction: 'inbound', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%H', date: '$createdAt', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, direction: 'inbound', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%u', date: '$createdAt', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Message.aggregate([
        { $match: { workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } } },
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
        { $match: { workspace: workspaceId, direction: 'outbound', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $ifNull: ['$metadata.source', { $cond: [{ $eq: ['$type', 'template'] }, 'template', 'manual'] }] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Message.find({ workspace: workspaceId, createdAt: { $gte: thirtyDaysAgo } })
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
        rangeDays: days,
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
    const Workspace = require('../models/Workspace');
    const CallSession = require('../models/CallSession');
    const [totalUsers, activeUsers, recentSignups, todaySignups, userGrowthChart,
      workspaces, msgSent30, msgRecv30, campaigns, aiCalls30, msgToday] = await Promise.all([
      User.countDocuments({ role: 'vendor' }),
      User.countDocuments({ role: 'vendor', status: 'active' }),
      User.find({ role: 'vendor' }).select('name email status createdAt lastLogin').sort('-createdAt').limit(10),
      User.countDocuments({ role: 'vendor', createdAt: { $gte: todayStart } }),
      User.aggregate([
        { $match: { role: 'vendor', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Workspace.countDocuments({}),
      Message.countDocuments({ direction: 'outbound', createdAt: { $gte: thirtyDaysAgo } }),
      Message.countDocuments({ direction: 'inbound', createdAt: { $gte: thirtyDaysAgo } }),
      Campaign.countDocuments({}),
      CallSession.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
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
