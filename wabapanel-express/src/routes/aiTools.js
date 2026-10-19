const router = require('express').Router();
const axios = require('axios');
const { protect, workspaceAccess } = require('../middleware/auth');
const { requireFeature } = require('../middleware/featureGate');
const AIToolsSettings = require('../models/AIToolsSettings');
const AIToolLog = require('../models/AIToolLog');

router.use(protect, workspaceAccess);
router.use(requireFeature('aiAssistant'));

// ── Built-in app catalogue ────────────────────────────────────────────────────
const BUILT_IN_APPS = [
  {
    type: 'google-sheets',
    label: 'Google Sheets',
    tools: [
      { name: 'sheets_search_rows', description: 'Search rows in a Google Sheet by a keyword', level: 'read' },
      { name: 'sheets_append_row', description: 'Append a new row (lead/order) to a sheet', level: 'write' },
    ],
  },
  {
    type: 'shopify',
    label: 'Shopify',
    tools: [
      { name: 'shopify_order_status', description: 'Look up order status and tracking by order number or phone', level: 'read' },
      { name: 'shopify_product_search', description: 'Search products by name or category', level: 'read' },
      { name: 'shopify_cancel_order', description: 'Cancel an order — always requires customer confirmation', level: 'danger' },
    ],
  },
  {
    type: 'woocommerce',
    label: 'WooCommerce',
    tools: [
      { name: 'woo_order_status', description: 'Look up WooCommerce order status by order ID or phone', level: 'read' },
      { name: 'woo_product_search', description: 'Search WooCommerce products by name', level: 'read' },
      { name: 'woo_cancel_order', description: 'Cancel a WooCommerce order — requires customer confirmation', level: 'danger' },
    ],
  },
  {
    type: 'razorpay',
    label: 'Razorpay',
    tools: [
      { name: 'razorpay_payment_status', description: 'Check the status of a Razorpay payment link', level: 'read' },
      { name: 'razorpay_create_link', description: 'Create a Razorpay payment link for a customer', level: 'write' },
    ],
  },
];

// Merge DB settings into the static app catalogue
function buildApps(saved) {
  return BUILT_IN_APPS.map(app => {
    const stored = saved.apps.find(a => a.type === app.type) || {};
    return {
      type: app.type,
      label: app.label,
      tools: app.tools,
      connected: stored.connected || false,
      account: stored.account || '',
      policy: stored.policy || { enabled: false, read: true, write: false, danger: false, confirmWrite: true, dailyLimit: 200, tools: {} },
    };
  });
}

// Flat list of tools the AI bot may call (enabled only)
function buildBotTools(settings) {
  const list = [];
  for (const app of BUILT_IN_APPS) {
    const stored = settings.apps.find(a => a.type === app.type);
    if (!stored?.policy?.enabled) continue;
    for (const t of app.tools) {
      const toolOverride = stored.policy.tools?.[t.name];
      if (toolOverride === false) continue;
      if (!stored.policy[t.level]) continue;
      list.push({ name: t.name, description: t.description });
    }
  }
  for (const c of settings.custom) {
    if (!c.enabled) continue;
    for (const t of c.tools) {
      if (!t.enabled) continue;
      if (!c[t.level]) continue;
      list.push({ name: t.name, description: t.description });
    }
  }
  return list;
}

async function getOrCreate(workspaceId) {
  let s = await AIToolsSettings.findOne({ workspace: workspaceId });
  if (!s) s = await AIToolsSettings.create({ workspace: workspaceId });
  return s;
}

function safeData(s) {
  return { apps: buildApps(s), custom: s.custom.map(c => ({ ...c.toObject(), authValue: c.authValue ? '***' : '' })), ownerPhones: s.ownerPhones };
}

