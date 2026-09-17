import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;

    const workspaceId = localStorage.getItem('workspaceId');
    if (workspaceId) config.headers['x-workspace-id'] = workspaceId;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const reqUrl = (error.config && error.config.url) || '';
    const isAuthRequest = /\/auth\/(login|admin\/login|register)/.test(reqUrl);
    if (error.response?.status === 401 && !isAuthRequest) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('workspaceId');
        localStorage.removeItem('adminToken'); // ADM-23: never keep an impersonation switch-back token
        window.location.href = '/auth/login';
      }
    }
    // SEC-31: an agent without this module's permission gets 403 from requireModule — say so
    // (no redirect/logout; exact requireModule message only; one toast id so repeats don't stack)
    const msg = error.response?.data?.message;
    if (error.response?.status === 403 && msg === 'You do not have access to this module'
        && typeof window !== 'undefined') {
      toast.error(msg, { id: 'module-permission-403' });
    }
    return Promise.reject(error);
  }
);

// PERF-13: identical GETs that are in flight at the same time (same URL + params + token +
// workspace) share one network request; cachedGet() adds an opt-in short TTL cache. Any
// non-GET request through `api` clears the TTL cache. /auth/ calls are never deduped or
// cached. Store/licence status calls use fetch(), not this axios instance, so never pass here.
const NO_CACHE_RE = /\/auth\//;
const baseAdapter = axios.getAdapter(axios.defaults.adapter);
const inflight = new Map<string, Promise<AxiosResponse>>();
const ttlCache = new Map<string, { exp: number; res: AxiosResponse }>();

