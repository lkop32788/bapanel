const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const NumberGenBatch = require('../models/NumberGenBatch');
const { capacityOf, generate, preview } = require('../services/numberGenService');

router.use(protect, workspaceAccess);

const MAX_SEQUENTIAL = 5000000;
const MAX_RANDOM = 1000000;

const withExtras = (b, n) => ({ ...b, capacity: capacityOf(b.prefixes, b.localLen), preview: preview(b, n) });

// POST /api/numgen/batches — 新建生成批次（只存参数，号码按需重新生成）
router.post('/batches', async (req, res) => {
  try {
    const body = req.body || {};
    const code = String(body.countryCode || '');
    const dial = String(body.countryDial || '').replace(/\D/g, '');
    if (!/^[A-Z]{2}$/.test(code) || !/^\d{1,4}$/.test(dial)) {
      return res.status(400).json({ success: false, message: '请选择国家' });
    }
    const localLen = Number(body.localLen);
    if (!Number.isInteger(localLen) || localLen < 5 || localLen > 15) {
      return res.status(400).json({ success: false, message: '号码位数需为 5～15 之间的整数' });
    }
    const rawPrefixes = Array.isArray(body.prefixes) ? body.prefixes : [];
    const prefixes = [...new Set(rawPrefixes.map(p => String(p || '').trim()).filter(Boolean))];
    if (prefixes.length === 0 || prefixes.length > 6) {
      return res.status(400).json({ success: false, message: '号段前缀需填 1～6 个' });
    }
    for (const p of prefixes) {
      if (!/^\d{1,12}$/.test(p)) return res.status(400).json({ success: false, message: `号段前缀「${p}」只能是数字` });
      if (p.length >= localLen) return res.status(400).json({ success: false, message: `号段前缀「${p}」长度需小于号码位数 ${localLen}` });
    }
    const mode = body.mode === 'random' ? 'random' : body.mode === 'sequential' ? 'sequential' : '';
    if (!mode) return res.status(400).json({ success: false, message: '生成方式无效' });
    const count = Number(body.count);
    if (!Number.isInteger(count) || count < 1) {
      return res.status(400).json({ success: false, message: '生成数量需为正整数' });
    }
    const capacity = capacityOf(prefixes, localLen);
    if (mode === 'sequential') {
      if (count > MAX_SEQUENTIAL) return res.status(400).json({ success: false, message: '单次最多 500 万个' });
      if (count > capacity) return res.status(400).json({ success: false, message: `超出号段容量 ${capacity.toLocaleString('zh-CN')} 个` });
    } else {
      const half = Math.floor(capacity / 2);
      if (count > MAX_RANDOM) return res.status(400).json({ success: false, message: '随机模式单次最多 100 万个，更多请用顺序模式' });
      if (count > half) return res.status(400).json({ success: false, message: `随机模式最多生成号段容量的一半（${half.toLocaleString('zh-CN')} 个），更多请用顺序模式` });
    }
    const countryName = String(body.countryName || '').slice(0, 50);
    const name = (String(body.name || '').trim() || `${countryName || code}-${prefixes.join('/')}-${count}`).slice(0, 100);
    const batch = await NumberGenBatch.create({
      workspace: req.workspace._id,
      createdBy: req.user._id,
      name,
      country: { name: countryName, dial, code },
      prefixes,
      localLen,
      mode,
      count,
      seed: Math.floor(Math.random() * 0x7fffffff),
    });
    res.status(201).json({ success: true, data: withExtras(batch.toObject(), 5) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/numgen/batches?page&limit&name — 生成列表（分页）
router.get('/batches', async (req, res) => {
  try {
    const q = { workspace: req.workspace._id };
    if (req.query.name) {
      const safe = String(req.query.name).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      q.name = { $regex: safe, $options: 'i' };
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const [rows, total] = await Promise.all([
      NumberGenBatch.find(q).sort('-createdAt').skip((page - 1) * limit).limit(limit).lean(),
      NumberGenBatch.countDocuments(q),
    ]);
    res.json({
      success: true,
      data: rows.map(b => withExtras(b, 3)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/numgen/batches/:id/export — 下载 txt（按参数流式重新生成，每行一个号码）
router.get('/batches/:id/export', async (req, res) => {
  try {
    const batch = await NumberGenBatch.findOne({ _id: req.params.id, workspace: req.workspace._id }).lean();
    if (!batch) return res.status(404).json({ success: false, message: '批次不存在' });
    const fname = `${batch.name || String(batch._id).slice(-8)}.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
    const write = (s) => (res.write(s) ? Promise.resolve() : new Promise(r => res.once('drain', r)));
    let buf = '';
    const flushAt = 1 << 16;
    for (const phone of generate(batch)) {
      buf += phone + '\n';
      if (buf.length >= flushAt) { await write(buf); buf = ''; }
    }
    if (buf) await write(buf);
    res.end();
  } catch (error) {
    if (res.headersSent) return res.end();
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/numgen/batches/:id
router.delete('/batches/:id', async (req, res) => {
  try {
    const r = await NumberGenBatch.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!r) return res.status(404).json({ success: false, message: '批次不存在' });
    res.json({ success: true, message: '已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
