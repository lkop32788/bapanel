// 省钱专家：号码状态检测——对接 th333 筛号 API（https://api.th333.cc/apidoc.html）
// 流程：multipart 提交 txt → 轮询 /api/task/progress → Finish 后下载结果文件，
// 文件里出现的号码视为「有效」。认证：请求头 token。
const SaverCheckTask = require('../models/SaverCheckTask');
const SystemSettings = require('../models/SystemSettings');
const { TASK_TYPES } = require('./saverTaskTypes');

const getConfig = async () => {
  const settings = await SystemSettings.findOne().select('saverApi').lean().catch(() => null);
  const baseUrl = (settings?.saverApi?.baseUrl || process.env.SAVER_API_BASE_URL || 'https://api.th333.cc').replace(/\/+$/, '');
  const token = settings?.saverApi?.apiKey || process.env.SAVER_API_TOKEN || '';
  return { baseUrl, token };
};

const apiCall = (cfg, path, opts = {}, timeoutMs = 30000) =>
  fetch(cfg.baseUrl + path, {
    ...opts,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { token: cfg.token, ...(opts.headers || {}) },
  });

const apiJson = async (cfg, path, opts, timeoutMs) => {
  const res = await apiCall(cfg, path, opts, timeoutMs);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) throw new Error(data.message || `检测接口异常(HTTP ${res.status})`);
  return data;
};

async function getBalance() {
  const cfg = await getConfig();
  if (!cfg.token) return { configured: false, balance: null };
  const data = await apiJson(cfg, '/api/user/balance');
  return { configured: true, balance: data.data?.balance ?? null };
}

async function createRemoteTask(cfg, task) {
  const txt = task.results.map(r => r.phone).join('\n');
  const form = new FormData();
  form.append('file', new Blob([txt], { type: 'text/plain' }), 'numbers.txt');
  if (task.country?.code) form.append('country', task.country.code); // 邮箱类任务无需 country
  form.append('taskType', task.taskType);
  if (task.fileName) form.append('taskName', task.fileName.slice(0, 100));
  // 计费归属：接口地址是云仓中转代理时，代理按商家记账；直连 th333 时上游会忽略这两个字段
  try {
    const Workspace = require('../models/Workspace');
    const ws = await Workspace.findById(task.workspace).select('name').lean();
    form.append('bizId', String(task.workspace));
    form.append('bizName', ws?.name || '');
  } catch { /* 归属信息拿不到不影响检测 */ }
  const data = await apiJson(cfg, '/api/task/create', { method: 'POST', body: form }, 120000);
  if (!data.data?.taskId) throw new Error(data.message || '检测接口未返回任务编号');
  return data.data.taskId;
}

// 下载结果文件并解析为 Map<值, 附加信息行>（txt 直接解析；zip 用 jszip 解开，
// 跳过名字像「无效/未开通」的文件）。号码按纯数字匹配，邮箱/用户名按小写 token 匹配；
// 一行里除值以外还有内容时（如性别年龄），整行作为附加信息保留。
async function downloadValidMap(cfg, externalTaskId) {
  // 任务在平台侧已完成并扣费，下载失败多重试几次再放弃
  let res = null, lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      res = await apiCall(cfg, `/api/task/result?taskId=${encodeURIComponent(externalTaskId)}`, {}, 300000);
      if (res.ok) break;
      lastErr = new Error(`下载结果失败(HTTP ${res.status})`);
      res = null;
    } catch (err) { lastErr = err; }
    await sleep(10000);
  }
  if (!res) throw lastErr || new Error('下载结果失败');
  const buf = Buffer.from(await res.arrayBuffer());
  let text = '';
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(buf);
    for (const name of Object.keys(zip.files)) {
      const f = zip.files[name];
      if (f.dir) continue;
      if (/invalid|fail|无效|未开通|不活跃|未注册/i.test(name)) continue;
      text += (await f.async('string')) + '\n';
    }
  } else {
    text = buf.toString('utf8');
  }
  const map = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const tokens = line.split(/[\s,;\t|]+/).filter(Boolean);
    const extra = tokens.length > 1 ? line.slice(0, 120) : ''; // 限长：10万条×附加信息不能超 Mongo 16MB 文档上限
    for (const tok of tokens) {
      const digits = tok.replace(/\D/g, '');
      if (digits.length >= 6 && digits.length <= 17 && !map.get(digits)) map.set(digits, extra);
      const low = tok.toLowerCase();
      if (!map.get(low)) map.set(low, extra);
    }
  }
  return map;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const POLL_MS = 15000;
