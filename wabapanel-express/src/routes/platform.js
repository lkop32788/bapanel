const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const mongoose = require('mongoose');
const { protect, adminOnly } = require('../middleware/auth');
const Announcement = require('../models/Announcement');
const SystemSettings = require('../models/SystemSettings');

const BACKUP_DIR = '/var/backups/wabapanel';

router.use(protect);

// ---------- Announcements (vendor) ----------
router.get('/announcements/active', async (req, res) => {
  try {
    const now = new Date();
    const items = await Announcement.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ createdAt: -1 }).limit(5);
    res.json({ success: true, data: items });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ================= ADMIN =================
router.use(adminOnly);

// ---------- Backups ----------
function findMongodump() {
  const candidates = ['mongodump', '/usr/bin/mongodump', '/usr/local/bin/mongodump', '/snap/bin/mongodump', '/opt/mongodb-database-tools/bin/mongodump'];
  for (const c of candidates) {
    try { require('child_process').execFileSync(c, ['--version'], { stdio: 'ignore', timeout: 10000 }); return c; } catch (e) { /* try next */ }
  }
  return '';
}

// Dump every collection as gzipped JSON over the existing mongoose connection.
// Used when mongodump is not installed so backups still work on minimal installs.
async function nodeNativeBackup(file) {
  const mongoose = require('mongoose');
  const zlib = require('zlib');
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  const collections = await db.listCollections().toArray();
  const gz = zlib.createGzip();
  const outStream = fs.createWriteStream(file);
  gz.pipe(outStream);
  const write = (chunk) => new Promise((resolve, reject) => gz.write(chunk, (e) => (e ? reject(e) : resolve())));
  await write('{"format":"wabapanel-json-backup","createdAt":' + JSON.stringify(new Date().toISOString()) + ',"collections":{');
  for (let i = 0; i < collections.length; i++) {
    const name = collections[i].name;
    await write((i ? ',' : '') + JSON.stringify(name) + ':[');
    const cursor = db.collection(name).find({});
    let first = true;
    for await (const doc of cursor) {
      await write((first ? '' : ',') + JSON.stringify(doc));
      first = false;
    }
    await write(']');
  }
  await write('}}');
  await new Promise((resolve, reject) => { outStream.on('finish', resolve); outStream.on('error', reject); gz.end(); });
  return file;
}

function pruneBackups() {
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.gz')).sort();
  while (files.length > 10) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
}

function runBackup() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const bin = findMongodump();
    const dbName = require('mongoose').connection.name || 'wabapanel';
    const jsonFallback = () => {
      const jfile = path.join(BACKUP_DIR, `wabapanel-${stamp}.json.gz`);
      nodeNativeBackup(jfile).then(() => { pruneBackups(); resolve(jfile); }).catch(reject);
    };
    if (!bin) return jsonFallback();
    const file = path.join(BACKUP_DIR, `wabapanel-${stamp}.gz`);
    execFile(bin, ['--db', dbName, `--archive=${file}`, '--gzip'], { timeout: 10 * 60 * 1000 }, (err) => {
      if (!err) { pruneBackups(); return resolve(file); }
      // mongodump exists but failed (auth/URI mismatch) — use the native dump.
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (e) { /* noop */ }
      jsonFallback();
    });
  });
}

router.get('/admin/backups', async (req, res) => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.gz')).sort().reverse().map(f => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: st.size, createdAt: st.mtime };
    });
    res.json({ success: true, data: files });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.post('/admin/backups', async (req, res) => {
  try { const file = await runBackup(); res.json({ success: true, message: 'Backup created', data: { name: path.basename(file) } }); }
  catch (e) { res.status(500).json({ success: false, message: 'Backup failed: ' + e.message }); }
});
router.get('/admin/backups/:name/download', async (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(BACKUP_DIR, name);
  if (!name.endsWith('.gz') || !fs.existsSync(file)) return res.status(404).json({ success: false, message: 'Backup not found' });
  res.download(file, name);
});
router.delete('/admin/backups/:name', async (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(BACKUP_DIR, name);
  if (!name.endsWith('.gz') || !fs.existsSync(file)) return res.status(404).json({ success: false, message: 'Backup not found' });
  fs.unlinkSync(file);
  res.json({ success: true });
});

