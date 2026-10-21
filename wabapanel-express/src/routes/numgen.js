const router = require('express').Router();
const { protect, workspaceAccess, denyAgent } = require('../middleware/auth');
const NumberGenBatch = require('../models/NumberGenBatch');
const { TASK_TYPES } = require('../services/saverTaskTypes');
const { createCheckTask } = require('../services/saverCheckService');
const { capacityOf, generate, preview } = require('../services/numberGenService');
const { getRegions, resolvePrefixes, groupPrefixes, filterBySelected } = require('../services/regionPrefixService');

const parseSelected = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map(s => String(s || '').trim()).filter(s => /^\d{1,12}$/.test(s)).slice(0, 1000);

router.use(protect, workspaceAccess);

const MAX_SEQUENTIAL = 5000000;
const MAX_RANDOM = 1000000;
const MAX_REGION_PREFIXES = 100000; // 最大的省（广东）约 5.6 万个七位号段，整省可选

// 列表/创建响应：地区模式前缀可达数万个，只回前 6 个 + 总数
const withExtras = (b, n) => ({
  ...b,
  capacity: capacityOf(b.prefixes, b.localLen),
  preview: preview(b, n),
  prefixes: b.prefixes.slice(0, 6),
  prefixCount: b.prefixes.length,
});

