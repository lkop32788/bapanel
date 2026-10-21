// 真实手机号段提示：基于 Google libphonenumber 规则库（libphonenumber-js/mobile，离线）推算
// 某国家有效的手机号前缀。做法：枚举 2 位前缀（必要时细化到 3 位），用几组填充补成完整号码，
// 能解析为有效 MOBILE / FIXED_LINE_OR_MOBILE 号码的前缀即视为真实号段。
import { parsePhoneNumberFromString, getExampleNumber, type CountryCode } from 'libphonenumber-js/mobile';
import examples from 'libphonenumber-js/mobile/examples';

export interface PrefixHint { prefix: string; example: string }
export interface MobilePrefixHints { exampleLen: number; example: string; prefixes: PrefixHint[] }

// 该国手机号本地位数（不含国家码），取规则库示例号长度；未知返回 0。用于选国家后自动填「号码位数」
export function getMobileExampleLen(code: string): number {
  try {
    const ex = getExampleNumber(code as CountryCode, examples);
    return ex ? String(ex.nationalNumber).length : 0;
  } catch { return 0; }
}

const MAX_HINTS = 200;
const FILLERS = ['0', '5', '1', '7'];
const CYCLE = '1234567890';
const cache = new Map<string, MobilePrefixHints>();

const candidates = (prefix: string, len: number): string[] => {
  const n = len - prefix.length;
  if (n < 0) return [];
  const out = FILLERS.map(f => prefix + f.repeat(n));
  out.push(prefix + CYCLE.repeat(Math.ceil(n / CYCLE.length)).slice(0, n));
  return out;
};

const firstValidExample = (dial: string, prefix: string, lens: number[]): string | null => {
  for (const len of lens) {
    for (const cand of candidates(prefix, len)) {
      const pn = parsePhoneNumberFromString('+' + dial + cand);
      if (!pn || !pn.isValid()) continue;
      const type = pn.getType();
      if (type === 'MOBILE' || type === 'FIXED_LINE_OR_MOBILE') return pn.formatInternational();
    }
  }
  return null;
};

export function getMobilePrefixHints(code: string, dial: string): MobilePrefixHints {
  const key = `${code}|${dial}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const empty: MobilePrefixHints = { exampleLen: 0, example: '', prefixes: [] };
  if (!/^[A-Z]{2}$/.test(code) || !/^\d{1,4}$/.test(dial)) return empty;

  let exampleLen = 0;
  let example = '';
  try {
    const ex = getExampleNumber(code as CountryCode, examples);
    if (ex) {
      exampleLen = String(ex.nationalNumber).length;
      example = ex.formatInternational();
    }
  } catch { /* 该国家无示例数据 */ }

  // 同一国家手机号位数可能不止一种（如马来西亚 01x 为 9 位、011 为 10 位），示例位数 ±1 一起试
  const lens = exampleLen ? [exampleLen, exampleLen + 1, exampleLen - 1].filter(n => n >= 6) : [8, 9, 10];
  const prefixes: PrefixHint[] = [];
  for (let p = 10; p <= 99 && prefixes.length < MAX_HINTS; p++) {
    const two = String(p);
    const ex2 = firstValidExample(dial, two, lens);
    if (ex2) { prefixes.push({ prefix: two, example: ex2 }); continue; }
    for (let d = 0; d <= 9 && prefixes.length < MAX_HINTS; d++) {
      const three = two + d;
      const ex3 = firstValidExample(dial, three, lens);
      if (ex3) prefixes.push({ prefix: three, example: ex3 });
    }
  }
  const result: MobilePrefixHints = { exampleLen, example, prefixes };
  cache.set(key, result);
  return result;
}
