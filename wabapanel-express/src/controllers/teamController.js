const Team = require('../models/Team');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');

const isWorkspaceManager = (ws, user) => {
  if (['super_admin', 'admin'].includes(user.role)) return true;
  const uid = String(user._id);
  if (String(ws.owner) === uid) return true;
  return (ws.members || []).some(m => String(m.user) === uid && ['owner', 'admin'].includes(m.role));
};

const isWorkspaceAgent = (ws, targetId) => {
  const tid = String(targetId);
  if (String(ws.owner) === tid) return false;
  return (ws.members || []).some(m => String(m.user) === tid);
};

// Owner-level: platform super_admin, workspace owner, or member with role 'owner'.
const isWorkspaceOwnerLevel = (ws, user) => {
  if (user.role === 'super_admin') return true;
  const uid = String(user._id);
  if (String(ws.owner) === uid) return true;
  return (ws.members || []).some(m => String(m.user) === uid && m.role === 'owner');
};

// A manager may manage a target if owner-level, or if the target is a plain 'agent' member.
const canManageMember = (ws, actor, targetId) => {
  if (isWorkspaceOwnerLevel(ws, actor)) return true;
  const tid = String(targetId);
  if (String(ws.owner) === tid) return false;
  const m = (ws.members || []).find(x => String(x.user) === tid);
  return !!m && m.role === 'agent';
};

