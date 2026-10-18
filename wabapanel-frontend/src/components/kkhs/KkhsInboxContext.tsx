'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api, { contactApi, noteApi } from '@/lib/api';

type Btn = (e: React.MouseEvent<HTMLButtonElement>) => void;

export interface KkhsInboxContextProps {
  contactId: string;
  name: string;
  subtitle: string;
  channel: string;
  avatar: React.ReactNode;
  tags: { _id: string; name: string; color?: string }[];
  
  agentName: string;
  onAssign: Btn;
  onLabels: Btn;
  
  onNotes: () => void;

  onAiCall: () => void;
  aiCalling: boolean;
  onClose?: () => void;
}

interface Note { _id: string; text: string; remindAt?: string; contacted?: boolean; createdAt: string; }

interface ContactDetail { name?: string; email?: string; source?: string; sourceDetail?: string; language?: string; optInStatus?: boolean; createdAt?: string; lastMessageAt?: string;  customFields?: Record<string, unknown>;  }

const TABS = ['Info', 'Notes'] as const;
type Tab = typeof TABS[number];

const fmtD = (iso?: string) => iso ? new Date(iso).toLocaleDateString('zh-CN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDT = (iso?: string) => iso ? new Date(iso).toLocaleString('zh-CN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual', import: 'Import', whatsapp: 'WhatsApp', whatsapp_qr: "WhatsApp 二维码", form: 'Form', facebook_lead: "FB 潜在客户表格",
  api: 'API', facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram', email: 'Email', catalog: 'Catalog', ctwa: "CTWA 广告",
  ctwa_facebook: "CTWA（脸书）", ctwa_instagram: "CTWA（Instagram）", website: 'Website', qr: "二维码",
};

const I = {
  phone: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>,
  receipt: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>,
  card: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>,
  note: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v12l-4 4H4z" /><path d="M20 16h-4v4M8 9h8M8 13h5" /></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" /></svg>,
};

export default function KkhsInboxContext(p: KkhsInboxContextProps) {
  const [tab, setTab] = useState<Tab>('Info');
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);

  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  const cid = p.contactId;

  const loadNotes = React.useCallback(() => {
    if (!cid) return;
    noteApi.list(cid).then(r => setNotes(r.data.data || [])).catch(() => setNotes([]));
  }, [cid]);

  useEffect(() => {
    setTab('Info'); setDetail(null); setNotes([]); setNoteText('');
    if (!cid) return;
    let alive = true;
    contactApi.get(cid).then(r => { if (alive) setDetail(r.data.data || null); }).catch(() => {});
    noteApi.list(cid).then(r => { if (alive) setNotes(r.data.data || []); }).catch(() => {});

    return () => { alive = false; };
  }, [cid]);

  const saveNote = async () => {
    if (!cid || !noteText.trim() || saving) return;
    setSaving(true);
    try {
      await noteApi.create({ contact: cid, text: noteText.trim() });
      setNoteText('');
      loadNotes();
    } catch { /* toast handled by api layer */ }
    setSaving(false);
  };

  const reminders = notes.filter(n => n.remindAt && !n.contacted);

  return (
    <aside className="kx" data-kkhs-ctx>
      <div className="kx-tabs">
        {TABS.map(t => (
          <button key={t} type="button" className={`kx-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
            {t}{t === 'Notes' && notes.length ? ` ${notes.length}` : ''}
          </button>
        ))}
        {p.onClose && <button type="button" className="kx-tab kx-close" onClick={p.onClose} title={"隐藏面板"}>×</button>}
      </div>

      <div className="kx-prof">
        <div className="kx-av">{p.avatar}<span className={`k-ch k-ch--${p.channel}`} /></div>
        <b>{p.name}</b>
        <span className="kx-num">{p.subtitle}</span>
      </div>

      {tab === 'Info' && (
        <>
          <section className="kx-s">
            <p>快速行动</p>
            <div className="kx-quick">
              <button type="button" onClick={p.onAiCall} disabled={p.aiCalling}>{I.phone}人工智能通话</button>

              <button type="button" onClick={p.onNotes}>{I.note}注释</button>
              <button type="button" onClick={p.onAssign}>{I.user}{p.agentName ? "重新分配" : "分配"}</button>
            </div>
          </section>

          <section className="kx-s">
            <p>提醒 <button type="button" onClick={p.onNotes}>+ 添加</button></p>
            {reminders.length === 0 && <span className="kx-empty">没有待处理的提醒</span>}
            {reminders.slice(0, 2).map(r => (
              <div key={r._id} className="kx-rem">{r.text}<span className="kx-when">到期 {fmtDT(r.remindAt)}</span></div>
            ))}
          </section>

          <section className="kx-s">
            <p>标签 <button type="button" onClick={p.onLabels}>+ 添加</button></p>
            <div className="kx-tags">
              {p.tags.length === 0 && <span className="kx-empty">没有标签</span>}
              {p.tags.map(t => (
                <span key={t._id} className="kx-pill" style={{ background: (t.color || '#10b981') + '22', color: t.color || '#047857' }}>{t.name}</span>
              ))}
            </div>
          </section>

          <section className="kx-s">
            <p>详细信息</p>
            <div className="kx-kv"><span>第一次看到</span><b>{fmtD(detail?.createdAt)}</b></div>
            <div className="kx-kv"><span>来源</span><b>{detail?.source ? (SOURCE_LABEL[detail.source] || detail.source) : '—'}</b></div>
            {detail?.language && <div className="kx-kv"><span>语言</span><b>{detail.language}</b></div>}
            {detail?.email && <div className="kx-kv"><span>邮箱</span><b className="trunc">{detail.email}</b></div>}
            <div className="kx-kv"><span>选择加入</span><b>{detail ? (detail.optInStatus === false ? "否" : "是的") : '—'}</b></div>
            <div className="kx-kv"><span>最后一条消息</span><b>{fmtDT(detail?.lastMessageAt) || '—'}</b></div>
            {cid && <Link href={`/client/contacts?search=${encodeURIComponent(p.subtitle || p.name)}`} className="kx-link">在通讯录中打开 →</Link>}
          </section>

          <section className="kx-s last">
            <p>内部注释</p>
            <textarea className="kx-inp" rows={2} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder={"只有您的团队才能看到此内容"} />
            <button type="button" className="kx-btn" onClick={saveNote} disabled={!noteText.trim() || saving}>{saving ? "正在保存..." : "保存备注"}</button>
          </section>
        </>
      )}

      {tab === 'Notes' && (
        <section className="kx-s last">
          <p>注释和提醒 <button type="button" onClick={p.onNotes}>管理</button></p>
          {notes.length === 0 && <span className="kx-empty">还没有注释</span>}
          {notes.map(n => (
            <div key={n._id} className="kx-rem">{n.text}<span className="kx-when">{fmtDT(n.createdAt)}{n.remindAt ? ` · ⏰ ${fmtDT(n.remindAt)}${n.contacted ? ' (done)' : ''}` : ''}</span></div>
          ))}
        </section>
      )}

    </aside>
  );
}