api.defaults.adapter = (config) => {
  if ((config.method || 'get').toLowerCase() !== 'get') { ttlCache.clear(); return baseAdapter(config); }
  if (NO_CACHE_RE.test(config.url || '') || config.signal || config.cancelToken ||
      (config.responseType && config.responseType !== 'json') || config.onDownloadProgress) return baseAdapter(config);
  const h = config.headers || {};
  const key = [api.getUri(config), h.Authorization || '', h['x-workspace-id'] || ''].join('|');
  const ttl = (config as { cacheTtl?: number }).cacheTtl || 0;
  const hit = ttl ? ttlCache.get(key) : undefined;
  if (hit && hit.exp > Date.now()) return Promise.resolve({ ...hit.res, config });
  let p = inflight.get(key);
  if (!p) {
    p = baseAdapter(config)
      .then((res) => { if (ttl) ttlCache.set(key, { exp: Date.now() + ttl, res }); return res; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  // each caller gets its own response object (raw body), so transforms/mutations never leak
  return p.then((res) => ({ ...res, config }));
};

export const cachedGet = (url: string, ttlMs = 30000, config: AxiosRequestConfig = {}) =>
  api.get(url, { ...config, cacheTtl: ttlMs } as AxiosRequestConfig);

export default api;

export const pushApi = {
  vapidPublicKey: () => api.get('/push/vapid-public-key'),
  subscribe: (data: { endpoint: string; keys: { p256dh: string; auth: string } }) => api.post('/push/subscribe', data),
  unsubscribe: (endpoint: string) => api.post('/push/unsubscribe', { endpoint }),
};

// Auth
export const authApi = {
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  adminLogin: (data: { email: string; password: string }) => api.post('/auth/admin/login', data),
  register: (data: { name?: string; email: string; password: string; phone?: string; ref?: string }) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data: Partial<{ name: string; phone: string; avatar: string }>) => api.put('/auth/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) => api.put('/auth/change-password', data),
  verifyEmail: (token: string) => api.post('/auth/verify-email', { token }),
  resendVerification: (email: string) => api.post('/auth/resend-verification', { email }),
  switchWorkspace: (workspaceId: string) => api.put(`/auth/switch-workspace/${workspaceId}`),
  // 2FA
  twoFactorStatus: () => api.get('/auth/2fa/status'),
  twoFactorSetup: (method: 'app' | 'email') => api.post('/auth/2fa/setup', { method }),
  twoFactorVerify: (code: string) => api.post('/auth/2fa/verify', { code }),
  twoFactorResend: () => api.post('/auth/2fa/resend'),
  twoFactorDisable: (password?: string) => api.post('/auth/2fa/disable', { password }),
  twoFactorLoginVerify: (data: { challengeToken: string; code: string }) => api.post('/auth/2fa/login-verify', data),
  twoFactorLoginResend: (challengeToken: string) => api.post('/auth/2fa/login-resend', { challengeToken }),
};

export const tgPersonalApi = {
  connectQr: () => api.post('/tgpersonal/connect-qr', {}),
  connect: (phone: string, apiId?: string, apiHash?: string) => api.post('/tgpersonal/connect', { apiId, apiHash, phone }),
  code: (code: string) => api.post('/tgpersonal/code', { code }),
  password: (password: string) => api.post('/tgpersonal/password', { password }),
  status: () => api.get('/tgpersonal/status'),
  disconnect: () => api.post('/tgpersonal/disconnect', {}),
};

// Workspaces
export const waqrApi = {
  connect: () => api.post('/waqr/connect', {}),
  status: () => api.get('/waqr/status'),
  sync: () => api.post('/waqr/sync', {}),
  settings: (dailyLimit: number) => api.post('/waqr/settings', { dailyLimit }),
  sendNew: (phone: string, text: string) => api.post('/waqr/send-new', { phone, text }),
  disconnect: () => api.post('/waqr/disconnect', {}),
};

export const workspaceApi = {
  list: () => api.get('/workspaces'),
  get: (id: string) => api.get(`/workspaces/${id}`),
  create: (data: { name: string }) => api.post('/workspaces', data),
  update: (id: string, data: object) => api.put(`/workspaces/${id}`, data),
  delete: (id: string) => api.delete(`/workspaces/${id}`),
  addMember: (id: string, data: { email: string; role: string }) => api.post(`/workspaces/${id}/members`, data),
  removeMember: (id: string, userId: string) => api.delete(`/workspaces/${id}/members/${userId}`),
  updateWhatsApp: (id: string, data: object) => api.put(`/workspaces/${id}/whatsapp`, data),
  getWhatsAppSignupConfig: (id: string) => api.get(`/workspaces/${id}/whatsapp/embedded-signup/config`),
  refreshWhatsAppDetails: (id: string) => api.post(`/workspaces/${id}/whatsapp/refresh`),
  getWhatsAppHealth: (id: string) => api.get(`/workspaces/${id}/whatsapp/health`),
  diagnoseWhatsApp: (id: string, fix = false) => api.get(`/workspaces/${id}/whatsapp/diagnose${fix ? '?fix=1' : ''}`),
  getSendingLimits: (id: string) => api.get(`/workspaces/${id}/whatsapp/sending-limits`),
  updateSendingLimits: (id: string, data: object) => api.put(`/workspaces/${id}/whatsapp/sending-limits`, data),
  embeddedSignup: (id: string, data: object) => api.post(`/workspaces/${id}/whatsapp/embedded-signup`, data),
  // ADM-21: full disconnect (unsubscribes the app from the WABA + local reset), owner only
  disconnectWhatsApp: (id: string) => api.post(`/workspaces/${id}/whatsapp/disconnect`),
  coexistenceSync: (id: string) => api.post(`/workspaces/${id}/whatsapp/coexistence-sync`),
};

// Contacts
export const contactApi = {
  list: (params?: Record<string, unknown>) => api.get('/contacts', { params }),
  get: (id: string) => api.get(`/contacts/${id}`),
  create: (data: object) => api.post('/contacts', data),
  update: (id: string, data: object) => api.put(`/contacts/${id}`, data),
  delete: (id: string) => api.delete(`/contacts/${id}`),
  import: (formData: FormData) => api.post('/contacts/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  export: () => api.get('/contacts/export', { responseType: 'blob' }),
  bulkDelete: (ids: string[]) => api.post('/contacts/bulk-delete', { ids }),
  bulkAssign: (data: { ids: string[]; tags?: string[]; segments?: string[]; mode?: 'add' | 'remove' }) =>
    api.post('/contacts/bulk-assign', data),
};

// Segments
export const segmentApi = {
  list: () => api.get('/segments'),
  get: (id: string) => api.get(`/segments/${id}`),
  create: (data: object) => api.post('/segments', data),
  update: (id: string, data: object) => api.put(`/segments/${id}`, data),
  delete: (id: string) => api.delete(`/segments/${id}`),
  getContacts: (id: string) => api.get(`/segments/${id}/contacts`),
};

// Tags
export const tagApi = {
  list: () => api.get('/tags'),
  create: (data: { name: string; color: string }) => api.post('/tags', data),
  update: (id: string, data: object) => api.put(`/tags/${id}`, data),
  delete: (id: string) => api.delete(`/tags/${id}`),
};

// Templates
export const templateApi = {
  list: (params?: Record<string, unknown>) => api.get('/templates', { params }),
  get: (id: string) => api.get(`/templates/${id}`),
  create: (data: object) => api.post('/templates', data),
  update: (id: string, data: object) => api.put(`/templates/${id}`, data),
  delete: (id: string) => api.delete(`/templates/${id}`),
  syncFromWhatsApp: () => api.post('/templates/sync'),
  library: (params?: Record<string, unknown>) => api.get('/templates/library', { params }),
  useFromLibrary: (presetId: string) => api.post(`/templates/library/${presetId}`, {}),
  flagForReview: (id: string, body?: { category?: string; createCopy?: boolean; copyName?: string }) => api.post(`/templates/${id}/flag-review`, body || {}),
};

// Campaigns
export const campaignApi = {
  list: (params?: Record<string, unknown>) => api.get('/campaigns', { params }),
  get: (id: string) => api.get(`/campaigns/${id}`),
  create: (data: object) => api.post('/campaigns', data),
  update: (id: string, data: object) => api.put(`/campaigns/${id}`, data),
  delete: (id: string) => api.delete(`/campaigns/${id}`),
  start: (id: string) => api.post(`/campaigns/${id}/start`),
  schedule: (id: string, data: { scheduledAt: string; recurrence: string }) => api.post(`/campaigns/${id}/schedule`, data),
  pause: (id: string) => api.post(`/campaigns/${id}/pause`),
  abResults: (id: string) => api.get(`/campaigns/${id}/ab-results`),
  report: (id: string) => api.get(`/campaigns/${id}/report`),
  resendFailed: (id: string, opts?: { templateId?: string; audience?: string }) => api.post(`/campaigns/${id}/resend-failed`, opts || {}),
};

// Smart Broadcast (advanced: utility template + send-time variable filling)
export const smartBroadcastApi = {
  templates: () => api.get('/smart-broadcast/templates'),
  createTemplate: (data: object) => api.post('/smart-broadcast/templates', data),
  updateTemplate: (id: string, data: object) => api.put(`/smart-broadcast/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/smart-broadcast/templates/${id}`),
  send: (data: object) => api.post('/smart-broadcast/send', data),
  stopCampaign: (id: string) => api.post(`/smart-broadcast/campaigns/${id}/stop`),
  reports: () => api.get('/smart-broadcast/reports'),
};

// Save Money preset messages
export const presetMessageApi = {
  list: () => api.get('/preset-messages'),
  eligibleCount: () => api.get('/preset-messages/eligible-count'),
  create: (data: object) => api.post('/preset-messages', data),
  update: (id: string, data: object) => api.put(`/preset-messages/${id}`, data),
  delete: (id: string) => api.delete(`/preset-messages/${id}`),
};

// Automations
export const automationApi = {
  getSettings: () => api.get('/automations/settings'),
  updateSettings: (data: object) => api.put('/automations/settings', data),
  syncIcebreakers: () => api.post('/automations/settings/icebreakers/sync'),
  feedbackReport: () => api.get('/automations/feedback-report'),
  list: () => api.get('/automations'),
  get: (id: string) => api.get(`/automations/${id}`),
  create: (data: object) => api.post('/automations', data),
  update: (id: string, data: object) => api.put(`/automations/${id}`, data),
  delete: (id: string) => api.delete(`/automations/${id}`),
  toggle: (id: string) => api.patch(`/automations/${id}/toggle`),
};

// Conversations
export const conversationApi = {
  searchMessages: (q: string, conversation?: string) => api.get('/conversations/search-messages', { params: { q, conversation } }),
  exportChat: (id: string, format = 'csv') => api.get(`/conversations/${id}/export`, { params: { format }, responseType: 'blob' }),
  exportAllChats: (format = 'csv') => api.get('/conversations/export-all', { params: { format }, responseType: 'blob' }),
  list: (params?: Record<string, unknown>) => api.get('/conversations', { params }),
  get: (id: string) => api.get(`/conversations/${id}`),
  getMessages: (id: string, params?: Record<string, unknown>) => api.get(`/conversations/${id}/messages`, { params }),
  sendMessage: (id: string, data: object) => api.post(`/conversations/${id}/messages`, data),
  react: (id: string, messageId: string, emoji: string) => api.post(`/conversations/${id}/react`, { messageId, emoji }),
  subscribePresence: (id: string) => api.post(`/conversations/${id}/presence`),
  assign: (id: string, agentId: string) => api.patch(`/conversations/${id}/assign`, { agentId }),
  resolve: (id: string) => api.patch(`/conversations/${id}/resolve`),
  aiSummary: (id: string) => api.post(`/conversations/${id}/ai-summary`),
  startNew: (data: { contactId: string }) => api.post('/conversations', data),
  toggleAI: (id: string, enabled: boolean, mode?: 'chat' | 'call') => api.patch(`/conversations/${id}/ai-toggle`, { enabled, mode }),
  pin: (id: string, pinned: boolean) => api.patch(`/conversations/${id}/pin`, { pinned }),
  stickerLibrary: () => api.get('/conversations/stickers/library'),
};


export const followupApi = {
  list: () => api.get('/followups'),
  draft: (conversationId: string) => api.post(`/followups/${conversationId}/draft`),
};


export const noteApi = {
  list: (contactId: string) => api.get('/contact-notes', { params: { contact: contactId } }),
  create: (data: { contact: string; text: string; remindAt?: string }) => api.post('/contact-notes', data),
  update: (id: string, data: { text?: string; remindAt?: string | null; contacted?: boolean; contactedRemark?: string }) => api.put(`/contact-notes/${id}`, data),
  delete: (id: string) => api.delete(`/contact-notes/${id}`),
};

// Dashboard
export const dashboardApi = {
  getClientDashboard: () => api.get('/dashboard/client'),
  getAdminDashboard: () => api.get('/dashboard/admin'),
};

// Pipelines

// Forms
export const formApi = {
  list: () => api.get('/forms'),
  get: (id: string) => api.get(`/forms/${id}`),
  create: (data: object) => api.post('/forms', data),
  update: (id: string, data: object) => api.put(`/forms/${id}`, data),
  delete: (id: string) => api.delete(`/forms/${id}`),
  publishFlow: (id: string) => api.post(`/forms/${id}/publish-flow`),
  sendFlow: (id: string, conversationId: string) => api.post(`/forms/${id}/send-flow`, { conversationId }),
  library: () => api.get('/forms/library'),
  useTemplate: (templateId: string, data?: { name?: string }) => api.post(`/forms/library/${templateId}/use`, data || {}),
};

// Short Links
export const shortLinkApi = {
  list: () => api.get('/short-links'),
  create: (data: object) => api.post('/short-links', data),
  update: (id: string, data: object) => api.put(`/short-links/${id}`, data),
  delete: (id: string) => api.delete(`/short-links/${id}`),
  stats: (id: string) => api.get(`/short-links/${id}/stats`),
  qrUrl: (id: string) => `${(process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '')}/short-links/${id}/qr`,
};

// Lead source tracking links / QR codes
export const trackedLinkApi = {
  list: () => api.get('/tracked-links'),
  create: (data: object) => api.post('/tracked-links', data),
  qr: (id: string) => api.get(`/tracked-links/${id}/qr`),
  update: (id: string, data: object) => api.put(`/tracked-links/${id}`, data),
  delete: (id: string) => api.delete(`/tracked-links/${id}`),
};

// Appointments

// Integrations
export const integrationApi = {
  list: () => api.get('/integrations'),
  connect: (data: object) => api.post('/integrations/connect', data),
  disconnect: (type: string) => api.post('/integrations/' + type + '/disconnect'),
  syncSettings: (type: string, data: object) => api.put('/integrations/' + type + '/sync-settings', data),
  sync: (type: string) => api.post('/integrations/' + type + '/sync'),
  setup: (type: string) => api.get('/integrations/' + type + '/setup'),
  submitTemplate: (type: string, presetKey: string) => api.post(`/integrations/${type}/templates/${presetKey}/submit`),
  addTemplate: (type: string, data: object) => api.post(`/integrations/${type}/templates`, data),
  updateTemplate: (type: string, presetKey: string, data: object) => api.put(`/integrations/${type}/templates/${presetKey}`, data),
  deleteTemplate: (type: string, presetKey: string) => api.delete(`/integrations/${type}/templates/${presetKey}`),
  automation: (type: string, data: object) => api.put('/integrations/' + type + '/automation', data),
  allLeads: (params?: object) => api.get('/integrations/leads/all', { params }),
};

// AI Settings
export const aiSettingsApi = {
  get: () => api.get('/ai-settings'),
  update: (data: object) => api.put('/ai-settings', data),
  test: () => api.post('/ai-settings/test'),
  stats: () => api.get('/ai-settings/stats'),
  listKnowledgeDocs: () => api.get('/ai-settings/knowledge-docs'),
  uploadKnowledgeDoc: (formData: FormData) => api.post('/ai-settings/knowledge-docs', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteKnowledgeDoc: (id: string) => api.delete(`/ai-settings/knowledge-docs/${id}`),
};

// Chat Appearance

// Teams
export const teamApi = {
  performance: () => api.get('/teams/performance'),
  list: () => api.get('/teams'),
  get: (id: string) => api.get(`/teams/${id}`),
  create: (data: object) => api.post('/teams', data),
  update: (id: string, data: object) => api.put(`/teams/${id}`, data),
  delete: (id: string) => api.delete(`/teams/${id}`),
  listAgents: () => api.get('/teams/agents'),
  addAgent: (data: object) => api.post('/teams/agents', data),
  updateAgent: (id: string, data: object) => api.put(`/teams/agents/${id}`, data),
  removeAgent: (id: string) => api.delete(`/teams/agents/${id}`),
  loginAsAgent: (id: string) => api.post(`/teams/agents/${id}/login-as`),
};

// Payments

// Catalogs

// Orders

// Facebook Leads
export const facebookLeadApi = {
  getLeads: (params?: Record<string, unknown>) => api.get('/facebook-leads', { params }),
  getLead: (id: string) => api.get(`/facebook-leads/${id}`),
  syncLeads: () => api.post('/facebook-leads/sync'),
  updateLead: (id: string, data: object) => api.put(`/facebook-leads/${id}`, data),
};

// Keywords
export const botFlowApi = {
  list: () => api.get('/bot-flows'),
  get: (id: string) => api.get(`/bot-flows/${id}`),
  create: (data: object) => api.post('/bot-flows', data),
  generate: (data: object) => api.post('/bot-flows/generate', data),
  preset: (preset: string) => api.post('/bot-flows/preset', { preset }),
  update: (id: string, data: object) => api.put(`/bot-flows/${id}`, data),
  delete: (id: string) => api.delete(`/bot-flows/${id}`),
  export: (id: string) => api.get(`/bot-flows/${id}/export`),
  import: (flow: object) => api.post('/bot-flows/import', { flow }),
  report: (params: Record<string, unknown>) => api.get('/bot-flows/report', { params }),
  reportFile: (params: Record<string, unknown>) => api.get('/bot-flows/report', { params, responseType: 'blob' }),
  marketplace: () => api.get('/bot-flows/marketplace'),
  marketplaceItem: (id: string) => api.get(`/bot-flows/marketplace/${id}`),
  marketplaceInstall: (id: string, data: { name?: string }) => api.post(`/bot-flows/marketplace/${id}/install`, data),
};

// Which existing items the current plan still allows to be used.

export const keywordApi = {
  getKeywords: () => api.get('/keywords'),
  getKeyword: (id: string) => api.get(`/keywords/${id}`),
  createKeyword: (data: object) => api.post('/keywords', data),
  updateKeyword: (id: string, data: object) => api.put(`/keywords/${id}`, data),
  deleteKeyword: (id: string) => api.delete(`/keywords/${id}`),
};

// Events
export const eventApi = {
  getEvents: () => api.get('/events'),
  getEvent: (id: string) => api.get(`/events/${id}`),
  createEvent: (data: object) => api.post('/events', data),
  updateEvent: (id: string, data: object) => api.put(`/events/${id}`, data),
  deleteEvent: (id: string) => api.delete(`/events/${id}`),
};

// AI Calling


export const aiCallingApi = {
  getAgents: () => api.get('/ai-calling'),
  getAgent: (id: string) => api.get('/ai-calling/' + id),
  createAgent: (data: object) => api.post('/ai-calling', data),
  updateAgent: (id: string, data: object) => api.put('/ai-calling/' + id, data),
  deleteAgent: (id: string) => api.delete('/ai-calling/' + id),
  initiateCall: (data: object) => api.post('/ai-calling/call', data),
  getCallStatus: (callId: string) => api.get('/ai-calling/call/' + callId),
  terminateCall: (callId: string) => api.post('/ai-calling/call/' + callId + '/terminate'),
  requestPermission: (contactPhone: string) => api.post('/ai-calling/request-permission', { contactPhone }),
  getIncoming: () => api.get('/ai-calling/incoming'),
  acceptCall: (callId: string, sdp: string) => api.post('/ai-calling/call/' + callId + '/accept', { sdp }),
  rejectCall: (callId: string) => api.post('/ai-calling/call/' + callId + '/reject'),
  getCallLogs: () => api.get('/ai-calling/logs'),
  getCallHistory: () => api.get('/ai-calling/history'),
  uploadRecording: (callId: string, blob: Blob) => {
    const fd = new FormData();
    fd.append('file', blob, 'recording.webm');
    return api.post('/ai-calling/call/' + callId + '/recording', fd);
  },
  setDefaultAgent: (data: object) => api.post('/ai-calling/default-agent', data),
  getCallCampaigns: () => api.get('/ai-calling/campaigns'),
  getCallCampaign: (id: string) => api.get('/ai-calling/campaigns/' + id),
  createCallCampaign: (data: object) => api.post('/ai-calling/campaigns', data),
  startCallCampaign: (id: string) => api.post('/ai-calling/campaigns/' + id + '/start'),
  pauseCallCampaign: (id: string) => api.post('/ai-calling/campaigns/' + id + '/pause'),
  deleteCallCampaign: (id: string) => api.delete('/ai-calling/campaigns/' + id),
};

// Drip Campaigns
export const dripApi = {
  list: () => api.get('/drips'),
  get: (id: string) => api.get(`/drips/${id}`),
  create: (data: object) => api.post('/drips', data),
  update: (id: string, data: object) => api.put(`/drips/${id}`, data),
  delete: (id: string) => api.delete(`/drips/${id}`),
  start: (id: string) => api.post(`/drips/${id}/start`),
  pause: (id: string) => api.post(`/drips/${id}/pause`),
};

export const sequenceApi = {
  list: (params?: object) => api.get('/sequences', { params }),
  get: (id: string) => api.get(`/sequences/${id}`),
  create: (data: object) => api.post('/sequences', data),
  update: (id: string, data: object) => api.put(`/sequences/${id}`, data),
  delete: (id: string) => api.delete(`/sequences/${id}`),
  start: (id: string) => api.post(`/sequences/${id}/start`),
  pause: (id: string) => api.post(`/sequences/${id}/pause`),
  stop: (id: string, contactId?: string) => api.post(`/sequences/${id}/stop`, contactId ? { contactId } : {}),
  enrollments: (id: string, params?: object) => api.get(`/sequences/${id}/enrollments`, { params }),
};

// Admin APIs
export const adminApi = {
  // Dashboard
  getDashboard: () => api.get('/admin/dashboard'),
  // Users
  getUsers: (params?: Record<string, unknown>) => api.get('/admin/users', { params }),
  getUser: (id: string) => api.get(`/admin/users/${id}`),
  createUser: (data: object) => api.post('/admin/users', data),
  updateUser: (id: string, data: object) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  // Meta Pricing
  getMetaPricing: () => api.get('/admin/meta-pricing'),
  updateMetaPricing: (data: object) => api.post('/admin/meta-pricing', data),
  // Permissions
  getPermissions: () => api.get('/admin/permissions'),
  updatePermissions: (data: object) => api.put('/admin/permissions', data),
  // Settings
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data: object) => api.put('/admin/settings', data),
  sendTestEmail: (data: object) => api.post('/admin/settings/test-email', data),
  // Landing Page
  getLandingPage: () => api.get('/admin/landing-page'),
  updateLandingPage: (data: object) => api.put('/admin/landing-page', data),
  // Templates
  getTemplates: () => api.get('/admin/templates'),
  createTemplate: (data: object) => api.post('/admin/templates', data),
  updateTemplate: (id: string, data: object) => api.put(`/admin/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/admin/templates/${id}`),
  // Quick Replies
  getQuickReplies: () => api.get('/admin/quick-replies'),
  createQuickReply: (data: object) => api.post('/admin/quick-replies', data),
  updateQuickReply: (id: string, data: object) => api.put(`/admin/quick-replies/${id}`, data),
  deleteQuickReply: (id: string) => api.delete(`/admin/quick-replies/${id}`),
  // Languages
  getLanguages: () => api.get('/admin/languages'),
  createLanguage: (data: object) => api.post('/admin/languages', data),
  updateLanguage: (id: string, data: object) => api.put(`/admin/languages/${id}`, data),
  seedLanguages: () => api.post('/admin/languages/seed', {}),
  deleteLanguage: (id: string) => api.delete(`/admin/languages/${id}`),
  // FAQ
  getFAQs: () => api.get('/admin/faqs'),
  createFAQ: (data: object) => api.post('/admin/faqs', data),
  updateFAQ: (id: string, data: object) => api.put(`/admin/faqs/${id}`, data),
  deleteFAQ: (id: string) => api.delete(`/admin/faqs/${id}`),
  // Testimonials
  getTestimonials: () => api.get('/admin/testimonials'),
  createTestimonial: (data: object) => api.post('/admin/testimonials', data),
  updateTestimonial: (id: string, data: object) => api.put(`/admin/testimonials/${id}`, data),
  deleteTestimonial: (id: string) => api.delete(`/admin/testimonials/${id}`),
  // Pages
  getPages: () => api.get('/admin/pages'),
  createPage: (data: object) => api.post('/admin/pages', data),
  updatePage: (id: string, data: object) => api.put(`/admin/pages/${id}`, data),
  deletePage: (id: string) => api.delete(`/admin/pages/${id}`),
  // Short Links
  getShortLinks: () => api.get('/admin/short-links'),
  deleteShortLink: (id: string) => api.delete(`/admin/short-links/${id}`),
  // Integrations
  // AI Settings
  getAISettings: () => api.get('/admin/ai-settings'),
  updateAISettings: (data: unknown) => api.put('/admin/ai-settings', data),
  // Vendors
  getVendors: (params?: Record<string, unknown>) => api.get('/admin/vendors', { params }),
  getVendor: (id: string) => api.get(`/admin/vendors/${id}`),
  createVendor: (data: object) => api.post('/admin/vendors', data),
  updateVendor: (id: string, data: object) => api.put(`/admin/vendors/${id}`, data),
  deleteVendor: (id: string) => api.delete(`/admin/vendors/${id}`),
  loginAsVendor: (id: string) => api.post(`/admin/vendors/${id}/login-as`),
  getVendorDetail: (id: string) => api.get(`/admin/vendors/${id}/detail`),
  // Feature controls and vendor administration
  getFeatureCatalog: () => api.get('/admin/feature-catalog'),
  getFeatureControls: () => api.get('/admin/feature-controls'),
  updateFeatureControls: (vendorId: string, features: Record<string, boolean>) => api.put(`/admin/feature-controls/${vendorId}`, { features }),
  getVendorAiAssignments: () => api.get('/admin/vendor-ai'),
  updateVendorAiAssignment: (vendorId: string, data: object) => api.put(`/admin/vendor-ai/${vendorId}`, data),
  pushKnowledge: (data: { vendorIds: string[]; articles: { title: string; content: string; category?: string }[] }) => api.post('/admin/push-knowledge', data),
  getDataCleanup: (workspace?: string) => api.get('/admin/data-cleanup', { params: workspace ? { workspace } : undefined }),
  updateDataCleanup: (data: object) => api.put('/admin/data-cleanup', data),
  runDataCleanup: (workspace?: string) => api.post('/admin/data-cleanup/run', workspace ? { workspace } : {}),
};

// Data Fields
export const dataFieldApi = {
  list: () => api.get("/data-fields"),
  create: (data: object) => api.post("/data-fields", data),
  update: (id: string, data: object) => api.put(`/data-fields/${id}`, data),
  delete: (id: string) => api.delete(`/data-fields/${id}`),
};

// Quick Replies (Client)
export const quickReplyClientApi = {
  list: () => api.get("/quick-replies-client"),
  create: (data: object) => api.post("/quick-replies-client", data),
  update: (id: string, data: object) => api.put(`/quick-replies-client/${id}`, data),
  delete: (id: string) => api.delete(`/quick-replies-client/${id}`),
};

// Badges
export const badgeApi = {
  list: () => api.get("/badges"),
  create: (data: object) => api.post("/badges", data),
  update: (id: string, data: object) => api.put(`/badges/${id}`, data),
  delete: (id: string) => api.delete(`/badges/${id}`),
  run: (id: string) => api.post(`/badges/${id}/run`),
};

// Generic file upload
export const uploadApi = {
  uploadFile: (formData: FormData) => api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Media Library
export const mediaApi = {
  list: (params?: Record<string, unknown>) => api.get("/media", { params }),
  upload: (formData: FormData) => api.post("/media/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  update: (id: string, data: object) => api.put(`/media/${id}`, data),
  delete: (id: string) => api.delete(`/media/${id}`),
};

// CTWA Ads

// Predefined Actions
export const predefinedActionApi = {
  list: () => api.get("/predefined-actions"),
  create: (data: object) => api.post("/predefined-actions", data),
  update: (id: string, data: object) => api.put(`/predefined-actions/${id}`, data),
  delete: (id: string) => api.delete(`/predefined-actions/${id}`),
  run: (id: string, data: object) => api.post(`/predefined-actions/${id}/run`, data),
};

// Response Resources
export const responseResourceApi = {
  list: (params?: Record<string, unknown>) => api.get("/response-resources", { params }),
  create: (data: object) => api.post("/response-resources", data),
  update: (id: string, data: object) => api.put(`/response-resources/${id}`, data),
  delete: (id: string) => api.delete(`/response-resources/${id}`),
  use: (id: string) => api.post(`/response-resources/${id}/use`),
};

// Workspace Knowledge Base
export const workspaceKbApi = {
  list: () => api.get('/workspace-kb'),
  create: (data: object) => api.post('/workspace-kb', data),
  update: (id: string, data: object) => api.put('/workspace-kb/' + id, data),
  delete: (id: string) => api.delete('/workspace-kb/' + id),
};

// Audit Logs
export const auditLogApi = {
  list: (params?: Record<string, unknown>) => api.get('/audit-logs', { params }),
};

// Invoices

// Platform (coupons, announcements, support tickets, system admin)
export const platformApi = {
  publicBranding: () => cachedGet('/public/branding', 60000),
  activeAnnouncements: () => api.get('/platform/announcements/active'),
  // Support tickets (vendor)
  myTickets: () => api.get('/platform/support'),
  // Admin
  adminBackups: () => api.get('/platform/admin/backups'),
  adminRunBackup: () => api.post('/platform/admin/backups'),
  adminDownloadBackup: (name: string) => api.get(`/platform/admin/backups/${name}/download`, { responseType: 'blob' }),
  adminDeleteBackup: (name: string) => api.delete(`/platform/admin/backups/${name}`),
  adminHealth: () => api.get('/platform/admin/health'),
  adminHealthReport: (force?: boolean) => api.get('/platform/admin/health-report', { params: force ? { force: 1 } : {}, timeout: 120000 }),
};

// Affiliate Partners add-on -------------------------------------------------
// Public state (used by the partner login/signup pages before any session)
export const affiliatePublicApi = {
  state: () => api.get('/public/affiliate'),
  register: (data: { name: string; email: string; password: string; phone?: string; company?: string }) =>
    api.post('/auth/partner-register', data),
};

// Partner Portal (/partner/*) — partner-only endpoints
export const partnerApi = {
  me: () => api.get('/partners/me'),
  dashboard: (params?: { from?: string; to?: string }) => api.get('/partners/dashboard', { params }),
  customers: (params?: { status?: string; from?: string; to?: string }) => api.get('/partners/customers', { params }),
  conversions: (params?: { from?: string; to?: string }) => api.get('/partners/conversions', { params }),
  commissions: (params?: { status?: string; type?: string; page?: number; limit?: number; from?: string; to?: string }) => api.get('/partners/commissions', { params }),
  wallet: () => api.get('/partners/wallet'),
  withdrawals: () => api.get('/partners/withdraw'),
  requestWithdrawal: (amount: number) => api.post('/partners/withdraw', { amount }),
  savePayoutDetails: (data: object) => api.put('/partners/payout-details', data),
  kyc: () => api.get('/partners/kyc'),
  submitKyc: (data: object) => api.post('/partners/kyc', data),
  announcements: () => api.get('/partners/announcements'),
  markAnnouncementsRead: (ids: string[]) => api.post('/partners/announcements/read', { ids }),
  updateProfile: (data: { name?: string; phone?: string; avatar?: string }) => api.put('/partners/profile', data),
};

// Admin → Affiliate Partners
export const adminPartnersApi = {
  module: () => api.get('/admin/partners/module'),
  settings: () => api.get('/admin/partners/settings'),
  saveSettings: (data: object) => api.put('/admin/partners/settings', data),
  list: (status?: string) => api.get('/admin/partners', { params: status ? { status } : {} }),
  create: (data: { name: string; email: string; password: string; phone?: string; commissionRate?: number | null }) =>
    api.post('/admin/partners', data),
  summary: () => api.get('/admin/partners/summary'),
  trends: (months?: number) => api.get('/admin/partners/trends', { params: months ? { months } : {} }),
  referrals: (params?: { status?: string; partner?: string; page?: number; limit?: number }) =>
    api.get('/admin/partners/referrals', { params }),
  commissions: (params?: { status?: string; partner?: string; page?: number; limit?: number }) =>
    api.get('/admin/partners/commissions', { params }),
  reverseCommission: (id: string, note?: string) => api.post(`/admin/partners/commissions/${id}/reverse`, { note }),
  withdrawals: (status?: string) => api.get('/admin/partners/withdrawals', { params: status ? { status } : {} }),
  processWithdrawal: (id: string, data: { status: 'paid' | 'rejected'; reference?: string; adminNote?: string }) =>
    api.put(`/admin/partners/withdrawals/${id}`, data),
  kycQueue: (status?: string) => api.get('/admin/partners/kyc', { params: status ? { status } : {} }),
  reviewKyc: (id: string, data: { status: 'approved' | 'rejected'; rejectionReason?: string }) =>
    api.put(`/admin/partners/${id}/kyc`, data),
  announcements: (params?: { type?: string; status?: string }) => api.get('/admin/partners/announcements', { params }),
  createAnnouncement: (data: object) => api.post('/admin/partners/announcements', data),
  updateAnnouncement: (id: string, data: object) => api.put(`/admin/partners/announcements/${id}`, data),
  deleteAnnouncement: (id: string) => api.delete(`/admin/partners/announcements/${id}`),
  get: (id: string) => api.get(`/admin/partners/${id}`),
  update: (id: string, data: object) => api.put(`/admin/partners/${id}`, data),
  walletAdjust: (id: string, data: { amount: number; description?: string }) =>
    api.post(`/admin/partners/${id}/wallet-adjust`, data),
  loginAsPartner: (id: string) => api.post(`/admin/partners/${id}/login-as`),
};
