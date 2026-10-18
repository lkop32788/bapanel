const ShortLink = require('../models/ShortLink');
const { v4: uuidv4 } = require('uuid');

const getShortLinks = async (req, res) => {
  try {
    const links = await ShortLink.find({ workspace: req.workspace._id }).sort('-createdAt');
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createShortLink = async (req, res) => {
  try {
    const shortCode = req.body.shortCode || uuidv4().substring(0, 8);
    const link = await ShortLink.create({
      ...req.body,
      shortCode,
      workspace: req.workspace._id,
      user: req.user._id,
    });
    res.status(201).json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateShortLink = async (req, res) => {
  try {
    const link = await ShortLink.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true }
    );
    if (!link) return res.status(404).json({ success: false, message: 'Short link not found' });
    res.json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteShortLink = async (req, res) => {
  try {
    await ShortLink.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true, message: 'Short link deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const findRotation = (code) => require('../models/RotationLink')
  .findOne({ code: String(code || '').toUpperCase(), isActive: true });

// Picks the least-loaded number for a rotation link and returns the wa.me URL (null if no numbers).
// record=false: no click hit, no lastPick increment (used for metadata/preview fetches).
async function pickRotationNumber(rot, { record = true } = {}) {
  if (!rot.numbers || !rot.numbers.length) return null;
  const RotationHit = require('../models/RotationHit');
  const RotationLink = require('../models/RotationLink');
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const agg = await RotationHit.aggregate([
    { $match: { link: rot._id, at: { $gt: since } } },
    { $group: { _id: { phone: '$phone', kind: '$kind' }, n: { $sum: 1 } } },
  ]);
  const cnt = {};
  for (const a of agg) cnt[`${a._id.phone}|${a._id.kind}`] = a.n;
  const stats = rot.numbers.map((n) => ({ n, s: cnt[`${n.phone}|session`] || 0, c: cnt[`${n.phone}|click`] || 0 }));
  const under = stats.filter((x) => x.s < x.n.dailyCap);
  const pool = (under.length ? under : stats).sort((a, b) => a.s - b.s || a.c - b.c);
  const ties = pool.filter((x) => x.s === pool[0].s && x.c === pool[0].c);
  let lp = rot.lastPick || 0;
  if (record) {
    const upd = await RotationLink.findOneAndUpdate({ _id: rot._id }, { $inc: { lastPick: 1 } }, { new: true }).select('lastPick');
    if (upd) lp = upd.lastPick;
  }
  const pick = ties[((lp % ties.length) + ties.length) % ties.length].n;
  if (record) RotationHit.create({ link: rot._id, workspace: pick.workspace, phone: pick.phone, kind: 'click' }).catch(() => {});
  return pick;
}

async function pickRotationUrl(rot, opts) {
  const pick = await pickRotationNumber(rot, opts);
  if (!pick) return null;
  const digits = String(pick.phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(`${rot.prefillText || 'Hi'} [${rot.code}]`)}`;
}

// Public JSON used by the frontend /s/[code] page. hit=1 counts the visit.
const getPublicShortLink = async (req, res) => {
  try {
    const record = req.query.hit === '1';
    const rot = await findRotation(req.params.code);
    if (rot) {
      const url = await pickRotationUrl(rot, { record });
      if (!url) return res.status(404).json({ success: false, message: 'Link not found' });
      return res.json({ success: true, data: { title: rot.title, description: '', imageUrl: '', originalUrl: url, showPreview: false, clicks: 0 } });
    }
    const link = await ShortLink.findOne({ shortCode: req.params.code, isActive: true });
    if (!link) return res.status(404).json({ success: false, message: 'Link not found' });
    if (link.expiresAt && new Date() > link.expiresAt) return res.status(404).json({ success: false, message: 'Link expired' });
    if (record) {
      link.clicks++;
      link.clickDetails.push({
        ip: req.headers['x-visitor-ip'] || req.ip,
        userAgent: req.headers['x-visitor-ua'] || req.headers['user-agent'],
        referrer: req.headers['x-visitor-referrer'] || '',
        clickedAt: new Date(),
      });
      await link.save();
    }
    res.json({ success: true, data: { title: link.title, description: '', imageUrl: '', originalUrl: link.originalUrl, showPreview: false, clicks: link.clicks } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const redirectShortLink = async (req, res) => {
  try {
    // Rotation links (multi-number wa.me redirect) take precedence
    const rot = await findRotation(req.params.code);
    if (rot) {
      const url = await pickRotationUrl(rot, { record: true });
      if (!url) return res.status(404).json({ success: false, message: 'Link not found' });
      return res.redirect(302, url);
    }
    const link = await ShortLink.findOne({ shortCode: req.params.code, isActive: true });
    if (!link) return res.status(404).json({ success: false, message: 'Link not found' });

    if (link.expiresAt && new Date() > link.expiresAt) {
      return res.status(410).json({ success: false, message: 'Link expired' });
    }

    link.clicks++;
    link.clickDetails.push({
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer || '',
      clickedAt: new Date(),
    });
    await link.save();

    res.redirect(301, link.originalUrl);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getShortLinks, createShortLink, updateShortLink, deleteShortLink, redirectShortLink, getPublicShortLink, pickRotationNumber };
