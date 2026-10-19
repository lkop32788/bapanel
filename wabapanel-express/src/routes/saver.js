const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const SaverCheckTask = require('../models/SaverCheckTask');
const { processTask, getBalance } = require('../services/saverCheckService');
const { TASK_TYPES, normalizeValue } = require('../services/saverTaskTypes');

router.use(protect, workspaceAccess);

const MAX_NUMBERS = 100000;
const CHANNELS = ['whatsapp', 'telegram', 'more'];

// POST /api/saver/checks — 创建检测任务
router.post('/checks', async (req, res) => {
  try {
    const { channel, country, numbers, fileName, taskType } = req.body || {};
    if (!CHANNELS.includes(channel)) {
      return res.status(400).json({ success: false, message: '无效的渠道' });
    }
    const def = TASK_TYPES[taskType];
    if (!def || def.channel !== channel) {
      return res.status(400).json({ success: false, message: '无效的检测类型' });
    }
    if (def.country && (!country?.code || !/^[A-Z]{2}$/.test(String(country.code)))) {
      return res.status(400).json({ success: false, message: '请选择客户号码国家' });
    }
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ success: false, message: '请先上传文件' });
    }
    if (numbers.length > MAX_NUMBERS) {
      return res.status(400).json({ success: false, message: `单次最多检测 ${MAX_NUMBERS} 条` });
    }
    const normalize = normalizeValue[def.input] || normalizeValue.phone;
    const seen = new Set();
    const results = [];
    for (const n of numbers) {
      const value = normalize(n);
      if (value && !seen.has(value)) { seen.add(value); results.push({ phone: value, status: 'unknown', detail: '' }); }
    }
    if (results.length === 0) {
      return res.status(400).json({ success: false, message: '文件里没有识别到有效内容' });
    }
    const task = await SaverCheckTask.create({
      workspace: req.workspace._id,
      createdBy: req.user._id,
      channel,
      taskType,
      fileName: String(fileName || '').slice(0, 200),
      country: {
        name: country?.name || '',
        dial: String(country?.dial || '').replace(/\D/g, ''),
        code: String(country?.code || ''),
      },
      total: results.length,
      results,
    });
    setImmediate(() => processTask(task._id).catch(err => console.error('[saver] processTask:', err.message)));
    const { results: _r, ...lean } = task.toObject();
    res.status(201).json({ success: true, data: lean });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/saver/balance — 检测平台积分余额
router.get('/balance', async (req, res) => {
  try {
    res.json({ success: true, data: await getBalance() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/saver/checks?channel=&name=&country=&page=&limit= — 任务列表（不含明细，分页）
router.get('/checks', async (req, res) => {
  try {
    const q = { workspace: req.workspace._id };
    if (CHANNELS.includes(req.query.channel)) q.channel = req.query.channel;
    if (req.query.type && TASK_TYPES[req.query.type]) q.taskType = req.query.type;
    if (req.query.name) {
      const safe = String(req.query.name).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      q.fileName = { $regex: safe, $options: 'i' };
    }
    if (req.query.country) q['country.name'] = String(req.query.country).slice(0, 50);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const [tasks, total] = await Promise.all([
      SaverCheckTask.find(q).select('-results').sort('-createdAt').skip((page - 1) * limit).limit(limit).lean(),
      SaverCheckTask.countDocuments(q),
    ]);
    res.json({ success: true, data: tasks, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/saver/checks/:id — 单个任务（含明细）
router.get('/checks/:id', async (req, res) => {
  try {
    const task = await SaverCheckTask.findOne({ _id: req.params.id, workspace: req.workspace._id }).lean();
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/saver/checks/:id — 删除任务记录
router.delete('/checks/:id', async (req, res) => {
  try {
    const task = await SaverCheckTask.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    res.json({ success: true, message: '已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
