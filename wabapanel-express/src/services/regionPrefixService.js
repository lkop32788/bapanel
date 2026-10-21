// 号码生成「按州/省」：各国地区 → 手机号段前缀。
// 只有手机号按地区分配的国家才支持：中国（号段库精确到省/市/运营商）、美国/加拿大（区号 → 州/省）、巴西（DDD → 州）。
// 中国数据 src/data/phone.dat（xluohome/phonedata，49 万条七位号段）首次请求时懒加载到内存；
// 美加数据 src/data/nanp-areacodes.json 由 scripts/build-nanp.js 从 libphonenumber 地理编码表生成。
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

// ---------- 中国 ----------
// phone.dat：头 4 字节版本 + 4 字节 LE 索引区偏移；记录区 "省|市|邮编|区号\0"；索引区每条 9 字节：int32 七位号段、int32 记录偏移、uint8 运营商
const ISP_OF = { 1: '移动', 6: '移动', 2: '联通', 5: '联通', 3: '电信', 4: '电信', 7: '广电', 8: '广电' };
const CN_ISPS = ['移动', '联通', '电信', '广电'];
let cnData = null;

function loadCN() {
  if (cnData) return cnData;
  const b = fs.readFileSync(path.join(DATA_DIR, 'phone.dat'));
  const idx = b.readUInt32LE(4);
  const n = Math.floor((b.length - idx) / 9);
  const recCache = new Map();
  const provinces = new Map(); // 省 → Map<市, [{prefix, isp}]>
  for (let i = 0; i < n; i++) {
    const o = idx + i * 9;
    const prefix = b.readInt32LE(o);
    const ro = b.readInt32LE(o + 4);
    const t = b.readUInt8(o + 8);
    let rec = recCache.get(ro);
    if (!rec) {
      const end = b.indexOf(0, ro);
      const parts = b.toString('utf8', ro, end === -1 ? b.length : end).split('|');
      rec = [parts[0] || '', parts[1] || ''];
      recCache.set(ro, rec);
    }
    const [prov, city] = rec;
    if (!prov) continue;
    let cities = provinces.get(prov);
    if (!cities) { cities = new Map(); provinces.set(prov, cities); }
    let arr = cities.get(city);
    if (!arr) { arr = []; cities.set(city, arr); }
    arr.push({ prefix: String(prefix), isp: ISP_OF[t] || '其他' });
  }
  cnData = { provinces, total: n };
  return cnData;
}

