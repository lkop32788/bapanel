// 省钱专家：商家计量收费。单价 = priceOverrides[taskType] || priceDefault（积分/条）。
// 扣费用 findOneAndUpdate 原子操作，余额不足直接失败；任务失败全额退款。
const SystemSettings = require('../models/SystemSettings');
const SaverWallet = require('../models/SaverWallet');
const SaverLedger = require('../models/SaverLedger');

const round3 = (n) => Math.round(n * 1000) / 1000;

async function getBillingConfig() {
  const s = await SystemSettings.findOne().select('saverApi').lean();
  const api = s?.saverApi || {};
  const overrides = api.priceOverrides instanceof Map
    ? Object.fromEntries(api.priceOverrides) : (api.priceOverrides || {});
  return {
    enabled: !!api.billingEnabled,
    priceDefault: Number(api.priceDefault) || 0,
    priceOverrides: overrides,
  };
}

const priceFor = (cfg, taskType) => {
  const p = cfg.priceOverrides?.[taskType];
  return round3(Number(p) > 0 ? Number(p) : cfg.priceDefault);
};

async function getWallet(workspaceId) {
  return SaverWallet.findOneAndUpdate(
    { workspace: workspaceId }, { $setOnInsert: { balance: 0 } },
    { new: true, upsert: true }).lean();
}

// 扣费：余额足够才扣（原子）。成功返回 { balance, ledgerId }，不足返回 null
async function charge(workspaceId, cost, note) {
  if (cost <= 0) return { balance: 0, ledgerId: null };
  await getWallet(workspaceId); // 确保钱包存在
  const w = await SaverWallet.findOneAndUpdate(
    { workspace: workspaceId, balance: { $gte: cost } },
    { $inc: { balance: -cost } }, { new: true });
  if (!w) return null;
  const ledger = await SaverLedger.create({
    workspace: workspaceId, type: 'charge', amount: -cost,
    balanceAfter: round3(w.balance), note: note || '',
  });
  return { balance: round3(w.balance), ledgerId: ledger._id };
}

// 退款（任务失败）：幂等由调用方的 task.refunded 标记保证
async function refund(workspaceId, cost, taskId, note) {
  if (cost <= 0) return;
  const w = await SaverWallet.findOneAndUpdate(
    { workspace: workspaceId }, { $inc: { balance: cost } },
    { new: true, upsert: true });
  await SaverLedger.create({
    workspace: workspaceId, type: 'refund', amount: cost,
    balanceAfter: round3(w.balance), task: taskId, note: note || '检测失败退款',
  });
}

// 管理员充值/扣减 + 系统入账。
// SEC-PAY3：带 ref（幂等键）时先记 settled:false 流水（ref 唯一索引挡重复），
// 再加钱包、置 settled:true——崩溃留下的未结算流水由 reconcile 补齐；
// ref 冲突（已入账过）返回 null，调用方据此跳过。
async function adjust(workspaceId, amount, byUserId, note, ref) {
  let ledger = null;
  if (ref) {
    try {
      ledger = await SaverLedger.create({
        workspace: workspaceId, type: amount >= 0 ? 'topup' : 'adjust', amount,
        balanceAfter: 0, by: byUserId, note: note || '', ref, settled: false,
      });
    } catch (e) {
      if (e && e.code === 11000) return null; // 同一笔已入账
      throw e;
    }
  }
  const w = await SaverWallet.findOneAndUpdate(
    { workspace: workspaceId }, { $inc: { balance: amount } },
    { new: true, upsert: true });
  if (ledger) {
    await SaverLedger.updateOne({ _id: ledger._id },
      { $set: { balanceAfter: round3(w.balance), settled: true } });
  } else {
    await SaverLedger.create({
      workspace: workspaceId, type: amount >= 0 ? 'topup' : 'adjust', amount,
      balanceAfter: round3(w.balance), by: byUserId, note: note || '',
    });
  }
  return round3(w.balance);
}

// SEC-PAY3 对账：补齐"流水已记、钱包未加"的崩溃残留（启动 20 秒后 + 每小时）
async function reconcileUnsettled() {
  const rows = await SaverLedger.find({
    settled: false, ref: { $exists: true },
    createdAt: { $lt: new Date(Date.now() - 60 * 1000) },
  }).limit(100);
  for (const l of rows) {
    const w = await SaverWallet.findOneAndUpdate(
      { workspace: l.workspace }, { $inc: { balance: l.amount } },
      { new: true, upsert: true });
    await SaverLedger.updateOne({ _id: l._id },
      { $set: { balanceAfter: round3(w.balance), settled: true, note: (l.note || '') + '（对账补入）' } });
    console.log(`[saver] reconcile: ledger ${l._id} (${l.ref}) 补入 ${l.amount}`);
  }
}
setTimeout(() => {
  reconcileUnsettled().catch((e) => console.error('[saver] reconcile:', e.message));
  setInterval(() => reconcileUnsettled().catch((e) => console.error('[saver] reconcile:', e.message)), 60 * 60 * 1000);
}, 20 * 1000);

module.exports = { getBillingConfig, priceFor, getWallet, charge, refund, adjust, reconcileUnsettled, round3 };