// POST /api/numgen/batches — 新建生成批次（只存参数，号码按需重新生成）
router.post('/batches', async (req, res) => {
  try {
    const body = req.body || {};
    const code = String(body.countryCode || '');
    const dial = String(body.countryDial || '').replace(/\D/g, '');
    if (!/^[A-Z]{2}$/.test(code) || !/^\d{1,4}$/.test(dial)) {
      return res.status(400).json({ success: false, message: '请选择国家' });
    }
    // 两种来源：按州/省（服务端从号段库解析前缀，忽略手填）/ 手填前缀
    const regionIn = body.region && typeof body.region === 'object' && String(body.region.name || '').trim() ? body.region : null;
    let prefixes, localLen, region = null;
    if (regionIn) {
      region = {
        name: String(regionIn.name).trim().slice(0, 50),
        city: String(regionIn.city || '').trim().slice(0, 50),
        isp: String(regionIn.isp || '').trim().slice(0, 20),
        selected: parseSelected(regionIn.selected),
      };
      const info = getRegions(code);
      if (!info.supported) return res.status(400).json({ success: false, message: '该国家不支持按州/省生成' });
      prefixes = resolvePrefixes(code, { region: region.name, city: region.city, isp: region.isp });
      if (prefixes.length === 0) return res.status(400).json({ success: false, message: '该地区没有号段数据' });
      if (region.selected.length) {
        prefixes = filterBySelected(prefixes, region.selected);
        if (prefixes.length === 0) return res.status(400).json({ success: false, message: '所选号段为空，请至少选一个号段' });
      }
      if (prefixes.length > MAX_REGION_PREFIXES) {
        return res.status(400).json({ success: false, message: `该地区号段 ${prefixes.length.toLocaleString('zh-CN')} 个，超过 ${(MAX_REGION_PREFIXES / 10000)} 万上限，请按市/运营商缩小范围` });
      }
      localLen = info.localLen;
    } else {
      localLen = Number(body.localLen);
      if (!Number.isInteger(localLen) || localLen < 5 || localLen > 15) {
        return res.status(400).json({ success: false, message: '号码位数需为 5～15 之间的整数' });
      }
      const rawPrefixes = Array.isArray(body.prefixes) ? body.prefixes : [];
      prefixes = [...new Set(rawPrefixes.map(p => String(p || '').trim()).filter(Boolean))];
      if (prefixes.length === 0 || prefixes.length > 6) {
        return res.status(400).json({ success: false, message: '号段前缀需填 1～6 个' });
      }
      for (const p of prefixes) {
        if (!/^\d{1,12}$/.test(p)) return res.status(400).json({ success: false, message: `号段前缀「${p}」只能是数字` });
        if (p.length >= localLen) return res.status(400).json({ success: false, message: `号段前缀「${p}」长度需小于号码位数 ${localLen}` });
      }
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
    const defaultName = region
      ? `${countryName || code}-${region.name}${region.city ? '-' + region.city : ''}${region.isp ? '-' + region.isp : ''}-${count}`
      : `${countryName || code}-${prefixes.join('/')}-${count}`;
    const name = (String(body.name || '').trim() || defaultName).slice(0, 100);
    const batch = await NumberGenBatch.create({
      workspace: req.workspace._id,
      createdBy: req.user._id,
      name,
      country: { name: countryName, dial, code },
      prefixes,
      ...(region ? { region } : {}),
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

// GET /api/numgen/batches/regions?country=XX — 该国可选的州/省（及市/运营商）。必须排在 /batches/:id 之前
router.get('/batches/regions', (req, res) => {
  try {
    const code = String(req.query.country || '').toUpperCase();
    res.json({ success: true, data: /^[A-Z]{2}$/.test(code) ? getRegions(code) : { supported: false } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/numgen/batches/regions/prefixes?country=&region=&city=&isp= — 地区号段数量/容量/样例（不返回全量）
router.get('/batches/regions/prefixes', (req, res) => {
  try {
    const code = String(req.query.country || '').toUpperCase();
    const info = getRegions(code);
    if (!info.supported) return res.status(400).json({ success: false, message: '该国家不支持按州/省生成' });
    const all = resolvePrefixes(code, {
      region: String(req.query.region || ''), city: String(req.query.city || ''), isp: String(req.query.isp || ''),
    });
    // groups 基于全量（供商户挑选），count/capacity/sample 基于 selected 筛选后
    const prefixes = filterBySelected(all, parseSelected(req.query.selected));
    const { prefixLen, groups } = groupPrefixes(all);
    res.json({ success: true, data: {
      count: prefixes.length,
      total: all.length,
      localLen: info.localLen,
      capacity: capacityOf(prefixes, info.localLen),
      sample: prefixes.slice(0, 10),
      overLimit: prefixes.length > MAX_REGION_PREFIXES,
      prefixLen,
      groups,
    } });
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

// POST /api/numgen/batches/:id/check — 把生成批次一键送检到省钱专家（按参数重新生成号码直接入检测明细，不经文件）
// 涉及扣商家钱包，客服不可用（与 /api/saver 一致）
const CHECK_MIN = 2000;
const CHECK_MAX = 5000000;
router.post('/batches/:id/check', denyAgent, async (req, res) => {
  try {
    const batch = await NumberGenBatch.findOne({ _id: req.params.id, workspace: req.workspace._id }).lean();
    if (!batch) return res.status(404).json({ success: false, message: '批次不存在' });
    const taskType = String(req.body?.taskType || '');
    const def = TASK_TYPES[taskType];
    if (!def) return res.status(400).json({ success: false, message: '无效的检测类型' });
    if (def.input !== 'phone') return res.status(400).json({ success: false, message: '该检测类型不适用于号码' });
    if (batch.count < CHECK_MIN || batch.count > CHECK_MAX) {
      return res.status(400).json({ success: false, message: `检测要求单次 ${CHECK_MIN.toLocaleString('zh-CN')}～${(CHECK_MAX / 10000)} 万条，本批次 ${batch.count.toLocaleString('zh-CN')} 条` });
    }
    const country = { name: batch.country?.name || '', dial: batch.country?.dial || '', code: batch.country?.code || '' };
    if (def.country && !/^[A-Z]{2}$/.test(country.code)) {
      return res.status(400).json({ success: false, message: '该批次没有国家信息，无法检测' });
    }
    const lean = await createCheckTask({
      workspaceId: req.workspace._id, userId: req.user._id,
      channel: def.channel, taskType, country,
      fileName: String(batch.name || '').slice(0, 200),
      total: batch.count,
      values: generate(batch), // 按批次参数确定性重生成，号码天然唯一
    });
    res.status(201).json({ success: true, data: lean });
  } catch (error) {
    if (error.status === 402) return res.status(402).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
