const BotFlow = require('../models/BotFlow');

const getBotFlows = async (req, res) => {
  try {
    const flows = await BotFlow.find({ workspace: req.workspace._id }).sort('-updatedAt');
    res.json({ success: true, data: flows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getBotFlow = async (req, res) => {
  try {
    const flow = await BotFlow.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' });
    res.json({ success: true, data: flow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createBotFlow = async (req, res) => {
  try {
    const { name, triggerKeywords = [], matchType = 'exact' } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    const flow = await BotFlow.create({
      workspace: req.workspace._id,
      name,
      triggerKeywords: triggerKeywords.filter(Boolean),
      matchType,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateBotFlow = async (req, res) => {
  try {
    const allowed = ['name', 'triggerKeywords', 'matchType', 'eventTrigger', 'isActive', 'startNode', 'nodes', 'startX', 'startY'];
    const update = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    // SEC-PUB：生成/轮换外部触发密钥（前端「生成密钥」按钮，URL 只在本次响应里给一次）
    let newKey = '';
    if (req.body.generateWebhookKey === true) {
      newKey = require('crypto').randomBytes(12).toString('hex');
      update.webhookKey = newKey;
    }
    const flow = await BotFlow.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      update,
      { new: true, runValidators: true }
    );
    if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' });
    const out = { success: true, data: flow };
    if (newKey) {
      const base = (process.env.API_BASE_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
      out.webhookTriggerUrl = `${base}/api/ext/webhook/${req.workspace._id}/${flow._id}?key=${newKey}`;
    }
    res.json(out);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/bot-flows/generate — AI builds a full flow from a business description
const generateBotFlow = async (req, res) => {
  try {
    const { business, goal, name } = req.body;
    if (!business || !goal) return res.status(400).json({ success: false, message: 'Business details and flow goal are required' });

    const AISettings = require('../models/AISettings');
    const ai = await AISettings.findOne({ workspace: req.workspace._id });
    if (!ai || !ai.apiKey) return res.status(400).json({ success: false, message: 'Add your AI API key in AI Settings first' });

    const system = `You design WhatsApp chatbot flows. Reply ONLY with valid JSON (no markdown, no explanation) in this exact shape:
{"name":"Flow name","triggerKeywords":["hi","hello"],"startNode":"n1","nodes":[{...}]}
Each node object supports these fields:
- id: unique string like "n1","n2"
- name: short label
- type: "text" | "interactive"
- text: the message body (for both types)
- next: id of the next node (for type "text"; empty string to end)
- For type "interactive": mode:"buttons" plus buttons:[{title:"Button label (max 20 chars)",next:"nodeId or empty"}] (max 3 buttons), or mode:"list" plus listButtonText:"Menu" and rows:[{title,description,next}] (max 10 rows)
- x,y: canvas position numbers. Lay nodes out left-to-right: start at x=40,y=60, add ~260 to x per step, offset y by ~140 for branches.
Rules: 6-14 nodes, cover the main journey (greeting, menu of options, answers, ask contact details when useful, closing). Message text must be customer-ready, in the same language as the user's description. Do not invent facts not in the business details.`;
    const user = `Business details:\n${business}\n\nWhat the flow should do:\n${goal}${name ? `\n\nFlow name: ${name}` : ''}`;

    const aiService = require('../services/aiService');
    const resp = await aiService.chat(ai.provider, ai.apiKey, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], { model: ai.model || undefined, temperature: 0.4, maxTokens: 4000, ...aiService.azureOpts(ai) });

    let raw = (resp.content || '').trim();
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) raw = fence[1].trim();
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('AI did not return a valid flow');
    const parsed = JSON.parse(raw.slice(first, last + 1));
    if (!Array.isArray(parsed.nodes) || !parsed.nodes.length) throw new Error('AI returned an empty flow');

    const ids = new Set(parsed.nodes.map((n) => String(n.id || '')));
    const nodes = parsed.nodes.map((n, i) => {
      const type = n.type === 'interactive' ? 'interactive' : 'text';
      const node = {
        id: String(n.id || `n${i + 1}`),
        name: String(n.name || `Step ${i + 1}`).slice(0, 60),
        type,
        text: String(n.text || '').slice(0, 4000),
        next: type === 'text' && ids.has(String(n.next)) ? String(n.next) : '',
        x: Number.isFinite(Number(n.x)) ? Number(n.x) : 40 + (i % 5) * 260,
        y: Number.isFinite(Number(n.y)) ? Number(n.y) : 60 + Math.floor(i / 5) * 160,
      };
      if (type === 'interactive') {
        if (n.mode === 'list' && Array.isArray(n.rows) && n.rows.length) {
          node.mode = 'list';
          node.listButtonText = String(n.listButtonText || 'Menu').slice(0, 20);
          node.rows = n.rows.slice(0, 10).map((r) => ({
            title: String(r.title || '').slice(0, 24),
            description: String(r.description || '').slice(0, 72),
            next: ids.has(String(r.next)) ? String(r.next) : '',
          }));
        } else {
          node.mode = 'buttons';
          node.buttons = (Array.isArray(n.buttons) ? n.buttons : []).slice(0, 3).map((b) => ({
            title: String(b.title || '').slice(0, 20),
            next: ids.has(String(b.next)) ? String(b.next) : '',
          }));
        }
      }
      return node;
    });

    const flow = await BotFlow.create({
      workspace: req.workspace._id,
      name: String(name || parsed.name || 'AI Generated Flow').slice(0, 100),
      triggerKeywords: (Array.isArray(parsed.triggerKeywords) ? parsed.triggerKeywords : []).filter(Boolean).map(String).slice(0, 10),
      matchType: 'contains',
      startNode: ids.has(String(parsed.startNode)) ? String(parsed.startNode) : nodes[0].id,
      nodes,
      isActive: false,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    const status = error.response?.status;
    if (status === 429 || error.response?.data?.error?.code === 'insufficient_quota') {
      return res.status(400).json({ success: false, message: 'Your AI API key has run out of quota/credits. Add billing to your AI provider account or set a different key in AI Settings.' });
    }
    if (status === 401) {
      return res.status(400).json({ success: false, message: 'Your AI API key is invalid. Check it in AI Settings.' });
    }
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message });
  }
};

// @POST /api/bot-flows/preset — import a ready-made preset flow (inactive; user reviews then turns on)
const createPresetFlow = async (req, res) => {
  try {
    const { PRESETS } = require('../services/presetFlows');
    const key = String(req.body.preset || 'lead_nurturing');
    const def = PRESETS[key];
    if (!def) return res.status(400).json({ success: false, message: 'Unknown preset' });
    const flow = await BotFlow.create({
      workspace: req.workspace._id,
      name: def.name,
      triggerKeywords: def.triggerKeywords || [],
      matchType: def.matchType || 'contains',
      eventTrigger: def.eventTrigger || '',
      startNode: def.startNode,
      nodes: def.nodes,
      isActive: false,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 导出流程为 JSON（去掉运行数据和归属字段，可跨面板导入）
const exportBotFlow = async (req, res) => {
  try {
    const flow = await BotFlow.findOne({ _id: req.params.id, workspace: req.workspace._id }).lean();
    if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' });
    const { name, triggerKeywords, matchType, eventTrigger, startNode, startX, startY, nodes } = flow;
    res.json({ success: true, data: { name, triggerKeywords, matchType, eventTrigger, startNode, startX, startY, nodes } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 从导出的 JSON 导入（创建为非激活流程）
const importBotFlow = async (req, res) => {
  try {
    const f = req.body?.flow;
    if (!f || typeof f !== 'object' || !f.name || !Array.isArray(f.nodes) || f.nodes.length === 0 || f.nodes.length > 300) {
      return res.status(400).json({ success: false, message: '流程文件无效：需要 name 和 nodes' });
    }
    const flow = await BotFlow.create({
      workspace: req.workspace._id,
      name: String(f.name).slice(0, 120),
      triggerKeywords: Array.isArray(f.triggerKeywords) ? f.triggerKeywords.slice(0, 50).map(String) : [],
      matchType: ['exact', 'contains'].includes(f.matchType) ? f.matchType : 'contains',
      eventTrigger: ['', 'dnp', 'new_lead'].includes(f.eventTrigger) ? f.eventTrigger : '',
      startNode: String(f.startNode || ''),
      startX: Number(f.startX) || 40,
      startY: Number(f.startY) || 60,
      nodes: f.nodes,
      isActive: false,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    res.status(400).json({ success: false, message: '流程文件无效：' + error.message });
  }
};

// 运行报表：按联系人聚合机器人消息与回复（?from&to&flowId&format=excel|pdf）
const botFlowReport = async (req, res) => {
  try {
    const Message = require('../models/Message');
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 29 * 86400000);
    const to = req.query.to ? new Date(new Date(req.query.to).getTime() + 86400000 - 1) : new Date();
    const match = {
      workspace: req.workspace._id,
      direction: 'outbound',
      'metadata.source': 'bot_flow',
      createdAt: { $gte: from, $lte: to },
    };
    if (req.query.flowId) match['metadata.flowId'] = String(req.query.flowId);

    const LIMIT = 20000;
    const perContact = await Message.aggregate([
      { $match: match },
      { $group: {
        _id: '$contact',
        botMessages: { $sum: 1 },
        firstAt: { $min: '$createdAt' },
        lastAt: { $max: '$createdAt' },
        flowNames: { $addToSet: '$metadata.flowName' },
      } },
      { $sort: { lastAt: -1 } },
      { $limit: LIMIT + 1 },
    ]);
    const truncated = perContact.length > LIMIT;
    const list = perContact.slice(0, LIMIT);
    const contactIds = list.map(r => r._id).filter(Boolean);

    const [contacts, replyAgg, flowAgg] = await Promise.all([
      require('../models/Contact').find({ _id: { $in: contactIds } }).select('name phone').lean(),
      Message.aggregate([
        { $match: { workspace: req.workspace._id, direction: 'inbound', contact: { $in: contactIds }, createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: '$contact', n: { $sum: 1 } } },
      ]),
      Message.aggregate([
        { $match: match },
        { $group: { _id: { $ifNull: ['$metadata.flowName', '(未标记)'] }, botMessages: { $sum: 1 }, contacts: { $addToSet: '$contact' } } },
        { $sort: { botMessages: -1 } },
      ]),
    ]);
    const cMap = Object.fromEntries(contacts.map(c => [String(c._id), c]));
    const rMap = Object.fromEntries(replyAgg.map(r => [String(r._id), r.n]));
    const rows = list.map(r => ({
      phone: cMap[String(r._id)]?.phone || '',
      name: cMap[String(r._id)]?.name || '',
      flows: (r.flowNames || []).filter(Boolean).join(', ') || '(未标记)',
      botMessages: r.botMessages,
      replies: rMap[String(r._id)] || 0,
      firstAt: r.firstAt,
      lastAt: r.lastAt,
    }));
    const data = {
      totals: {
        numbers: rows.length,
        botMessages: rows.reduce((s, r) => s + r.botMessages, 0),
        replies: rows.reduce((s, r) => s + r.replies, 0),
        truncated,
      },
      flows: flowAgg.map(f => ({ name: f._id, numbers: (f.contacts || []).length, botMessages: f.botMessages })),
      rows,
    };

    const format = String(req.query.format || '');
    if (format === 'excel') {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(r => ({
        号码: r.phone, 名称: r.name, 机器人流程: r.flows, 机器人消息: r.botMessages,
        回复: r.replies, 首次活动: r.firstAt, 最近活动: r.lastAt,
      }))), 'Report');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', 'attachment; filename="bot-flow-report.xlsx"');
      return res.send(buf);
    }
    if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'attachment; filename="bot-flow-report.pdf"');
      doc.pipe(res);
      doc.fontSize(14).text('Bot Flow Report', { align: 'center' });
      doc.fontSize(9).text(`${from.toISOString().slice(0, 10)} ~ ${to.toISOString().slice(0, 10)}  |  Numbers: ${data.totals.numbers}  Bot msgs: ${data.totals.botMessages}  Replies: ${data.totals.replies}`, { align: 'center' });
      doc.moveDown();
      for (const r of rows.slice(0, 2000)) {
        doc.fontSize(8).text(`${r.phone}  ${r.name}  |  flow: ${r.flows}  |  bot ${r.botMessages} / reply ${r.replies}`);
      }
      doc.end();
      return;
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 模板市场（本地内置模板）
const marketplaceList = async (req, res) => {
  try {
    res.json({ success: true, data: require('../services/marketplaceTemplates').getCatalog() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const marketplaceItem = async (req, res) => {
  try {
    const t = require('../services/marketplaceTemplates').getTemplate(req.params.id);
    if (!t) return res.status(404).json({ success: false, message: '模板不存在' });
    const { def, ...rest } = t;
    res.json({ success: true, data: rest });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const marketplaceInstall = async (req, res) => {
  try {
    const t = require('../services/marketplaceTemplates').getTemplate(req.params.id);
    if (!t) return res.status(404).json({ success: false, message: '模板不存在' });
    const def = t.def;
    const flow = await BotFlow.create({
      workspace: req.workspace._id,
      name: String(req.body?.name || def.name).slice(0, 120),
      triggerKeywords: def.triggerKeywords || [],
      matchType: def.matchType || 'contains',
      eventTrigger: def.eventTrigger || '',
      startNode: def.startNode,
      nodes: def.nodes,
      isActive: false,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteBotFlow = async (req, res) => {
  try {
    const flow = await BotFlow.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' });
    res.json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getBotFlows, getBotFlow, createBotFlow, updateBotFlow, deleteBotFlow, generateBotFlow, createPresetFlow, exportBotFlow, importBotFlow, botFlowReport, marketplaceList, marketplaceItem, marketplaceInstall };
