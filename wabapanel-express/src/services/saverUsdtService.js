// 充值中心：USDT(TRC20) 直收充值。后台设定收款地址和 RMB 汇率；
// 每笔订单生成唯一的"带尾数"精确金额（如 100 → 100.0037），商户按此金额转账，
// 轮询 TronGrid 监听收款地址的 USDT 入账，金额精确匹配即自动入账（实际到账 USDT × 汇率 = RMB）。
// 5 秒一轮（有待支付订单才请求链上），15 分钟超时；pending→paid 原子抢占保证只入账一次。
const SystemSettings = require('../models/SystemSettings');
const SaverUsdtOrder = require('../models/SaverUsdtOrder');
const billing = require('./saverBillingService');

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // Tron 主网 USDT
const ORDER_TTL_MS = 15 * 60 * 1000;
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

async function getUsdtConfig() {
  const s = await SystemSettings.findOne().select('saverApi').lean();
  const u = s?.saverApi?.usdt || {};
  const address = String(u.address || '').trim();
  return {
    enabled: !!u.enabled && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address),
    address,
    rate: Number(u.rate) > 0 ? Number(u.rate) : 7, // 1 USDT = 多少元
    tronApiKey: u.tronApiKey || '',
  };
}

// 创建充值订单：生成待支付的唯一精确金额
async function createOrder({ workspaceId, userId, usdtAmount }) {
  const cfg = await getUsdtConfig();
  if (!cfg.enabled) throw new Error('USDT 在线充值未开启，请联系管理员');
  const amount = round2(Number(usdtAmount));
  if (!Number.isFinite(amount) || amount < 1) throw new Error('单笔最低 1 USDT');
  if (amount > 100000) throw new Error('单笔金额过大');

  let payAmount = 0;
  for (let i = 0; i < 30; i++) {
    const candidate = round4(amount + (Math.floor(Math.random() * 99) + 1) / 10000);
    const clash = await SaverUsdtOrder.exists({
      status: 'pending', usdtAmount: candidate,
      createdAt: { $gte: new Date(Date.now() - ORDER_TTL_MS) },
    });
    if (!clash) { payAmount = candidate; break; }
  }
  if (!payAmount) throw new Error('系统繁忙，请稍后重试');

  const cfgRmb = round2(payAmount * cfg.rate);
  const order = await SaverUsdtOrder.create({
    workspace: workspaceId,
    by: userId,
    credits: cfgRmb,       // 预计到账 RMB（结算时按实际到账额更新）
    usdtAmount: payAmount, // 必须精确转账的 USDT 金额
    provider: 'trc20',
    orderNo: 'RC' + Date.now() + Math.floor(Math.random() * 1000),
  });
  return {
    orderNo: order.orderNo,
    payAmount,
    address: cfg.address,
    rmb: cfgRmb,
    rate: cfg.rate,
    expiresAt: new Date(order.createdAt.getTime() + ORDER_TTL_MS),
  };
}

// 拉取收款地址最近的 USDT 入账
async function fetchTransfers(cfg, minTimestamp) {
  const url = `https://api.trongrid.io/v1/accounts/${cfg.address}/transactions/trc20` +
    `?only_confirmed=true&only_to=true&limit=50&contract_address=${USDT_CONTRACT}&min_timestamp=${minTimestamp}`;
  const headers = { accept: 'application/json' };
  if (cfg.tronApiKey) headers['TRON-PRO-API-KEY'] = cfg.tronApiKey;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.data) ? data.data : [];
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    // 超时订单标记失败
    await SaverUsdtOrder.updateMany(
      { status: 'pending', createdAt: { $lt: new Date(Date.now() - ORDER_TTL_MS) } },
      { $set: { status: 'expired' } });

    const pending = await SaverUsdtOrder.find({ status: 'pending' }).lean();
    if (!pending.length) return;
    const cfg = await getUsdtConfig();
    if (!cfg.enabled) return;

    const oldest = Math.min(...pending.map(o => new Date(o.createdAt).getTime()));
    const transfers = await fetchTransfers(cfg, oldest - 120000);
    for (const tx of transfers) {
      const decimals = Number(tx.token_info?.decimals) || 6;
      const amt = round4(Number(tx.value) / Math.pow(10, decimals));
      if (!amt) continue;
      const order = pending.find(o =>
        round4(o.usdtAmount) === amt &&
        tx.block_timestamp >= new Date(o.createdAt).getTime() - 60000);
      if (!order) continue;
      const used = await SaverUsdtOrder.exists({ externalId: tx.transaction_id });
      if (used) continue;
      // 原子抢占，只入账一次
      const claimed = await SaverUsdtOrder.findOneAndUpdate(
        { _id: order._id, status: 'pending' },
        { $set: { status: 'paid', paidAt: new Date(), externalId: tx.transaction_id, credits: round2(amt * cfg.rate), raw: { amt, rate: cfg.rate, from: tx.from } } },
        { new: true });
      if (!claimed) continue;
      await billing.adjust(claimed.workspace, round2(amt * cfg.rate), claimed.by,
        `USDT充值 ${amt}U × ${cfg.rate} = ￥${round2(amt * cfg.rate)}（订单 ${claimed.orderNo}）`);
      console.log(`[recharge] order ${claimed.orderNo} paid ${amt} USDT → ￥${round2(amt * cfg.rate)}`);
    }
  } catch (err) {
    console.error('[recharge] tick:', err.message);
  } finally {
    ticking = false;
  }
}
setTimeout(() => setInterval(tick, 5000), 10000);

module.exports = { getUsdtConfig, createOrder };
