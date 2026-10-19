// SEC-PUB（2026-10-19）：简易内存限频，公开端点兜底用（主力限流仍建议 nginx 层）。
// 用法：if (!rateLimit(`form:${id}:${ip}`, 10, 60000)) return 429
const buckets = new Map();

module.exports = (key, max, windowMs) => {
  const now = Date.now();
  let arr = buckets.get(key);
  if (!arr) { arr = []; buckets.set(key, arr); }
  while (arr.length && now - arr[0] > windowMs) arr.shift();
  if (arr.length >= max) return false;
  arr.push(now);
  if (buckets.size > 50000) buckets.clear(); // 防内存膨胀（极端刷 key 时整体重置）
  return true;
};