// ---------- System health ----------
router.get('/admin/health', async (req, res) => {
  try {
    const disk = await new Promise((resolve) => {
      execFile('df', ['-h', '/'], (err, out) => {
        if (err || !out) return resolve(null);
        const parts = out.trim().split('\n').pop().split(/\s+/);
        resolve({ total: parts[1], used: parts[2], available: parts[3], usedPercent: parts[4] });
      });
    });
    const pm2 = await new Promise((resolve) => {
      execFile('pm2', ['jlist'], { timeout: 15000 }, (err, out) => {
        if (err || !out) return resolve([]);
        try {
          resolve(JSON.parse(out).map(p => ({
            name: p.name, status: p.pm2_env && p.pm2_env.status,
            uptime: p.pm2_env && p.pm2_env.pm_uptime, restarts: p.pm2_env && p.pm2_env.restart_time,
            memory: p.monit && p.monit.memory, cpu: p.monit && p.monit.cpu,
          })));
        } catch { resolve([]); }
      });
    });
    res.json({
      success: true,
      data: {
        server: {
          uptime: os.uptime(),
          loadAvg: os.loadavg(),
          totalMem: os.totalmem(),
          freeMem: os.freemem(),
          cpus: os.cpus().length,
          nodeVersion: process.version,
        },
        db: { state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown' },
        disk, pm2,
      },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------- Comprehensive server health scan (server-health.sh) ----------
const SH_SCRIPT = path.join(__dirname, '..', 'scripts', 'server-health.sh');
let shReportCache = { at: 0, data: null };
router.get('/admin/health-report', async (req, res) => {
  try {
    if (Date.now() - shReportCache.at < 60000 && shReportCache.data && !req.query.force) {
      return res.json({ success: true, cached: true, data: shReportCache.data });
    }
    if (!fs.existsSync(SH_SCRIPT)) {
      return res.status(501).json({ success: false, message: 'health scanner not installed' });
    }
    const outDir = path.join(os.tmpdir(), 'shr-' + Date.now());
    const host = String(req.get('host') || '').split(':')[0];
    const data = await new Promise((resolve) => {
      const args = [SH_SCRIPT, '-q', '--no-color', '-f', 'json', '-o', outDir];
      if (host && /^[a-z0-9.-]+$/i.test(host) && host !== 'localhost' && host !== '127.0.0.1') {
        args.push('-w', 'https://' + host);
      }
      execFile('bash', args, { timeout: 90000, maxBuffer: 8 * 1024 * 1024 }, () => {
        try {
          const files = (fs.readdirSync(outDir) || []).filter((f) => f.endsWith('.json'));
          if (!files.length) return resolve(null);
          resolve(JSON.parse(fs.readFileSync(path.join(outDir, files[0]), 'utf8')));
        } catch { resolve(null); }
        finally { try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {} }
      });
    });
    if (!data) return res.status(500).json({ success: false, message: 'health scan produced no report' });
    shReportCache = { at: Date.now(), data };
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------- Maintenance mode ----------
router.get('/admin/maintenance', async (req, res) => {
  try {
    const s = await SystemSettings.findOne();
    res.json({ success: true, data: (s && s.maintenance) || { isEnabled: false, message: '' } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.put('/admin/maintenance', async (req, res) => {
  try {
    const s = (await SystemSettings.findOne()) || new SystemSettings();
    s.maintenance = { isEnabled: !!req.body.isEnabled, message: req.body.message || 'We are currently under maintenance. Please check back later.' };
    await s.save();
    resetMaintenanceCache();
    res.json({ success: true, data: s.maintenance });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------- Maintenance guard middleware + cron backup (exported) ----------
let maintCache = { at: 0, value: null };
function resetMaintenanceCache() { maintCache = { at: 0, value: null }; }

async function getMaintenance() {
  if (Date.now() - maintCache.at < 30000 && maintCache.value) return maintCache.value;
  try {
    const s = await SystemSettings.findOne().select('maintenance').lean();
    maintCache = { at: Date.now(), value: (s && s.maintenance) || { isEnabled: false } };
  } catch { maintCache = { at: Date.now(), value: { isEnabled: false } }; }
  return maintCache.value;
}

// Blocks non-admin API traffic while maintenance mode is on.
async function maintenanceGuard(req, res, next) {
  const p = req.path || '';
  if (p.startsWith('/api/auth') || p.startsWith('/api/admin') || p.startsWith('/api/webhook') || p.startsWith('/api/platform')) return next();
  const m = await getMaintenance();
  if (m && m.isEnabled) {
    return res.status(503).json({ success: false, maintenance: true, message: m.message || 'We are currently under maintenance. Please check back later.' });
  }
  next();
}

// Public (unauthenticated) maintenance status for the frontend overlay.
async function maintenanceStatus(req, res) {
  const m = await getMaintenance();
  res.json({ success: true, data: { isEnabled: !!(m && m.isEnabled), message: (m && m.message) || '' } });
}

module.exports = { router, maintenanceGuard, maintenanceStatus, runBackup };
