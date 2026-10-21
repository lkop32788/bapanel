// 省钱专家：号码状态检测——对接 th333 筛号 API（https://api.th333.cc/apidoc.html）
// 流程：multipart 提交 txt → 轮询 /api/task/progress → Finish 后下载结果文件，
// 文件里出现的号码视为「有效」。认证：请求头 token。
const SaverCheckTask = require('../models/SaverCheckTask');
const SaverCheckItem = require('../models/SaverCheckItem');
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
  let txt;
  if (task.results?.length) {
    txt = task.results.map(r => r.phone).join('\n'); // 旧任务：明细内嵌在任务文档
  } else {
    const phones = [];
    const cursor = SaverCheckItem.find({ task: task._id }).select('phone').lean().cursor({ batchSize: 5000 });
    for await (const it of cursor) phones.push(it.phone);
    txt = phones.join('\n');
  }
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
async function downloadValidMap(cfg, externalTaskId, input) {
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
    const extra = tokens.length > 1 ? line.slice(0, 120) : ''; // 限长：防单条附加信息过长（旧任务内嵌明细还受 16MB 文档上限约束）
    for (const tok of tokens) {
      // 按输入类型只建单键：500 万条若同时存数字+小写双键，内存直接翻倍
      if (input === 'phone') {
        const digits = tok.replace(/\D/g, '');
        if (digits.length >= 6 && digits.length <= 17 && !map.get(digits)) map.set(digits, extra);
      } else {
        const low = tok.toLowerCase();
        if (!map.get(low)) map.set(low, extra);
      }
    }
  }
  return map;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const POLL_MS = 15000;
const MAX_POLLS = 5760; // 约 24 小时（单次最高 500 万条，上游检测耗时更长）

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

      const input = TASK_TYPES[task.taskType]?.input || 'phone';
      const validMap = await downloadValidMap(cfg, task.externalTaskId, input);
      const activeType = !!TASK_TYPES[task.taskType]?.active; // 筛活跃：无效=久未上线；其余：无效=未开通
      const judge = (phone) => {
        const hit = validMap.has(phone) ? phone
          : validMap.has(phone.toLowerCase()) ? phone.toLowerCase() : null;
        if (hit !== null) return { status: 'active', detail: validMap.get(hit) || (activeType ? '活跃' : '已开通') };
        return activeType ? { status: 'inactive', detail: '久未上线' } : { status: 'not_found', detail: '未开通' };
      };
      const summary = { active: 0, banned: 0, inactive: 0, notFound: 0, unknown: 0 };
      const tally = (status) => {
        if (status === 'not_found') summary.notFound += 1;
        else summary[status] = (summary[status] || 0) + 1;
      };
      if (task.results?.length) {
        // 旧任务：明细内嵌在任务文档
        for (const r of task.results) {
          const v = judge(r.phone);
          r.status = v.status;
          r.detail = v.detail;
          tally(v.status);
        }
      } else {
        // 新任务：明细在独立集合，游标逐条判定、分批回写
        const cursor = SaverCheckItem.find({ task: task._id }).select('_id phone').lean().cursor({ batchSize: 5000 });
        let ops = [];
        for await (const it of cursor) {
          const v = judge(it.phone);
          tally(v.status);
          ops.push({ updateOne: { filter: { _id: it._id }, update: { $set: { status: v.status, detail: v.detail } } } });
          if (ops.length >= 5000) { await SaverCheckItem.bulkWrite(ops, { ordered: false }); ops = []; }
        }
        if (ops.length) await SaverCheckItem.bulkWrite(ops, { ordered: false });
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

// 创建检测任务：计费预扣 → 建任务 → 明细分批入库 → 异步开跑。
// values 可为数组或任意可迭代/generator（按批 5000 插入，不整体物化）；total 由调用方给出用于计费。
// 余额不足抛 { status: 402 } 的 Error；建任务/写明细失败删任务+退款后抛错（SEC-PAY3）。
async function createCheckTask({ workspaceId, userId, channel, taskType, country, fileName, total, values }) {
  const billing = require('./saverBillingService');
  const cfg = await billing.getBillingConfig();
  let cost = 0, unitPrice = 0, chargeLedgerId = null;
  if (cfg.enabled) {
    unitPrice = billing.priceFor(cfg, taskType);
    cost = billing.round3(unitPrice * total);
    if (cost > 0) {
      const charged = await billing.charge(workspaceId, cost, `检测 ${total} 条 × ${unitPrice}`);
      if (!charged) {
        throw Object.assign(new Error(`余额不足：本次需 ￥${cost}，请先到充值中心充值`), { status: 402 });
      }
      chargeLedgerId = charged.ledgerId;
    }
  }

  let task;
  try {
    task = await SaverCheckTask.create({
      workspace: workspaceId,
      createdBy: userId,
      channel,
      taskType,
      fileName: String(fileName || '').slice(0, 200),
      country,
      total,
      cost,
      unitPrice,
    });
    // 明细拆独立集合（内嵌 500 万条会爆 Mongo 16MB 文档上限），原生分批插入避免逐条 cast
    let docs = [];
    for (const p of values) {
      docs.push({ task: task._id, phone: p, status: 'unknown', detail: '' });
      if (docs.length >= 5000) {
        await SaverCheckItem.collection.insertMany(docs, { ordered: false });
        docs = [];
      }
    }
    if (docs.length) await SaverCheckItem.collection.insertMany(docs, { ordered: false });
  } catch (createErr) {
    if (task) {
      await SaverCheckItem.deleteMany({ task: task._id }).catch(() => {});
      await SaverCheckTask.deleteOne({ _id: task._id }).catch(() => {});
    }
    if (cost > 0) {
      await billing.refund(workspaceId, cost, null, '任务创建失败自动退款').catch((e) => console.error('[saver] create-refund:', e.message));
    }
    throw createErr;
  }
  if (chargeLedgerId) {
    require('../models/SaverLedger').updateOne(
      { _id: chargeLedgerId }, { $set: { task: task._id } }).catch(() => {});
  }
  setImmediate(() => processTask(task._id).catch(err => console.error('[saver] processTask:', err.message)));
  const { results: _r, ...lean } = task.toObject();
  return lean;
}

module.exports = { processTask, getBalance, createCheckTask };
