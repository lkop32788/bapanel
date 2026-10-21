// 号码生成：按批次参数确定性生成号码（同一批次任何时候重新生成结果一致）
// 号码 = 国家区号 + 前缀 + 后缀（后缀零填充到 localLen - prefix.length 位），不带 +

const capacityOf = (prefixes, localLen) =>
  prefixes.reduce((sum, p) => sum + Math.pow(10, localLen - p.length), 0);

// 确定性伪随机（32 位种子）
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

function* generate(batch) {
  const { prefixes, localLen, mode, count, seed } = batch;
  const dial = batch.country?.dial || '';
  const caps = prefixes.map(p => Math.pow(10, localLen - p.length));
  const widths = prefixes.map(p => localLen - p.length);
  const fmt = (i, suffix) => dial + prefixes[i] + String(suffix).padStart(widths[i], '0');
  let produced = 0;

  if (mode === 'sequential') {
    const counters = prefixes.map(() => 0);
    let exhausted = 0;
    const done = prefixes.map(() => false);
    while (produced < count && exhausted < prefixes.length) {
      for (let i = 0; i < prefixes.length && produced < count; i++) {
        if (done[i]) continue;
        if (counters[i] >= caps[i]) { done[i] = true; exhausted++; continue; }
        yield fmt(i, counters[i]++);
        produced++;
      }
    }
    return;
  }

  const rand = mulberry32(seed);
  const total = caps.reduce((a, b) => a + b, 0);
  const seen = new Set();
  while (produced < count) {
    // 按容量加权选前缀
    let r = rand() * total;
    let i = 0;
    while (i < caps.length - 1 && r >= caps[i]) { r -= caps[i]; i++; }
    const suffix = Math.floor(rand() * caps[i]);
    const key = i + ':' + suffix;
    if (seen.has(key)) continue;
    seen.add(key);
    yield fmt(i, suffix);
    produced++;
  }
}

const preview = (batch, n) => {
  const out = [];
  for (const v of generate(batch)) {
    out.push(v);
    if (out.length >= n) break;
  }
  return out;
};

module.exports = { capacityOf, generate, preview };