// 数据里省市名不带后缀（广东/深圳），前端传「广东省」「深圳市」也要能匹配
const normCN = (s) => String(s || '').trim()
  .replace(/(壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/, '');

const zhSort = (a, b) => a.localeCompare(b, 'zh-Hans-CN');

function findCN(region, city) {
  const { provinces } = loadCN();
  const r = normCN(region);
  let cities = null;
  for (const [prov, m] of provinces) {
    if (normCN(prov) === r) { cities = m; break; }
  }
  if (!cities) return null;
  if (!city) return [...cities.values()].flat();
  const c = normCN(city);
  for (const [name, arr] of cities) {
    if (normCN(name) === c) return arr;
  }
  return null;
}

// ---------- 美国 / 加拿大 ----------
let nanpData = null;
const loadNANP = () => {
  if (!nanpData) nanpData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nanp-areacodes.json'), 'utf8'));
  return nanpData;
};

// ---------- 巴西：DDD → 州 ----------
const BR_STATES = [
  ['São Paulo (SP)', [11, 12, 13, 14, 15, 16, 17, 18, 19]],
  ['Rio de Janeiro (RJ)', [21, 22, 24]],
  ['Espírito Santo (ES)', [27, 28]],
  ['Minas Gerais (MG)', [31, 32, 33, 34, 35, 37, 38]],
  ['Paraná (PR)', [41, 42, 43, 44, 45, 46]],
  ['Santa Catarina (SC)', [47, 48, 49]],
  ['Rio Grande do Sul (RS)', [51, 53, 54, 55]],
  ['Distrito Federal (DF)', [61]],
  ['Goiás (GO)', [62, 64]],
  ['Tocantins (TO)', [63]],
  ['Mato Grosso (MT)', [65, 66]],
  ['Mato Grosso do Sul (MS)', [67]],
  ['Acre (AC)', [68]],
  ['Rondônia (RO)', [69]],
  ['Bahia (BA)', [71, 73, 74, 75, 77]],
  ['Sergipe (SE)', [79]],
  ['Pernambuco (PE)', [81, 87]],
  ['Alagoas (AL)', [82]],
  ['Paraíba (PB)', [83]],
  ['Rio Grande do Norte (RN)', [84]],
  ['Ceará (CE)', [85, 88]],
  ['Piauí (PI)', [86, 89]],
  ['Pará (PA)', [91, 93, 94]],
  ['Amazonas (AM)', [92, 97]],
  ['Roraima (RR)', [95]],
  ['Amapá (AP)', [96]],
  ['Maranhão (MA)', [98, 99]],
];

// ---------- 对外 ----------
const SUPPORTED = ['CN', 'US', 'CA', 'BR'];

function getRegions(country) {
  switch (country) {
    case 'CN': {
      const { provinces } = loadCN();
      const regions = [...provinces.entries()]
        .map(([name, cities]) => ({ name, cities: [...cities.keys()].filter(Boolean).sort(zhSort) }))
        .sort((a, b) => zhSort(a.name, b.name));
      return { supported: true, localLen: 11, hasCity: true, hasIsp: true, isps: CN_ISPS, regions };
    }
    case 'US':
    case 'CA': {
      const data = loadNANP()[country] || {};
      return { supported: true, localLen: 10, hasCity: false, hasIsp: false, regions: Object.keys(data).map(name => ({ name })) };
    }
    case 'BR':
      return { supported: true, localLen: 11, hasCity: false, hasIsp: false, regions: BR_STATES.map(([name]) => ({ name })) };
    default:
      return { supported: false };
  }
}

function resolvePrefixes(country, { region, city, isp } = {}) {
  switch (country) {
    case 'CN': {
      const arr = findCN(region, city);
      if (!arr) return [];
      const want = String(isp || '').trim();
      const out = want ? arr.filter(x => x.isp === want).map(x => x.prefix) : arr.map(x => x.prefix);
      return [...new Set(out)].sort();
    }
    case 'US':
    case 'CA': {
      const data = loadNANP()[country] || {};
      return [...(data[String(region || '').trim()] || [])];
    }
    case 'BR': {
      const st = BR_STATES.find(([name]) => name === String(region || '').trim());
      return st ? st[1].map(d => `${d}9`) : [];
    }
    default:
      return [];
  }
}

// 把地区解析出的前缀按开头分组供商户挑选：七位号段按前 3 位分组、组内按前 4 位分子组；
// 短前缀（区号/DDD）每个自成一组
function groupPrefixes(prefixes) {
  if (!prefixes.length) return { prefixLen: 0, groups: [] };
  const prefixLen = prefixes[0].length;
  if (prefixLen <= 4) {
    return { prefixLen, groups: [...prefixes].sort().map(p => ({ key: p, count: 1 })) };
  }
  // 范围不大时把每个 4 位子组下的具体七位号段也带上，前端可勾选到具体号段（整省几万个就只给分组）
  const withItems = prefixes.length <= 5000;
  const top = new Map();
  for (const p of prefixes) {
    const k3 = p.slice(0, 3), k4 = p.slice(0, 4);
    let g = top.get(k3);
    if (!g) { g = { count: 0, sub: new Map() }; top.set(k3, g); }
    g.count++;
    let s = g.sub.get(k4);
    if (!s) { s = { count: 0, items: [] }; g.sub.set(k4, s); }
    s.count++;
    if (withItems) s.items.push(p);
  }
  const byKey = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);
  const groups = [...top.entries()].sort(byKey).map(([key, g]) => ({
    key, count: g.count,
    sub: [...g.sub.entries()].sort(byKey).map(([k, s]) => ({
      key: k, count: s.count, ...(withItems ? { items: s.items.sort() } : {}),
    })),
  }));
  return { prefixLen, groups };
}

// 按商户选中的开头（任意长度，如 '134' 或 '1381'）过滤前缀；selected 为空则原样返回
function filterBySelected(prefixes, selected) {
  const keys = (Array.isArray(selected) ? selected : [])
    .map(s => String(s || '').trim()).filter(s => /^\d{1,12}$/.test(s)).slice(0, 1000);
  if (!keys.length) return prefixes;
  const buckets = new Map();
  for (const k of keys) {
    if (!buckets.has(k.length)) buckets.set(k.length, new Set());
    buckets.get(k.length).add(k);
  }
  const lens = [...buckets.keys()];
  return prefixes.filter(p => lens.some(len => buckets.get(len).has(p.slice(0, len))));
}

module.exports = { SUPPORTED, getRegions, resolvePrefixes, groupPrefixes, filterBySelected };
