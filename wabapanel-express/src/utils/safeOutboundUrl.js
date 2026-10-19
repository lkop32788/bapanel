// SEC-SSRF（2026-10-19）：用户可配 URL 的服务端外发请求统一走这里校验——
// 只允许 http/https，且解析出的所有 IP 不得是回环/内网/链路本地/CGNAT 段，
// 防止经 bot-flows webhook、AI 自定义工具、模板头图等打到 127.0.0.1:5000、
// 宝塔面板、MongoDB、云元数据 169.254.169.254 等内网资源。
// 已知残差：DNS 解析与实际连接之间的 rebinding TOCTOU（需 pinned agent 才能根除）。
const dns = require('dns').promises;
const net = require('net');

const isPrivateIp = (ip) => {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
    return v === '::' || v === '::1' || v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd');
  }
  const p = ip.split('.').map(Number);
  return p[0] === 0 || p[0] === 10 || p[0] === 127
    || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
    || (p[0] === 192 && p[1] === 168)
    || (p[0] === 169 && p[1] === 254)
    || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
};

module.exports = async function assertSafeOutboundUrl(raw, label = '外发 URL') {
  let u;
  try { u = new URL(String(raw || '')); } catch { throw new Error(`${label}无效`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`${label}只允许 http/https`);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error(`${label}禁止指向内网`);
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error(`${label}禁止指向内网地址`);
    return u;
  }
  const addrs = await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error(`${label}域名无法解析`);
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new Error(`${label}禁止解析到内网地址`);
  }
  return u;
};
