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
          return res.status(402).json({ success: false, message: `余额不足：本次需 ￥${cost}，请先到充值中心充值` });
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
    const usdt = await require('../services/saverUsdtService').getUsdtConfig();
    res.json({ success: true, data: {
      enabled: true,
      balance: billing.round3(w.balance || 0),
      priceDefault: cfg.priceDefault,
      priceOverrides: cfg.priceOverrides,
      usdt: { enabled: usdt.enabled, rate: usdt.rate },
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/saver/wallet/ledger — 商家自己的积分流水（分页）
router.get('/wallet/ledger', async (req, res) => {
  try {
    const SaverLedger = require('../models/SaverLedger');
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const q = { workspace: req.workspace._id };
    const [rows, total] = await Promise.all([
      SaverLedger.find(q).populate('task', 'fileName taskType total')
        .sort('-createdAt').skip((page - 1) * limit).limit(limit).lean(),
      SaverLedger.countDocuments(q),
    ]);
    res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/saver/wallet/topup-request — 提交充值申请
router.post('/wallet/topup-request', async (req, res) => {
  try {
    const cfg = await billing.getBillingConfig();
    if (!cfg.enabled) return res.status(400).json({ success: false, message: '计费未开启，无需充值' });
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      return res.status(400).json({ success: false, message: '金额无效' });
    }
    const SaverTopupRequest = require('../models/SaverTopupRequest');
    const pendingCount = await SaverTopupRequest.countDocuments({ workspace: req.workspace._id, status: 'pending' });
    if (pendingCount >= 3) {
      return res.status(400).json({ success: false, message: '已有待处理的充值申请，请等待管理员审核' });
    }
    const reqDoc = await SaverTopupRequest.create({
      workspace: req.workspace._id,
      amount: billing.round3(amount),
      note: String(req.body?.note || '').slice(0, 500),
      by: req.user._id,
    });
    res.status(201).json({ success: true, message: '申请已提交，管理员审核后积分自动到账', data: reqDoc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/saver/wallet/usdt-order — 创建 USDT 充值订单（输入 USDT 金额，返回收款地址和精确转账金额）
router.post('/wallet/usdt-order', async (req, res) => {
  try {
    const cfg = await billing.getBillingConfig();
    if (!cfg.enabled) return res.status(400).json({ success: false, message: '计费未开启，无需充值' });
    const order = await require('../services/saverUsdtService').createOrder({
      workspaceId: req.workspace._id, userId: req.user._id, usdtAmount: Number(req.body?.usdt),
    });
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/saver/wallet/usdt-order/:orderNo — 订单状态（前端支付页 5 秒轮询）
router.get('/wallet/usdt-order/:orderNo', async (req, res) => {
  try {
    const SaverUsdtOrder = require('../models/SaverUsdtOrder');
    const o = await SaverUsdtOrder.findOne({ orderNo: req.params.orderNo, workspace: req.workspace._id }).lean();
    if (!o) return res.status(404).json({ success: false, message: '订单不存在' });
    res.json({ success: true, data: { orderNo: o.orderNo, status: o.status, rmb: o.credits, usdtAmount: o.usdtAmount } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/saver/wallet/usdt-orders — 自己的充值订单列表
router.get('/wallet/usdt-orders', async (req, res) => {
  try {
    const SaverUsdtOrder = require('../models/SaverUsdtOrder');
    const orders = await SaverUsdtOrder.find({ workspace: req.workspace._id }).sort('-createdAt').limit(10).lean();
    res.json({ success: true, data: orders.map(o => ({
      orderNo: o.orderNo, rmb: o.credits, usdtAmount: o.usdtAmount,
      status: o.status, createdAt: o.createdAt,
    })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/saver/wallet/topup-requests — 自己的充值申请记录
router.get('/wallet/topup-requests', async (req, res) => {
  try {
    const SaverTopupRequest = require('../models/SaverTopupRequest');
    const rows = await SaverTopupRequest.find({ workspace: req.workspace._id })
      .sort('-createdAt').limit(20).lean();
    res.json({ success: true, data: rows });
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
