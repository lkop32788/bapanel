// 充值中心：USDT(TRC20) 直收充值。后台设定收款地址和 RMB 汇率；
// 每笔订单生成唯一的"带尾数"精确金额（如 100 → 100.0037），商户按此金额转账，
// 轮询 TronGrid 监听收款地址的 USDT 入账，金额精确匹配即自动入账（实际到账 USDT × 汇率 = RMB）。
// 5 秒一轮（有待支付订单才请求链上），15 分钟超时；pending→paid 原子抢占保证只入账一次。
const SystemSettings = require('../models/SystemSettings');
const SaverUsdtOrder = require('../models/SaverUsdtOrder');
const billing = require('./saverBillingService');

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // Tron 主网 USDT
const ORDER_TTL_MS = 15 * 60 * 1000;
// SEC-PAY1：金额预留窗口。48 小时内所有订单（不分状态）的 payAmount 全局唯一，
// 过期订单的金额不会被新订单复用——商户转账晚到也只会匹配回自己的原订单，
// 攻击者无法创建同金额订单冒领；晚到的钱由 tick 自动补入原订单（见下）。
const LATE_MS = 48 * 60 * 60 * 1000;
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

// 收款地址由「云仓中转管理」维护（其 /admin → 设置），面板从云仓接口拉取。
// 60 秒本地缓存；云仓短暂不可达时沿用上次拿到的地址，避免充值中断。
const YUNCANG_URL = (process.env.YUNCANG_URL || 'http://127.0.0.1:5090').replace(/\/+$/, '');
const TRC20_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
let addrCache = { address: '', at: 0 };
async function fetchYuncangAddress() {
  if (Date.now() - addrCache.at < 60000) return addrCache.address;
  try {
    const res = await fetch(`${YUNCANG_URL}/api/usdt/address`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json().catch(() => ({}));
    addrCache = { address: String(data.address || '').trim(), at: Date.now() };
  } catch (err) {
    addrCache.at = Date.now(); // 保留旧地址，60 秒后再试
    console.error('[recharge] 云仓收款地址获取失败:', err.message);
  }
  return addrCache.address;
}

async function getUsdtConfig() {
  const s = await SystemSettings.findOne().select('saverApi').lean();
  const u = s?.saverApi?.usdt || {};
  const address = await fetchYuncangAddress();
  return {
    enabled: !!u.enabled && TRC20_RE.test(address),
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

  // SEC-PAY1：限频——每工作区最多 3 笔待支付订单，且两次创建至少间隔 10 秒，
  // 封死"高频刷订单碰撞金额"的攻击面
  const pendingCount = await SaverUsdtOrder.countDocuments({ workspace: workspaceId, status: 'pending' });
  if (pendingCount >= 3) throw new Error('待支付订单过多，请先完成支付或等待超时后再创建');
  const lastOrder = await SaverUsdtOrder.findOne({ workspace: workspaceId })
    .sort('-createdAt').select('createdAt').lean();
  if (lastOrder && Date.now() - new Date(lastOrder.createdAt).getTime() < 10000) {
    throw new Error('操作过于频繁，请 10 秒后再试');
  }

  let payAmount = 0;
  for (let i = 0; i < 30; i++) {
    const candidate = round2(amount + (Math.floor(Math.random() * 99) + 1) / 100); // 随机 2 位小数尾数
    // SEC-PAY1：对 48 小时内所有订单（含 paid/expired）去重，金额被预留不可复用
    const clash = await SaverUsdtOrder.exists({
      usdtAmount: candidate,
      createdAt: { $gte: new Date(Date.now() - LATE_MS) },
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
let lastSlowPoll = 0;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    // 超时订单标记失败（晚到的钱仍会在 48 小时窗口内自动补入原订单）
    await SaverUsdtOrder.updateMany(
      { status: 'pending', createdAt: { $lt: new Date(Date.now() - ORDER_TTL_MS) } },
      { $set: { status: 'expired' } });

    // SEC-PAY1：候选订单 = 待支付 + 48 小时内已过期未入账（晚到自动补单，
    // 取代已删除的管理员手动补单功能）
    const candidates = await SaverUsdtOrder.find({
      status: { $in: ['pending', 'expired'] },
      createdAt: { $gte: new Date(Date.now() - LATE_MS) },
    }).lean();
    if (!candidates.length) return;
    // 只剩过期订单在守晚到款时降频到 60 秒一查，省 TronGrid 配额
    const hasPending = candidates.some((o) => o.status === 'pending');
    if (!hasPending) {
      if (Date.now() - lastSlowPoll < 60000) return;
      lastSlowPoll = Date.now();
    }
    const cfg = await getUsdtConfig();
    if (!cfg.enabled) return;

    const oldest = Math.min(...candidates.map(o => new Date(o.createdAt).getTime()));
    const transfers = await fetchTransfers(cfg, oldest - 120000);
    for (const tx of transfers) {
      const decimals = Number(tx.token_info?.decimals) || 6;
      const amt = round4(Number(tx.value) / Math.pow(10, decimals));
      if (!amt) continue;
      // SEC-PAY1：只匹配创建时间早于链上交易的订单（原先允许订单晚 60 秒，
      // 给了"看到转账后抢建同金额订单"的冒领窗口）
      const order = candidates.find(o =>
        round4(o.usdtAmount) === amt &&
        tx.block_timestamp >= new Date(o.createdAt).getTime());
      if (!order) continue;
      const used = await SaverUsdtOrder.exists({ externalId: tx.transaction_id });
      if (used) continue;
      const late = order.status === 'expired';
      // 原子抢占，只入账一次；externalId 另有 partial unique 索引兜底并发
      let claimed = null;
      try {
        claimed = await SaverUsdtOrder.findOneAndUpdate(
          { _id: order._id, status: { $in: ['pending', 'expired'] } },
          { $set: { status: 'paid', paidAt: new Date(), externalId: tx.transaction_id, credits: round2(amt * cfg.rate), raw: { amt, rate: cfg.rate, from: tx.from, ...(late ? { late: true } : {}) } } },
          { new: true });
      } catch (e) {
        if (e && e.code === 11000) continue; // 该交易已被并发入账
        throw e;
      }
      if (!claimed) continue;
      await billing.adjust(claimed.workspace, round2(amt * cfg.rate), claimed.by,
        `USDT充值 ${amt}U × ${cfg.rate} = ￥${round2(amt * cfg.rate)}（订单 ${claimed.orderNo}${late ? '，超时后到账自动补单' : ''}）`);
      console.log(`[recharge] order ${claimed.orderNo} paid ${amt} USDT → ￥${round2(amt * cfg.rate)}${late ? ' (late)' : ''}`);
    }
  } catch (err) {
    console.error('[recharge] tick:', err.message);
  } finally {
    ticking = false;
  }
}
setTimeout(() => setInterval(tick, 5000), 10000);

module.exports = { getUsdtConfig, createOrder, fetchYuncangAddress };
