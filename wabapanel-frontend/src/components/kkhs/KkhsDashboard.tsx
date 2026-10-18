'use client';

import Link from 'next/link';

import { MessageSquare, UserX, Send, CheckCircle2, Clock, Megaphone, Upload, Inbox, GitBranch, FileText, Users } from 'lucide-react';

export interface KkhsWidgets {
  unassigned: number;
  windowClosing: number;
  channels: Array<{ key: string; label: string; enabled: boolean; ok: boolean; id: string; unread: number; error?: string }>;
  agents: Array<{ _id: string; name: string; open: number; online: boolean }>;
}

interface Props {
  userName?: string;
  widgets: KkhsWidgets | null | undefined;
  open: number;
  resolved: number;
  today: { sent: number; received: number };
  
  responseTime?: { medianMinutes: number; avgMinutes: number; samples: number };
  hourly?: Array<{ hour: number; count: number }>;
  typeBreakdown?: Array<{ source: string; count: number }>;
  templatesRejected: number;
  dueReminders: number;
  recentCampaign?: { _id: string; name: string; status: string; stats?: { sent?: number; failed?: number } } | null;

}

const QUICK = [
  { l: "创建广播", h: '/client/broadcasts', I: Megaphone, c: 'k-ok' },
  { l: "导入联系人", h: '/client/contacts', I: Upload, c: 'k-info' },
  { l: "打开收件箱", h: '/client/chat', I: Inbox, c: 'k-purple' },
  { l: "新的机器人流程", h: '/client/bot-flows', I: GitBranch, c: 'k-warn' },
  { l: "模板", h: '/client/templates', I: FileText, c: 'k-info' },
  { l: "团队", h: '/client/team', I: Users, c: 'k-ok' },
];

const CHC: Record<string, string> = {
  whatsapp: '#25D366', whatsapp_qr: '#128C7E', instagram: '#E1306C', facebook: '#0866FF',
  telegram: '#0088CC', telegram_personal: '#229ED9', email: '#EA4335', widget: '#6D3BE8',
};
const SRC: Record<string, string> = { manual: 'Agent replies', template: 'Templates', bot_flow: 'Bot flows', campaign: 'Broadcasts', ai_auto_reply: "AI 回复", keyword_auto_reply: 'Keyword replies', api: 'API', schedule: 'Scheduled', welcome: 'Welcome msgs', preset_campaign: 'Preset broadcasts', coexistence_echo: 'Phone app (coexistence)', ai_call: 'AI calls', 'ai-assist': 'AI assist', facebook_sync: 'Facebook', instagram_sync: 'Instagram', instagram_auto_dm: 'IG auto DM', predefined_action: 'Quick actions', drip: 'Drips', followup: 'Follow-ups' };
const CHL: Record<string, string> = {
  whatsapp: 'WhatsApp', whatsapp_qr: 'WhatsApp QR', instagram: 'Instagram', facebook: 'Facebook',
  telegram: 'Telegram', telegram_personal: 'Telegram Personal', email: 'Email', widget: 'Web widget',
};
const INBOX_HREF: Record<string, string> = {
  whatsapp: '/client/chat?channel=whatsapp', whatsapp_qr: '/client/chat?channel=whatsapp_qr', instagram: '/client/chat?channel=instagram',
  facebook: '/client/chat?channel=facebook', telegram: '/client/chat?channel=telegram', telegram_personal: '/client/chat?channel=telegram_personal',
  email: '/client/chat?channel=email',
};

