'use client';
import { translateDisplay } from '@/lib/zhDisplay';

import Link from 'next/link';

export interface KkhsAdminOpsData {
  needsAction: {

    qrDropped: number;
    failedHour: number;
  };
  health: {
    mongo: { readyState: number; pingMs: number };
    sockets: number;
    meta: { connected: number; total: number; inboundHour: number; outboundHour: number; failedHour: number };
    qr: { enabled: number; connected: number };
    
    aiWorkspaces: number;
    server: { uptimeSec: number; rssMb: number; node: string };
  };
}

interface Props {
  ops?: KkhsAdminOpsData | null;
  totalVendors: number;
  activeVendors: number;

  msgToday: number;
  workspaces: number;

}

type Sev = 'k-bad' | 'k-warn' | 'k-info' | 'k-ok';
const n = (v: number) => (v || 0).toLocaleString('zh-CN');

const dur = (s: number) => (s >= 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m`);

export default function KkhsAdminOps(p: Props) {
  const o = p.ops;
  const na = o?.needsAction;
  const h = o?.health;
  const dateStr = new Date().toLocaleDateString('zh-CN', { weekday: 'long', day: 'numeric', month: 'long' });

  const att: { k: Sev; t: string; s: string; href: string; cta: string }[] = [];
  
  if (na && na.qrDropped > 0) att.push({ k: 'k-warn', t: `${na.qrDropped} WhatsApp QR session${na.qrDropped === 1 ? '' : 's'} disconnected`, s: 'Vendors will stop receiving messages until re-linked', href: '/admin/vendors', cta: 'View' });
  if (na && na.failedHour > 0) att.push({ k: 'k-warn', t: `${n(na.failedHour)} message${na.failedHour === 1 ? '' : 's'} failed in the last hour`, s: '检查商户的 Meta 接口错误', href: '/admin/vendors', cta: 'Review' });

  const mongoOk = h ? h.mongo.readyState === 1 && h.mongo.pingMs >= 0 : false;
  const metaSev: Sev = !h ? 'k-info' : h.meta.total === 0 ? 'k-info' : h.meta.failedHour > 0 && h.meta.failedHour * 5 > h.meta.outboundHour ? 'k-warn' : 'k-ok';
  const qrSev: Sev = !h ? 'k-info' : h.qr.enabled === 0 ? 'k-info' : h.qr.connected < h.qr.enabled ? 'k-warn' : 'k-ok';
  const rows: { name: string; sub: string; k: Sev; status: string; m: string }[] = [
    { name: 'Meta Graph API', sub: "云API + webhooks", k: metaSev, status: !h || h.meta.total === 0 ? "未配置号码" : h.meta.failedHour > 0 && metaSev === 'k-warn' ? `${n(h.meta.failedHour)} failed / hr` : "正常运行", m: h ? `${n(h.meta.connected)}/${n(h.meta.total)} nums` : '—' },
    { name: "WhatsApp 二维码会话", sub: "非官方WhatsApp", k: qrSev, status: !h || h.qr.enabled === 0 ? "未使用" : h.qr.connected < h.qr.enabled ? `${h.qr.enabled - h.qr.connected} dropped` : "正常运行", m: h ? `${n(h.qr.connected)}/${n(h.qr.enabled)}` : '—' },
    { name: 'MongoDB', sub: "主数据库", k: mongoOk ? 'k-ok' : 'k-bad', status: mongoOk ? "正常运行" : "异常", m: h && h.mongo.pingMs >= 0 ? `${h.mongo.pingMs} ms` : '—' },
    { name: 'Socket.io', sub: "实时收件箱", k: h ? 'k-ok' : 'k-info', status: "正常运行", m: h ? `${n(h.sockets)} live` : '—' },
    { name: "AI 回复", sub: "商户AI代理", k: 'k-ok', status: h && h.aiWorkspaces > 0 ? "正常运行" : "空闲", m: h ? `${n(h.aiWorkspaces)} ws` : '—' },
    { name: "应用服务器", sub: h ? `Node ${h.server.node}` : 'Node', k: 'k-ok', status: h ? `Up ${dur(h.server.uptimeSec)}` : '—', m: h ? `${h.server.rssMb} MB` : '—' },
  ];

  if (!h) {
    for (const row of rows) { row.k = 'k-info'; row.status = '暂无状态数据'; }
  }

  return (
    <div data-kkhs-dash>
      <div className="kd-ph">
        <div><h1>仪表盘</h1><p>所有商户 · {dateStr}</p></div>
        <div className="kd-acts"><Link href="/admin/vendors" className="kd-btn kd-bp">管理商户</Link></div>
      </div>
      <div className="kd-strip"><div className="kd-kpis">
        {[
          ["活跃商户", `${n(p.activeVendors)} / ${n(p.totalVendors)}`],
          ["今日消息", n(p.msgToday)],
          ["工作区", n(p.workspaces)],
        ].map(([label, value]) => <Link key={label} href="/admin/vendors" className="kd-kpi"><span>{label}</span><b>{value}</b></Link>)}
      </div></div>
      <div className="kd-g2">
        <section className="kd-panel">
          <header className="kd-ph2"><h3>需要采取行动</h3><span className="kd-pill k-info">{att.length}</span></header>
          {att.length === 0 ? <div className="kd-empty">暂无待处理事项</div> : att.map((a, i) => (
            <div key={i} className="kd-row"><span className={`kd-dot ${a.k}`} /><div className="kd-grow"><div className="kd-t">{a.t}</div><div className="kd-s">{a.s}</div></div><Link href={a.href} className="kd-btn kd-bsm">{a.cta}</Link></div>
          ))}
        </section>
        <section className="kd-panel">
          <header className="kd-ph2"><h3>服务健康</h3><Link href="/admin/settings" className="kd-link">设置</Link></header>
          {rows.map(r => <div key={r.name} className="kd-row"><div className="kd-grow"><div className="kd-t">{r.name}</div><div className="kd-s">{r.sub}</div></div><span className={`kd-pill ${r.k}`}>{translateDisplay(r.status)}</span><span className="kd-mono kd-hm">{r.m}</span></div>)}
        </section>
      </div>
    </div>
  );
}
