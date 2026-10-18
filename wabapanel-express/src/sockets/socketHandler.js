const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Conversation = require('../models/Conversation');

const canAccessWorkspace = async (user, workspaceId) => {
  if (user.role === 'super_admin') return true;
  if (!workspaceId || !/^[a-f\d]{24}$/i.test(String(workspaceId))) return false;
  const ws = await Workspace.findOne({
    _id: workspaceId,
    $or: [{ owner: user._id }, { 'members.user': user._id }],
  }).select('_id').lean();
  return !!ws;
};

const setupSocket = (io) => {
  // Auth middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
      if (decoded.twofa) return next(new Error('Authentication failed'));
      const user = await User.findById(decoded.id).select('-password');
      if (!user) return next(new Error('User not found'));
      if (user.status !== 'active') return next(new Error('Account is suspended'));

      socket.user = user;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.user._id})`);
    socket.join(`user:${socket.user._id}`);

    // Join workspace room
    socket.on('join_workspace', async (workspaceId) => {
      try {
        if (!(await canAccessWorkspace(socket.user, workspaceId))) return;
        socket.join(`workspace:${workspaceId}`);
        (socket.data.workspaceIds ||= new Set()).add(String(workspaceId));
        console.log(`${socket.user.name} joined workspace:${workspaceId}`);
      } catch {}
    });

    socket.on('leave_workspace', (workspaceId) => {
      socket.leave(`workspace:${workspaceId}`);
      socket.data.workspaceIds?.delete(String(workspaceId));
    });

    // Join conversation room
    socket.on('join_conversation', async (conversationId) => {
      try {
        if (!conversationId || !/^[a-f\d]{24}$/i.test(String(conversationId))) return;
        const conv = await Conversation.findById(conversationId).select('workspace').lean();
        if (!conv || !(await canAccessWorkspace(socket.user, conv.workspace))) return;
        socket.join(`conversation:${conversationId}`);
      } catch {}
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Typing indicators
    socket.on('typing_start', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('agent_typing', {
        conversationId,
        agent: { _id: socket.user._id, name: socket.user.name },
      });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('agent_stopped_typing', {
        conversationId,
        agentId: socket.user._id,
      });
    });

    // Online status
    socket.on('set_status', (status) => {
      emitStatusToWorkspaces(socket, { userId: socket.user._id, status });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.name}`);
      emitStatusToWorkspaces(socket, { userId: socket.user._id, status: 'offline' });
    });
  });
};

function emitStatusToWorkspaces(socket, payload) {
  const ids = socket.data.workspaceIds;
  if (!ids || !ids.size) return;
  let op = socket;
  for (const id of ids) op = op.to(`workspace:${id}`);
  op.emit('user_status_change', payload);
}

module.exports = setupSocket;
