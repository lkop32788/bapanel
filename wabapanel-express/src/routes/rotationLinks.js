const router = require('express').Router();
const { protect } = require('../middleware/auth');
const RotationLink = require('../models/RotationLink');
const RotationHit = require('../models/RotationHit');
const Workspace = require('../models/Workspace');

router.use(protect);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const genCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

// Validates numbers[] against workspaces the caller OWNS and snapshots phones.
// Returns { error: { status, message } } or { numbers }.
async function buildNumbers(input, userId) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 20) {
    return { error: { status: 400, message: 'Select 1-20 numbers' } };
  }
  const seen = new Set();
  const numbers = [];
  for (const n of input) {
    const wsId = n && n.workspace;
    if (!wsId || !/^[a-f\d]{24}$/i.test(String(wsId))) return { error: { status: 400, message: 'Invalid workspace' } };
    if (seen.has(String(wsId))) return { error: { status: 400, message: 'Duplicate number' } };
    seen.add(String(wsId));
    const cap = n.dailyCap === undefined || n.dailyCap === '' ? 20 : Number(n.dailyCap);
    if (!Number.isInteger(cap) || cap < 1 || cap > 1000) return { error: { status: 400, message: 'dailyCap must be an integer 1-1000' } };
    const ws = await Workspace.findOne({ _id: wsId, owner: userId }).select('waQr.phone');
    if (!ws || !ws.waQr || !ws.waQr.phone) return { error: { status: 403, message: 'Number not available' } };
    numbers.push({ workspace: ws._id, phone: ws.waQr.phone, dailyCap: cap });
  }
  return { numbers };
}

// Numbers the caller can use
router.get('/numbers', async (req, res) => {
  try {
    // All owned workspaces: ones without a logged-in QR number are listed too (UI shows them disabled with guidance)
    const list = await Workspace.find({ owner: req.user._id }).select('name waQr.phone waQr.status');
    res.json({ success: true, data: list.map((w) => ({
      workspace: w._id, workspaceName: w.name, phone: (w.waQr && w.waQr.phone) || '',
      connected: !!(w.waQr && w.waQr.status === 'connected' && w.waQr.phone),
    })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const links = await RotationLink.find({ user: req.user._id }).sort('-createdAt').populate('numbers.workspace', 'name').lean();
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const agg = links.length ? await RotationHit.aggregate([
      { $match: { link: { $in: links.map((l) => l._id) }, at: { $gt: since } } },
      { $group: { _id: { link: '$link', phone: '$phone', kind: '$kind' }, n: { $sum: 1 } } },
    ]) : [];
    const counts = {};
    for (const a of agg) counts[`${a._id.link}|${a._id.phone}|${a._id.kind}`] = a.n;
    const data = links.map((l) => ({
      _id: l._id, title: l.title, code: l.code, prefillText: l.prefillText, isActive: l.isActive, createdAt: l.createdAt,
      numbers: (l.numbers || []).map((n) => ({
        workspace: n.workspace && n.workspace._id ? n.workspace._id : n.workspace,
        workspaceName: n.workspace && n.workspace.name ? n.workspace.name : '',
        phone: n.phone, dailyCap: n.dailyCap,
        sessions24h: counts[`${l._id}|${n.phone}|session`] || 0,
        clicks24h: counts[`${l._id}|${n.phone}|click`] || 0,
      })),
    }));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
    const r = await buildNumbers(req.body.numbers, req.user._id);
    if (r.error) return res.status(r.error.status).json({ success: false, message: r.error.message });
    const prefillText = req.body.prefillText === undefined ? 'Hi' : String(req.body.prefillText).slice(0, 500);
    let link;
    for (let i = 0; i < 8 && !link; i++) {
      try {
        link = await RotationLink.create({ user: req.user._id, title, code: genCode(), prefillText, numbers: r.numbers });
      } catch (e) {
        if (!(e && e.code === 11000)) throw e;
      }
    }
    if (!link) return res.status(500).json({ success: false, message: 'Could not generate code' });
    res.status(201).json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ success: false, message: 'Not found' });
    const link = await RotationLink.findOne({ _id: req.params.id, user: req.user._id });
    if (!link) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.body.title !== undefined) {
      const t = String(req.body.title).trim();
      if (!t) return res.status(400).json({ success: false, message: 'Title is required' });
      link.title = t;
    }
    if (req.body.prefillText !== undefined) link.prefillText = String(req.body.prefillText).slice(0, 500);
    if (req.body.isActive !== undefined) link.isActive = !!req.body.isActive;
    if (req.body.numbers !== undefined) {
      const r = await buildNumbers(req.body.numbers, req.user._id);
      if (r.error) return res.status(r.error.status).json({ success: false, message: r.error.message });
      link.numbers = r.numbers;
    }
    await link.save();
    res.json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ success: false, message: 'Not found' });
    const link = await RotationLink.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!link) return res.status(404).json({ success: false, message: 'Not found' });
    await RotationHit.deleteMany({ link: link._id });
    res.json({ success: true, message: 'Rotation link deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
