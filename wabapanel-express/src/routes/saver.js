const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const SaverCheckTask = require('../models/SaverCheckTask');
const { processTask } = require('../services/saverCheckService');
const { TASK_TYPES, normalizeValue } = require('../services/saverTaskTypes');
const billing = require('../services/saverBillingService');

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

    // 计量收费：按提交条数预扣，余额不足拒绝
    const cfg = await billing.getBillingConfig();
    let cost = 0, unitPrice = 0, chargeLedgerId = null;
    if (cfg.enabled) {
      unitPrice = billing.priceFor(cfg, taskType);
      cost = billing.round3(unitPrice * results.length);
      if (cost > 0) {
        const charged = await billing.charge(req.workspace._id, cost, `检测 ${results.length} 条 × ${unitPrice}`);
        if (!charged) {
          return res.status(402).json({ success: false, message: `积分不足：本次需 ${cost} 积分，请联系管理员充值` });
        }
        chargeLedgerId = charged.ledgerId;
      }
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
      cost,
      unitPrice,
      results,
    });
    if (chargeLedgerId) {
      require('../models/SaverLedger').updateOne(
        { _id: chargeLedgerId }, { $set: { task: task._id } }).catch(() => {});
    }
    setImmediate(() => processTask(task._id).catch(err => console.error('[saver] processTask:', err.message)));
    const { results: _r, ...lean } = task.toObject();
    res.status(201).json({ success: true, data: lean });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/saver/wallet — 商家自己的积分钱包和单价（计费关闭时 enabled:false）
router.get('/wallet', async (req, res) => {
  try {
    const cfg = await billing.getBillingConfig();
    if (!cfg.enabled) return res.json({ success: true, data: { enabled: false } });
    const w = await billing.getWallet(req.workspace._id);
    res.json({ success: true, data: {
      enabled: true,
      balance: billing.round3(w.balance || 0),
      priceDefault: cfg.priceDefault,
      priceOverrides: cfg.priceOverrides,
    } });
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