const fmtDur = (min: number) => {
  if (!min || min <= 0) return '—';
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.floor(min)}m ${Math.round((min % 1) * 60)}s`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
};
const n = (v: number) => (v || 0).toLocaleString('zh-CN');
const hLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

export default function KkhsDashboard(p: Props) {
  const w = p.widgets;
  const channels = (w?.channels || []).filter(c => c.enabled || c.unread > 0);
  const agents = w?.agents || [];
  const onlineAgents = agents.filter(a => a.online).length;
  const maxOpen = Math.max(1, ...agents.map(a => a.open));
  const dateStr = new Date().toLocaleDateString('zh-CN', { weekday: 'long', day: 'numeric', month: 'long' });

  type Att = { cls: string; text: string; sub: string; href: string; cta: string };
  const att: Att[] = [];
  if (w && w.windowClosing > 0) att.push({ cls: 'k-warn', text: `${w.windowClosing} 谈话${''} 在 2 小时内关闭 24 小时窗口`, sub: "立即回复或稍后发送模板", href: '/client/chat', cta: "待处理" });
  if (w && w.unassigned > 0) att.push({ cls: 'k-info', text: `${w.unassigned} 开放对话${''} 未分配`, sub: "没有特工正在观看这些", href: '/client/chat', cta: 'Assign' });
  channels.filter(c => c.enabled && !c.ok).forEach(c => att.push({ cls: 'k-bad', text: `${c.label} 已断开连接`, sub: c.error || 'Messages will not flow until reconnected', href: '/client/channels', cta: 'Reconnect' }));
  if (p.templatesRejected > 0) att.push({ cls: 'k-bad', text: `${p.templatesRejected} 模板${''} 被Meta拒绝`, sub: "编辑并重新提交", href: '/client/templates', cta: 'Review' });
  if (p.dueReminders > 0) att.push({ cls: 'k-warn', text: `${p.dueReminders} 后续提醒${''} 今天到期`, sub: "来自联系笔记", href: '/client/contacts', cta: 'View' });
  if (p.recentCampaign && p.recentCampaign.status === 'completed') att.push({ cls: 'k-ok', text: `广播》${p.recentCampaign.name}”完成`, sub: `${n(p.recentCampaign.stats?.sent || 0)} 发送· ${n(p.recentCampaign.stats?.failed || 0)} 失败`, href: `/client/broadcasts`, cta: 'Report' });

  const hourly = Array.from({ length: 24 }, (_, h) => p.hourly?.find(x => x.hour === h)?.count || 0);
  const maxH = Math.max(1, ...hourly);
  const peak = hourly.indexOf(maxH);
  const vol = [...(p.typeBreakdown || [])].sort((a, b) => b.count - a.count).slice(0, 6);
  const volTotal = vol.reduce((s, v) => s + v.count, 0) || 1;

  return (
    <div data-kkhs-dash>
      <div className="kd-ph">
        <div>
          <h1>仪表盘</h1>
          <p>{dateStr} · {onlineAgents} 代理{onlineAgents === 1 ? '' : 's'} 在线· {channels.length} 通道{channels.length === 1 ? '' : 's'} 已连接{p.userName ? ` ·欢迎回来， ${p.userName}` : ''}</p>
        </div>
        <div className="kd-acts">
          <Link href="/client/analytics" className="kd-btn">数据分析</Link>
          <Link href="/client/broadcasts" className="kd-btn kd-bp">新广播</Link>
        </div>
      </div>

      <div className="kd-strip">
        <div className="kd-big">
          <b>{fmtDur(p.responseTime?.medianMinutes || p.responseTime?.avgMinutes || 0)}</b>
          <span>{p.responseTime?.medianMinutes ? "中位数" : "平均"} 第一次回复时间{p.responseTime?.samples ? ` · ${n(p.responseTime.samples)} 回复` : ''}</span>
        </div>
        <div className="kd-kpis">
          {([
            ["待处理", n(p.open), '/client/chat', MessageSquare, 'k-info'],
            ["未分配", n(w?.unassigned || 0), '/client/chat', UserX, 'k-warn'],
            ["今日消息", n((p.today?.sent || 0) + (p.today?.received || 0)), '/client/analytics', Send, 'k-ok'],
            ["已解决", n(p.resolved), '/client/chat', CheckCircle2, 'k-ok'],
            ["会话即将到期", n(w?.windowClosing || 0), '/client/chat', Clock, 'k-bad'],
          ] as const).map(([l, v, h, I, c]) => (
            <Link key={l} href={h} className="kd-kpi"><i className={`kd-chip ${c}`}><I /></i><span>{l}</span><b>{v}</b></Link>
          ))}
        </div>
      </div>

      <div className="kd-g2 kd-g2-qa">
        <section className="kd-panel">
          <header className="kd-ph2"><h3>快速行动</h3><span className="kd-s">最常用</span></header>
          <div className="kd-qa">
            {QUICK.map(q => (
              <Link key={q.h} href={q.h} className="kd-qa-i"><i className={`kd-chip ${q.c}`}><q.I /></i><span>{q.l}</span></Link>
            ))}
          </div>
        </section>
        
      </div>

      <div className="kd-g2">
        <section className="kd-panel">
          <header className="kd-ph2"><h3>需要你的注意</h3><span className="kd-pill k-info">{att.length}</span></header>
          {att.length === 0 ? (
            <div className="kd-empty">一切都清楚了——现在不需要采取任何行动。</div>
          ) : att.map((a, i) => (
            <div key={i} className="kd-row">
              <span className={`kd-dot ${a.cls}`} />
              <div className="kd-grow"><div className="kd-t">{a.text}</div><div className="kd-s">{a.sub}</div></div>
              <Link href={a.href} className="kd-btn kd-bsm">{a.cta}</Link>
            </div>
          ))}
        </section>

        <section className="kd-panel">
          <header className="kd-ph2"><h3>全部 {channels.length} 收件箱{channels.length === 1 ? '' : 'es'}</h3><Link href="/client/channels" className="kd-link">管理</Link></header>
          {channels.length === 0 ? (
            <div className="kd-empty">尚未连接通道。 <Link href="/client/channels" className="kd-link">连接一个</Link></div>
          ) : channels.map(c => (
            <Link key={c.key} href={INBOX_HREF[c.key] || '/client/chat'} className="kd-row kd-hov">
              <span className="kd-ch" style={{ background: CHC[c.key] }} />
              <div className="kd-grow"><div className="kd-t">{c.label}</div><div className="kd-s">{c.id || '—'}</div></div>
              <span className={`kd-pill ${c.ok ? 'k-ok' : c.enabled ? 'k-bad' : 'k-warn'}`}>{c.ok ? "已连接" : c.enabled ? "已断开连接" : "未设置"}</span>
              <span className="kd-unread">{c.unread || 0}</span>
            </Link>
          ))}
        </section>

        <section className="kd-panel">
          <header className="kd-ph2"><h3>代理工作负载</h3><Link href="/client/team" className="kd-link">团队</Link></header>
          {agents.length === 0 ? (
            <div className="kd-empty">还没有代理。 <Link href="/client/team" className="kd-link">添加代理</Link></div>
          ) : agents.map(a => (
            <div key={a._id} className="kd-row">
              <span className={`kd-av ${a.online ? 'on' : ''}`}>{(a.name || '?').slice(0, 1).toUpperCase()}</span>
              <div className="kd-grow">
                <div className="kd-t">{a.name} <span className="kd-s">{a.online ? "·在线" : "·离开"}</span></div>
                <div className="kd-meter"><i style={{ width: `${Math.round((a.open / maxOpen) * 100)}%` }} /></div>
              </div>
              <span className="kd-mono">{a.open} 打开</span>
            </div>
          ))}
        </section>

        <section className="kd-panel">
          <header className="kd-ph2"><h3>按来源划分的最繁忙时间和流量</h3><span className="kd-s">过去 30 天</span></header>
          <div className="kd-hours">
            {hourly.map((c, h) => (
              <i key={h} title={`${hLabel(h)} · ${c}`} className={h === peak && c > 0 ? 'pk' : ''} style={{ height: `${Math.max(4, Math.round((c / maxH) * 100))}%` }} />
            ))}
          </div>
          <div className="kd-hl"><span>上午 12 点</span><span>早上 6 点</span><span>中午12点</span><span>下午 6 点</span><span>晚上 11 点</span></div>
          {maxH > 0 && <div className="kd-s kd-pad">峰值位于 <b className="kd-mono">{hLabel(peak)}</b> · {n(maxH)} 消息</div>}
          {vol.map(v => (
            <div key={v.source} className="kd-row">
              <span className="kd-ch" style={{ background: CHC[v.source] || 'var(--k-ink-3)' }} />
              <div className="kd-grow">
                <div className="kd-t">{SRC[v.source] || CHL[v.source] || v.source}</div>
                <div className="kd-meter"><i style={{ width: `${Math.round((v.count / volTotal) * 100)}%`, background: CHC[v.source] || undefined }} /></div>
              </div>
              <span className="kd-mono">{n(v.count)}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