const getTeams = async (req, res) => {
  try {
    const teams = await Team.find({ workspace: req.workspace._id })
      .populate('members', 'name email avatar')
      .populate('lead', 'name email');
    res.json({ success: true, data: teams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createTeam = async (req, res) => {
  try {

    const team = await Team.create({ ...req.body, workspace: req.workspace._id });
    res.status(201).json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateTeam = async (req, res) => {
  try {
    const team = await Team.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      require('../utils/stripProtected')(req.body), // SEC-IDOR
      { new: true }
    );
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getTeam = async (req, res) => {
  try {
    const team = await Team.findOne({ _id: req.params.id, workspace: req.workspace._id })
      .populate('members', 'name email avatar')
      .populate('lead', 'name email');
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const listAgents = async (req, res) => {
  try {
    // Only this workspace's people: current user, owner and members
    const ids = new Set();
    if (req.user._id) ids.add(String(req.user._id));
    if (req.workspace.owner) ids.add(String(req.workspace.owner));
    for (const m of (req.workspace.members || [])) {
      if (m.user) ids.add(String(m.user));
    }
    // Legacy agents created before workspace linking existed: they belong to
    // no workspace at all, so surface them here for cleanup/re-creation.
    // SEC-PUB：只对工作区管理者展示（原先任意成员可枚举全平台未挂靠账号）
    const candidates = isWorkspaceManager(req.workspace, req.user)
      ? await User.find({ role: { $in: ['agent', 'user'] }, status: 'active' }).select('_id')
      : [];
    const candidateIds = candidates.map(c => c._id);
    if (candidateIds.length) {
      const Workspace = require('../models/Workspace');
      const linked = await Workspace.find({
        $or: [{ 'members.user': { $in: candidateIds } }, { owner: { $in: candidateIds } }],
      }).select('members.user owner');
      const linkedSet = new Set();
      for (const w of linked) {
        linkedSet.add(String(w.owner));
        for (const m of (w.members || [])) if (m.user) linkedSet.add(String(m.user));
      }
      for (const c of candidateIds) if (!linkedSet.has(String(c))) ids.add(String(c));
    }
    const users = await User.find({ _id: { $in: Array.from(ids) } }).select('name email avatar role permissions allowedChannels inboxScope');
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addAgent = async (req, res) => {
  try {
    // SEC-H3：与 removeAgent/updateAgent 对齐——只有工作区 owner/管理员能添加客服。
    // 此前漏了这道闸，受限 agent 可自建一个全权限新 agent 绕过自身限制。
    if (!isWorkspaceManager(req.workspace, req.user)) {
      return res.status(403).json({ success: false, message: '只有工作区所有者或管理员可以添加客服' });
    }

    const { userId, teamId, name, email, password, role, permissions, allowedChannels, inboxScope } = req.body;

    // Create a new agent user when name/email/password provided
    if (!userId && email && password) {
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(400).json({ success: false, message: 'A user with this email already exists' });
      const user = await User.create({
        name, email: email.toLowerCase(), password,
        role: 'agent', // vendors can only create agents; platform admin role is never assignable here
        status: 'active',
        permissions: Array.isArray(permissions) ? permissions : [],
        allowedChannels: Array.isArray(allowedChannels) ? allowedChannels : [],
        inboxScope: inboxScope === 'assigned' ? 'assigned' : 'all',
        currentWorkspace: req.workspace._id,
      });
      // Add the agent as a workspace member so they log into this vendor's
      // workspace and see its WhatsApp number, templates, contacts etc.
      const Workspace = require('../models/Workspace');
      await Workspace.updateOne(
        { _id: req.workspace._id, 'members.user': { $ne: user._id } },
        { $push: { members: { user: user._id, role: 'agent' } } }
      );
      if (teamId) {
        const t = await Team.findOne({ _id: teamId, workspace: req.workspace._id });
        if (t && !t.members.includes(user._id)) { t.members.push(user._id); await t.save(); }
      }
      return res.status(201).json({ success: true, data: { _id: user._id, name: user.name, email: user.email, role: user.role } });
    }

    const team = await Team.findOne({ _id: teamId || req.params.id, workspace: req.workspace._id });
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

    // SEC-IDOR：userId 必须是本工作区成员（否则 populate 会泄露平台任意用户的姓名/邮箱）
    const uid = String(userId || '');
    const isWsMember = String(req.workspace.owner) === uid
      || (req.workspace.members || []).some((m) => String(m.user) === uid);
    if (!isWsMember) return res.status(400).json({ success: false, message: '该用户不是本工作区成员' });

    if (!team.members.includes(userId)) {
      team.members.push(userId);
      await team.save();
    }

    const populated = await Team.findById(team._id)
      .populate('members', 'name email avatar');
    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const removeAgent = async (req, res) => {
  try {
    const { teamId } = req.query;
    if (!isWorkspaceManager(req.workspace, req.user)) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }
    if (teamId || req.params.teamId) {
      const team = await Team.findOne({ _id: teamId || req.params.teamId, workspace: req.workspace._id });
      if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
      team.members = team.members.filter(m => m.toString() !== req.params.id);
      await team.save();
      return res.json({ success: true, message: 'Agent removed from team' });
    }

    // No team specified: delete the agent account itself.
    if (!isWorkspaceManager(req.workspace, req.user)) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }
    if (!isWorkspaceAgent(req.workspace, req.params.id)) {
      const Workspace = require('../models/Workspace');
      const linked = await Workspace.exists({
        $or: [{ owner: req.params.id }, { 'members.user': req.params.id }],
      });
      if (linked) return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    if (!canManageMember(req.workspace, req.user, req.params.id)) {
      return res.status(403).json({ success: false, message: 'Only the workspace owner can delete admins' });
    }
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'Agent not found' });
    if (!['agent', 'user'].includes(target.role) || String(req.workspace.owner) === String(target._id)) {
      return res.status(403).json({ success: false, message: 'Only agent accounts can be deleted here' });
    }
    await Team.updateMany({ workspace: req.workspace._id }, { $pull: { members: target._id } });
    await User.findByIdAndDelete(target._id);
    try { global.io?.in('user:' + target._id).disconnectSockets(true); } catch {}
    res.json({ success: true, message: 'Agent deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/teams/agents/:id/login-as — vendor logs into an agent's account
const loginAsAgent = async (req, res) => {
  try {
    if (req.user.role === 'agent') {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }
    if (!isWorkspaceManager(req.workspace, req.user) || !isWorkspaceAgent(req.workspace, req.params.id)) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    const target = await User.findOne({ _id: req.params.id, role: { $in: ['agent', 'user'] }, status: 'active' });
    if (!target) return res.status(404).json({ success: false, message: 'Agent not found' });
    const token = generateToken(target._id, '24h');
    target.lastLogin = new Date();
    await target.save();
    const userData = target.toObject();
    delete userData.password;
    res.json({ success: true, data: { token, user: userData } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteTeam = async (req, res) => {
  try {
    await Team.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true, message: 'Team deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Per-agent stats for a workspace. opts: { from, to } (valid Dates) override `days`;
// opts.userId = requesting user (always included); opts.onlyUserId = return just that user's row.
const computeAgentPerformance = async (workspace, days = 30, opts = {}) => {
  {
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');
    const until = opts.from && opts.to ? opts.to : null;
    const since = opts.from && opts.to ? opts.from : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const ws = workspace._id;
    const req = { user: { _id: opts.userId }, workspace };
    const timeRange = until ? { $gte: since, $lte: until } : { $gte: since };

    // Scope agents to THIS workspace only (same logic as listAgents), so one
    // vendor's performance table never shows another vendor's agents.
    const ids = new Set();
    if (req.user._id) ids.add(String(req.user._id));
    if (req.workspace.owner) ids.add(String(req.workspace.owner));
    for (const m of (req.workspace.members || [])) {
      if (m.user) ids.add(String(m.user));
    }
    const candidates = await User.find({ role: { $in: ['agent', 'user'] }, status: 'active' }).select('_id');
    const candidateIds = candidates.map(c => c._id);
    if (candidateIds.length) {
      const Workspace = require('../models/Workspace');
      const linked = await Workspace.find({
        $or: [{ 'members.user': { $in: candidateIds } }, { owner: { $in: candidateIds } }],
      }).select('members.user owner');
      const linkedSet = new Set();
      for (const w of linked) {
        linkedSet.add(String(w.owner));
        for (const m of (w.members || [])) if (m.user) linkedSet.add(String(m.user));
      }
      for (const c of candidateIds) if (!linkedSet.has(String(c))) ids.add(String(c));
    }
    if (opts.onlyUserId) { ids.clear(); ids.add(String(opts.onlyUserId)); }
    const agents = await User.find({ _id: { $in: Array.from(ids) }, status: 'active' }).select('name email avatar role').lean();

    const [assigned, resolved, sent, responseAgg] = await Promise.all([
      Conversation.aggregate([
        { $match: { workspace: ws, assignedAgent: { $ne: null } } },
        { $group: { _id: '$assignedAgent', count: { $sum: 1 } } },
      ]),
      Conversation.aggregate([
        { $match: { workspace: ws, isResolved: true, resolvedBy: { $ne: null }, resolvedAt: timeRange } },
        { $group: { _id: '$resolvedBy', count: { $sum: 1 } } },
      ]),
      Message.aggregate([
        { $match: { workspace: ws, direction: 'outbound', sentBy: { $ne: null }, createdAt: timeRange } },
        { $group: { _id: '$sentBy', count: { $sum: 1 } } },
      ]),
      Message.aggregate([
        { $match: { workspace: ws, createdAt: timeRange } },
        { $sort: { conversation: 1, createdAt: 1 } },
        { $project: { conversation: 1, direction: 1, createdAt: 1, sentBy: 1 } },
      ]),
    ]);

    // avg response time per agent: inbound followed by that agent's outbound
    const respTotals = {};
    let lastInbound = {};
    for (const m of responseAgg) {
      const convId = String(m.conversation);
      if (m.direction === 'inbound') {
        lastInbound[convId] = new Date(m.createdAt).getTime();
      } else if (m.sentBy && lastInbound[convId]) {
        const key = String(m.sentBy);
        const diff = new Date(m.createdAt).getTime() - lastInbound[convId];
        if (diff > 0 && diff < 24 * 36e5) {
          if (!respTotals[key]) respTotals[key] = { sum: 0, n: 0 };
          respTotals[key].sum += diff; respTotals[key].n += 1;
        }
        delete lastInbound[convId];
      }
    }

    const toMap = (arr) => Object.fromEntries(arr.map(a => [String(a._id), a.count]));
    const assignedMap = toMap(assigned), resolvedMap = toMap(resolved), sentMap = toMap(sent);

    return agents.map(a => {
      const id = String(a._id);
      const rt = respTotals[id];
      return {
        ...a,
        assignedChats: assignedMap[id] || 0,
        resolvedChats: resolvedMap[id] || 0,
        messagesSent: sentMap[id] || 0,
        avgResponseMins: rt ? Math.round(rt.sum / rt.n / 60000 * 10) / 10 : null,
      };
    });
  }
};

// @GET /api/teams/performance — per-agent stats (last 30 days); non-managers get only their own row
const agentPerformance = async (req, res) => {
  try {
    const manager = isWorkspaceManager(req.workspace, req.user);
    const data = await computeAgentPerformance(req.workspace, 30, {
      userId: req.user._id,
      onlyUserId: manager ? null : req.user._id,
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  agentPerformance, computeAgentPerformance, isWorkspaceManager,
  getTeams, getTeam, createTeam, updateTeam, deleteTeam,
  listAgents, addAgent, removeAgent, updateAgent, loginAsAgent,
};

// @PUT /api/teams/agents/:id — update an agent's role and module permissions
async function updateAgent(req, res) {
  try {
    const { role, permissions, allowedChannels, inboxScope } = req.body;
    if (!isWorkspaceManager(req.workspace, req.user)) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }
    if (!isWorkspaceAgent(req.workspace, req.params.id)) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    if (!canManageMember(req.workspace, req.user, req.params.id)) {
      return res.status(403).json({ success: false, message: 'Only the workspace owner can modify admins' });
    }
    const update = {};
    if (Array.isArray(permissions)) update.permissions = permissions;
    if (Array.isArray(allowedChannels)) update.allowedChannels = allowedChannels;
    if (inboxScope === 'all' || inboxScope === 'assigned') update.inboxScope = inboxScope;
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: { $in: ['agent', 'admin', 'user'] } },
      update, { new: true }
    ).select('name email role permissions allowedChannels inboxScope');
    if (!user) return res.status(404).json({ success: false, message: 'Agent not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}