const MAX_POLLS = 1920; // 约 8 小时

const running = new Set();

async function processTask(taskId) {
  const key = String(taskId);
  if (running.has(key)) return;
  running.add(key);
  try {
    const task = await SaverCheckTask.findById(taskId);
    if (!task || !['pending', 'processing'].includes(task.status)) return;
    try {
      const cfg = await getConfig();
      if (!cfg.token) throw new Error('外部检测 API 未配置，请联系管理员填写检测接口 token');

      if (task.status === 'pending') {
        task.status = 'processing';
        task.startedAt = new Date();
        await task.save();
      }
      if (!task.externalTaskId) {
        task.externalTaskId = await createRemoteTask(cfg, task);
        await task.save();
      }

      let state = '';
      let errStreak = 0; // 平台在执行中已扣费，网络抖动不能直接判死，连续多次失败才放弃
      for (let i = 0; i < MAX_POLLS; i++) {
        if (i % 4 === 0) { // 每分钟确认一次本地任务还在（被客服删除就停止轮询）
          const alive = await SaverCheckTask.exists({ _id: task._id });
          if (!alive) return;
        }
        try {
          const data = await apiJson(cfg, `/api/task/progress?taskId=${encodeURIComponent(task.externalTaskId)}`);
          errStreak = 0;
          state = data.data?.taskState || '';
          const progress = Number(data.data?.taskProgress) || 0;
          if (progress !== task.checked) { task.checked = progress; await task.save(); }
          if (state === 'Finish') break;
          if (state === 'Fail') throw Object.assign(new Error('检测平台执行失败（费用已自动退回）'), { fatal: true });
          if (state === 'Close') throw Object.assign(new Error('检测任务已被平台关闭，请联系管理员'), { fatal: true });
        } catch (err) {
          if (err.fatal) throw err;
          errStreak += 1;
          if (errStreak >= 10) throw new Error(`查询检测进度连续失败：${err.message}`);
        }
        await sleep(POLL_MS);
      }
      if (state !== 'Finish') throw new Error('检测超时，请稍后刷新或联系管理员');

      const validMap = await downloadValidMap(cfg, task.externalTaskId);
      const activeType = !!TASK_TYPES[task.taskType]?.active; // 筛活跃：无效=久未上线；其余：无效=未开通
      for (const r of task.results) {
        const hit = validMap.has(r.phone) ? r.phone
          : validMap.has(r.phone.toLowerCase()) ? r.phone.toLowerCase() : null;
        if (hit !== null) {
          r.status = 'active';
          r.detail = validMap.get(hit) || (activeType ? '活跃' : '已开通');
        } else {
          r.status = activeType ? 'inactive' : 'not_found';
          r.detail = activeType ? '久未上线' : '未开通';
        }
      }
      const summary = { active: 0, banned: 0, inactive: 0, notFound: 0, unknown: 0 };
      for (const r of task.results) {
        if (r.status === 'not_found') summary.notFound += 1;
        else summary[r.status] = (summary[r.status] || 0) + 1;
      }
      task.summary = summary;
      task.status = 'completed';
      task.checked = task.total;
      task.error = '';
      task.finishedAt = new Date();
      await task.save();
    } catch (err) {
      task.status = 'failed';
      task.error = err.message || '检测失败';
      task.finishedAt = new Date();
      await task.save().catch(() => {});
      // 计量收费：任务失败全额退款。SEC-PAY3：refunded 标记用原子抢占落库
      // （原先读内存标志+吞错 save，多实例/重试场景会双退款）
      try {
        if (task.cost > 0) {
          const claimed = await require('../models/SaverCheckTask').findOneAndUpdate(
            { _id: task._id, refunded: { $ne: true } }, { $set: { refunded: true } });
          if (claimed) {
            await require('./saverBillingService').refund(task.workspace, task.cost, task._id);
          }
        }
      } catch (e) {
        console.error('[saver] refund:', e.message);
      }
    }
  } finally {
    running.delete(key);
  }
}

// 重启后恢复进行中的任务（已提交到外部平台的接着轮询，没提交的重新提交）
async function resumeAll() {
  try {
    const stuck = await SaverCheckTask.find({ status: { $in: ['pending', 'processing'] } }).select('_id').lean();
    for (const s of stuck) setImmediate(() => processTask(s._id).catch(() => {}));
    if (stuck.length) console.log(`[saver] resumed ${stuck.length} task(s)`);
  } catch (err) {
    console.error('[saver] resumeAll:', err.message);
  }
}
setTimeout(resumeAll, 15000);

module.exports = { processTask, getBalance };
