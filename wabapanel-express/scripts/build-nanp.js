#!/usr/bin/env node
// 一次性脚本：把 libphonenumber 地理编码表（resources/geocoding/en/1.txt）转成 区号 → 州/省 表。
// 用法：node scripts/build-nanp.js   → 写出 src/data/nanp-areacodes.json  { US: { 州: [区号…] }, CA: { 省: [区号…] } }
// 规则：4 位条目（1XXX|名字）直接定区号归属；名字是 "City, ST" 取州缩写；没有 4 位条目的区号用更长前缀条目投票；都不行归「其他」。
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../src/data/nanp-geocoding-1.txt');
const OUT = path.join(__dirname, '../src/data/nanp-areacodes.json');

const US_ABBR = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};
const CA_ABBR = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island',
  QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};
const ALIAS = { 'Washington State': 'Washington', 'Washington D.C.': 'District of Columbia', 'British Colombia': 'British Columbia' };
const CA_COMBINED = ['Northwest Territories/Nunavut/Yukon', 'Nova Scotia/Prince Edward Island'];
const US_NAMES = new Set(Object.values(US_ABBR));
const CA_NAMES = new Set(Object.values(CA_ABBR));

function classify(raw) {
  const name = (ALIAS[raw] || raw).trim();
  const m = name.match(/,\s*([A-Z]{2})$/);
  if (m) {
    if (US_ABBR[m[1]]) return ['US', US_ABBR[m[1]]];
    if (CA_ABBR[m[1]]) return ['CA', CA_ABBR[m[1]]];
    return null;
  }
  if (US_NAMES.has(name)) return ['US', name];
  if (CA_NAMES.has(name) || CA_COMBINED.includes(name)) return ['CA', name];
  return null;
}

const level = {};
const votes = {};
for (const line of fs.readFileSync(SRC, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const [pfx, name] = t.split('|');
  if (!/^1\d{3,}$/.test(pfx) || !name) continue;
  const ac = pfx.slice(1, 4);
  const c = classify(name);
  if (pfx.length === 4) level[ac] = c || 'unknown';
  else if (c) {
    votes[ac] = votes[ac] || {};
    const k = c.join('|');
    votes[ac][k] = (votes[ac][k] || 0) + 1;
  }
}

const out = { US: {}, CA: {} };
let other = 0;
for (const ac of [...new Set([...Object.keys(level), ...Object.keys(votes)])].sort()) {
  let c = level[ac];
  if (!c || c === 'unknown') {
    const v = votes[ac];
    if (v) c = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0].split('|');
  }
  if (!c || c === 'unknown') { c = ['US', '其他']; other++; }
  (out[c[0]][c[1]] = out[c[0]][c[1]] || []).push(ac);
}
for (const cc of ['US', 'CA']) {
  out[cc] = Object.fromEntries(Object.entries(out[cc]).sort((a, b) => a[0].localeCompare(b[0])));
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const cnt = (o) => Object.values(o).reduce((s, a) => s + a.length, 0);
console.log(`written ${OUT}: US ${Object.keys(out.US).length} states / ${cnt(out.US)} area codes, CA ${Object.keys(out.CA).length} provinces / ${cnt(out.CA)} area codes, 其他 ${other}`);