// GET /api/ai-tools
router.get('/', async (req, res) => {
  try {
    const s = await getOrCreate(req.workspace._id);
    res.json({ success: true, data: safeData(s) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/ai-tools/tools  (flat bot-callable tool list)
router.get('/tools', async (req, res) => {
  try {
    const s = await getOrCreate(req.workspace._id);
    res.json({ success: true, data: buildBotTools(s) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/ai-tools/logs
router.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const [data, total] = await Promise.all([
      AIToolLog.find({ workspace: req.workspace._id }).sort({ createdAt: -1 }).limit(limit),
      AIToolLog.countDocuments({ workspace: req.workspace._id }),
    ]);
    res.json({ success: true, data, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/ai-tools/owners
router.put('/owners', async (req, res) => {
  try {
    const s = await getOrCreate(req.workspace._id);
    s.ownerPhones = (req.body.phones || []).map(String).filter(Boolean);
    await s.save();
    res.json({ success: true, data: safeData(s) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/ai-tools/apps/:type
router.put('/apps/:type', async (req, res) => {
  try {
    const s = await getOrCreate(req.workspace._id);
    const valid = BUILT_IN_APPS.find(a => a.type === req.params.type);
    if (!valid) return res.status(404).json({ success: false, message: 'Unknown app type' });
    let stored = s.apps.find(a => a.type === req.params.type);
    if (!stored) { s.apps.push({ type: req.params.type, policy: {} }); stored = s.apps[s.apps.length - 1]; }
    const { enabled, read, write, danger, confirmWrite, dailyLimit, tools, connected, account, credentials } = req.body;
    const p = stored.policy;
    if (enabled !== undefined) p.enabled = enabled;
    if (read !== undefined) p.read = read;
    if (write !== undefined) p.write = write;
    if (danger !== undefined) p.danger = danger;
    if (confirmWrite !== undefined) p.confirmWrite = confirmWrite;
    if (dailyLimit !== undefined) p.dailyLimit = dailyLimit;
    if (tools !== undefined) p.tools = tools;
    if (connected !== undefined) stored.connected = connected;
    if (account !== undefined) stored.account = account;
    if (credentials !== undefined) stored.credentials = credentials;
    s.markModified('apps');
    await s.save();
    res.json({ success: true, data: safeData(s) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/ai-tools/custom
router.post('/custom', async (req, res) => {
  try {
    const s = await getOrCreate(req.workspace._id);
    const { name, kind, url, authType, headerName, authValue, enabled, read, write, danger, confirmWrite, dailyLimit, tools } = req.body;
    if (!name || !url) return res.status(400).json({ success: false, message: 'name and url required' });
    s.custom.push({ name, kind: kind || 'rest', url, authType: authType || 'none', headerName, authValue, enabled: enabled !== false, read: read !== false, write: !!write, danger: !!danger, confirmWrite: !!confirmWrite, dailyLimit: dailyLimit || 200, tools: tools || [] });
    await s.save();
    res.status(201).json({ success: true, data: safeData(s) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/ai-tools/custom/:id
router.put('/custom/:id', async (req, res) => {
  try {
    const s = await getOrCreate(req.workspace._id);
    const item = s.custom.id(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Custom server not found' });
    const allowed = ['name', 'kind', 'url', 'authType', 'headerName', 'authValue', 'enabled', 'read', 'write', 'danger', 'confirmWrite', 'dailyLimit', 'tools'];
    allowed.forEach(k => { if (req.body[k] !== undefined) item[k] = req.body[k]; });
    s.markModified('custom');
    await s.save();
    res.json({ success: true, data: safeData(s) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/ai-tools/custom/:id
router.delete('/custom/:id', async (req, res) => {
  try {
    const s = await getOrCreate(req.workspace._id);
    const item = s.custom.id(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Custom server not found' });
    item.deleteOne();
    await s.save();
    res.json({ success: true, data: safeData(s) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/ai-tools/custom/:id/discover  — auto-fetch tool list from REST/MCP server
router.post('/custom/:id/discover', async (req, res) => {
  try {
    const s = await getOrCreate(req.workspace._id);
    const item = s.custom.id(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Custom server not found' });

    await require('../utils/safeOutboundUrl')(item.url, '自定义服务器地址'); // SEC-SSRF：禁内网

    const headers = {};
    if (item.authType === 'bearer' && item.authValue) headers['Authorization'] = `Bearer ${item.authValue}`;
    else if (item.authType === 'header' && item.headerName && item.authValue) headers[item.headerName] = item.authValue;
    else if (item.authType === 'basic' && item.authValue) headers['Authorization'] = `Basic ${Buffer.from(item.authValue).toString('base64')}`;

    if (item.kind === 'mcp') {
      // MCP discovery: POST to server with method=tools/list
      const resp = await axios.post(item.url, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, { headers, timeout: 10000 });
      const mcpTools = resp.data?.result?.tools || [];
      item.tools = mcpTools.map(t => ({
        name: t.name, description: t.description || '', level: 'read', enabled: true,
        method: 'POST', path: '', params: [],
      }));
    } else {
      // REST discovery: GET /tools or /openapi.json
      const discoverUrl = item.url.replace(/\/$/, '') + '/tools';
      const resp = await axios.get(discoverUrl, { headers, timeout: 10000 });
      const tools = resp.data?.tools || resp.data || [];
      if (Array.isArray(tools)) {
        item.tools = tools.map(t => ({
          name: t.name || t.operationId || '', description: t.description || t.summary || '', level: t.level || 'read',
          enabled: true, method: t.method || 'GET', path: t.path || '', params: t.params || [],
        }));
      }
    }

    item.lastDiscoveredAt = new Date();
    s.markModified('custom');
    await s.save();
    res.json({ success: true, data: safeData(s) });
  } catch (err) {
    res.status(500).json({ success: false, message: `Discovery failed: ${err.message}` });
  }
});

// POST /api/ai-tools/test
router.post('/test', async (req, res) => {
  try {
    const s = await getOrCreate(req.workspace._id);
    const { tool, args = {} } = req.body;
    if (!tool) return res.status(400).json({ success: false, message: 'tool name required' });

    // Find which source has this tool
    const customServer = s.custom.find(c => c.tools.some(t => t.name === tool));
    if (customServer) {
      const toolDef = customServer.tools.find(t => t.name === tool);
      await require('../utils/safeOutboundUrl')(customServer.url, '自定义服务器地址'); // SEC-SSRF：禁内网
      const headers = { 'Content-Type': 'application/json' };
      if (customServer.authType === 'bearer' && customServer.authValue) headers['Authorization'] = `Bearer ${customServer.authValue}`;
      else if (customServer.authType === 'header' && customServer.headerName) headers[customServer.headerName] = customServer.authValue;

      let result;
      if (customServer.kind === 'mcp') {
        const r = await axios.post(customServer.url, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } }, { headers, timeout: 15000 });
        result = r.data?.result;
      } else {
        const urlPath = (customServer.url.replace(/\/$/, '')) + (toolDef?.path || '');
        const method = (toolDef?.method || 'GET').toUpperCase();
        const r = method === 'GET' ? await axios.get(urlPath, { headers, params: args, timeout: 15000 }) : await axios.post(urlPath, args, { headers, timeout: 15000 });
        result = r.data;
      }

      await AIToolLog.create({ workspace: req.workspace._id, app: customServer.name, tool, level: toolDef?.level || 'read', args: JSON.stringify(args), status: 'ok', ms: 0 });
      return res.json({ success: true, data: result });
    }

    // Built-in app stub
    res.json({ success: true, data: { message: `Built-in tool "${tool}" test ok (stub)`, args } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
