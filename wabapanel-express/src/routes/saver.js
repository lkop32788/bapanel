const router = require('express').Router();
const { protect, workspaceAccess, denyAgent } = require('../middleware/auth');
const SaverCheckTask = require('../models/SaverCheckTask');
const { processTask } = require('../services/saverCheckService');
const { TASK_TYPES, normalizeValue } = require('../services/saverTaskTypes');
const billing = require('../services/saverBillingService');
const SaverCheckItem = require('../models/SaverCheckItem');
const multer = require('multer');

// SEC-AGENT：筛号会扣商家钱包、充值涉及资金，客服一律不可用
router.use(protect, workspaceAccess, denyAgent);

const MIN_NUMBERS = 2000;
const MAX_NUMBERS = 5000000;
const CHANNELS = ['whatsapp', 'telegram', 'more'];

// 500 万行 txt 约 70-80MB，JSON 数组会超 express 50mb 限制，大文件走 multipart 直传
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const maybeFile = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.code === 'LIMIT_FILE_SIZE' ? '文件超过 200MB，请拆分后分次提交' : `文件上传失败：${err.message}`,
      });
    }
    next();
  });
};

// POST /api/saver/checks — 创建检测任务
// 两种提交方式：multipart 文件直传（txt 原文件，支持到 500 万条）/ JSON numbers 数组（旧版前端兼容）
router.post('/checks', maybeFile, async (req, res) => {
  try {
    const body = req.body || {};
    const { channel, taskType } = body;
    if (!CHANNELS.includes(channel)) {
      return res.status(400).json({ success: false, message: '无效的渠道' });
    }
    const def = TASK_TYPES[taskType];
    if (!def || def.channel !== channel) {
      return res.status(400).json({ success: false, message: '无效的检测类型' });
    }
    const country = req.file
      ? { name: String(body.countryName || ''), dial: String(body.countryDial || '').replace(/\D/g, ''), code: String(body.countryCode || '') }
      : { name: body.country?.name || '', dial: String(body.country?.dial || '').replace(/\D/g, ''), code: String(body.country?.code || '') };
    if (def.country && !/^[A-Z]{2}$/.test(country.code)) {
      return res.status(400).json({ success: false, message: '请选择客户号码国家' });
    }

    const normalize = normalizeValue[def.input] || normalizeValue.phone;
    const seen = new Set();
    const values = [];
    let overMax = false;
    const add = (raw) => {
      const v = normalize(raw);
      if (!v || seen.has(v)) return true;
      if (values.length >= MAX_NUMBERS) { overMax = true; return false; }
      seen.add(v);
      values.push(v);
      return true;
    };
    if (req.file) {
      // 逐行扫描，不整体 split（500 万行 split 会再物化一份大数组）。
      // 跳过 #/// 注释行；行内有 ,;\t 分列时只取第一列（否则整行数字会被拼成错号，
      // 注释里的日期也会被当号码）——与前端计数、云仓导入同一行契约
      const text = req.file.buffer.toString('utf8');
      let start = 0;
      while (start < text.length) {
        let end = text.indexOf('\n', start);
        if (end === -1) end = text.length;
        const line = text.slice(start, end).trim();
        start = end + 1;
        if (!line || line.startsWith('#') || line.startsWith('//')) continue;
        const sep = line.search(/[,;\t]/);
        if (!add(sep === -1 ? line : line.slice(0, sep))) break;
      }
    } else {
      const { numbers } = body;
      if (!Array.isArray(numbers) || numbers.length === 0) {
        return res.status(400).json({ success: false, message: '请先上传文件' });
      }
      if (numbers.length > MAX_NUMBERS) overMax = true;
      else for (const n of numbers) { if (!add(n)) break; }
    }
    if (overMax) {
      return res.status(400).json({ success: false, message: '单次最多 500 万条' });
    }
    if (values.length === 0) {
      return res.status(400).json({ success: false, message: '文件里没有识别到有效内容' });
    }
    if (values.length < MIN_NUMBERS) {
      return res.status(400).json({ success: false, message: `号码太少：去重后 ${values.length} 条，单次最低 2000 条` });
    }

    // 计量收费：按提交条数预扣，余额不足拒绝
    const cfg = await billing.getBillingConfig();
    let cost = 0, unitPrice = 0, chargeLedgerId = null;
    if (cfg.enabled) {
      unitPrice = billing.priceFor(cfg, taskType);
      cost = billing.round3(unitPrice * values.length);
      if (cost > 0) {
        const charged = await billing.charge(req.workspace._id, cost, `检测 ${values.length} 条 × ${unitPrice}`);
        if (!charged) {
          return res.status(402).json({ success: false, message: `余额不足：本次需 ￥${cost}，请先到充值中心充值` });
        }
        chargeLedgerId = charged.ledgerId;
      }
    }

    // SEC-PAY3：已预扣费后建任务/写明细失败必须退款（钱扣了任务没了）
    let task;
    try {
      task = await SaverCheckTask.create({
        workspace: req.workspace._id,
        createdBy: req.user._id,
        channel,
        taskType,
        fileName: String(body.fileName || '').slice(0, 200),
        country,
        total: values.length,
        cost,
        unitPrice,
      });
      // 明细拆独立集合（内嵌 500 万条会爆 Mongo 16MB 文档上限），原生分批插入避免逐条 cast
      for (let i = 0; i < values.length; i += 5000) {
        const docs = values.slice(i, i + 5000)
          .map(p => ({ task: task._id, phone: p, status: 'unknown', detail: '' }));
        await SaverCheckItem.collection.insertMany(docs, { ordered: false });
      }
    } catch (createErr) {
      if (task) {
        await SaverCheckItem.deleteMany({ task: task._id }).catch(() => {});
        await SaverCheckTask.deleteOne({ _id: task._id }).catch(() => {});
      }
      if (cost > 0) {
        await billing.refund(req.workspace._id, cost, null, '任务创建失败自动退款').catch((e) => console.error('[saver] create-refund:', e.message));
      }
      throw createErr;
    }
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

// GET /api/saver/checks/:id/export — 下载检测结果 txt（流式：500 万条明细整包返回会撑爆内存）
const EXPORT_STATUS_LABEL = { active: '有效', banned: '已封号', inactive: '久未上线', not_found: '未开通', unknown: '未知' };
router.get('/checks/:id/export', async (req, res) => {
  try {
    const task = await SaverCheckTask.findOne({ _id: req.params.id, workspace: req.workspace._id }).lean();
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if (task.status !== 'completed') {
      return res.status(400).json({ success: false, message: '任务还未完成，暂无结果可导出' });
    }
    const fname = `${task.fileName || String(task._id).slice(-8)}-检测结果.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
    const write = (s) => (res.write(s) ? Promise.resolve() : new Promise(r => res.once('drain', r)));
    const line = (it) => `${it.phone}\t${EXPORT_STATUS_LABEL[it.status] || it.status}${it.detail ? `\t${it.detail}` : ''}\n`;
    await write('号码\t状态\t说明\n');
    let buf = '';
    const flushAt = 1 << 16;
    if (task.results?.length) {
      // 旧任务：明细内嵌在任务文档
      for (const r of task.results) {
        buf += line(r);
        if (buf.length >= flushAt) { await write(buf); buf = ''; }
      }
    } else {
      const cursor = SaverCheckItem.find({ task: task._id })
        .select('phone status detail').lean().cursor({ batchSize: 5000 });
      for await (const it of cursor) {
        buf += line(it);
        if (buf.length >= flushAt) { await write(buf); buf = ''; }
      }
    }
    if (buf) await write(buf);
    res.end();
  } catch (error) {
    if (res.headersSent) return res.end();
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/saver/checks/:id — 删除任务记录
// SEC-PAY3：只允许删除已结束的任务（原先删除 processing 任务不退款、上游还在跑）
router.delete('/checks/:id', async (req, res) => {
  try {
    const task = await SaverCheckTask.findOneAndDelete({
      _id: req.params.id, workspace: req.workspace._id,
      status: { $in: ['completed', 'failed'] },
    });
    if (!task) return res.status(404).json({ success: false, message: '任务不存在，或任务还在检测中（检测中的任务不能删除）' });
    // 明细后台清理（500 万条删除不该阻塞响应）
    setImmediate(() => SaverCheckItem.deleteMany({ task: task._id }).catch(() => {}));
    res.json({ success: true, message: '已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
