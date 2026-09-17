import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// A reconnect gives a new socket id, so the server rooms joined earlier are gone.
// The rooms are remembered here and re-joined on every connect, otherwise live
// events (new messages, delivery/read status) stop arriving until a page reload.
let joinedWorkspace: string | null = null;
let joinedConversation: string | null = null;

export const getSocket = (): Socket | null => socket;

export const connectSocket = (token: string): Socket => {
  // MSG-16: reuse the socket while it is connected OR still connecting/reconnecting
  // (a second call during the handshake used to open a second socket). A socket made
  // for a different token is closed and replaced.
  if (socket && (socket.connected || socket.active)) {
    if ((socket.auth as { token?: string } | undefined)?.token === token) return socket;
    socket.disconnect();
  }

  const s = io(process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000'), {
    path: process.env.NEXT_PUBLIC_SOCKET_PATH || '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
  socket = s;

  s.on('connect', () => {
    // MSG-16: emit on this socket (the one that connected), not the shared variable.
    if (joinedWorkspace) s.emit('join_workspace', joinedWorkspace);
    if (joinedConversation) s.emit('join_conversation', joinedConversation);
  });
  s.on('disconnect', () => console.log('Socket disconnected'));
  s.on('connect_error', (err) => console.error('Socket error:', err.message));

  return s;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
  joinedWorkspace = null;
  joinedConversation = null;
};

export const joinWorkspace = (workspaceId: string) => {
  joinedWorkspace = workspaceId;
  socket?.emit('join_workspace', workspaceId);
};

export const leaveWorkspace = (workspaceId: string) => {
  if (joinedWorkspace === workspaceId) joinedWorkspace = null;
  socket?.emit('leave_workspace', workspaceId);
};

export const joinConversation = (conversationId: string) => {
  joinedConversation = conversationId;
  socket?.emit('join_conversation', conversationId);
};

export const leaveConversation = (conversationId: string) => {
  if (joinedConversation === conversationId) joinedConversation = null;
  socket?.emit('leave_conversation', conversationId);
};

export const emitTyping = (conversationId: string, isTyping: boolean) => {
  socket?.emit(isTyping ? 'typing_start' : 'typing_stop', { conversationId });
};
