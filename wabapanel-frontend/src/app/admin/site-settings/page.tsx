/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import React, { useState, useEffect } from 'react';
import { Globe, Save, Palette, Plus, Eye } from 'lucide-react';
import ImageUploadInput from '@/components/ui/ImageUploadInput';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const PRESET_COLORS = ['#059669','#2563eb','#7c3aed','#db2777','#ea580c','#0f766e','#166534','#111827','#dc2626','#f59e0b'];
const FONTS = [{l:"Inter（默认）",v:'Inter'},{l:'Poppins',v:'Poppins'},{l:'Roboto',v:'Roboto'},{l:'Montserrat',v:'Montserrat'},{l:'Nunito',v:'Nunito'},{l:'Lato',v:'Lato'},{l:'Open Sans',v:'Open Sans'}];

interface TabProps { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; }
const Tab = ({ active, onClick, icon, label }: TabProps) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${active ? 'bg-violet-50 text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
    {icon}{label}
  </button>
);
const Field = ({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) => (
  <div><label className="text-sm font-medium text-gray-700">{label}</label>{desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}<div className="mt-1">{children}</div></div>
);
const ic = "w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none transition-all";
const tc = ic + " resize-none";
const bc = "flex items-center gap-2 px-5 py-2.5 bg-linear-to-r from-violet-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-violet-700 hover:to-purple-700 disabled:opacity-50 transition-all";

const prettyLabel = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

function ContentEditor({ value, onChange, path = '' }: { value: any; onChange: (v: any) => void; path?: string }) {
  if (typeof value === 'string') {
    const isImg = /image|photo|logo|icon$/i.test(path.split('.').pop() || '');
    if (value.length > 80 || /desc|content|subtitle|answer|intro/i.test(path)) {
      return <textarea rows={Math.min(6, Math.max(2, Math.ceil(value.length / 90)))} value={value} onChange={e => onChange(e.target.value)} className={tc} />;
    }
    return isImg
      ? <ImageUploadInput label="" value={value} onChange={onChange} folder="content" />
      : <input type="text" value={value} onChange={e => onChange(e.target.value)} className={ic} autoComplete="off" />;
  }
  if (Array.isArray(value)) {
    return (
      <div className="space-y-3">
        {value.map((item, i) => (
          <div key={i} className="p-3 border border-gray-200 rounded-xl bg-white space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">项目 {i + 1}</span>
              <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">删除</button>
            </div>
            <ContentEditor value={item} onChange={v => { const n = [...value]; n[i] = v; onChange(n); }} path={path} />
          </div>
        ))}
        <button onClick={() => {
          const tpl = value.length ? JSON.parse(JSON.stringify(value[value.length - 1])) : '';
          const blank = (x: any): any => typeof x === 'string' ? '' : Array.isArray(x) ? [] : typeof x === 'object' && x ? Object.fromEntries(Object.keys(x).map(k => [k, blank(x[k])])) : x;
          onChange([...value, blank(tpl)]);
        }} className="flex items-center gap-1 px-3 py-1.5 border border-dashed border-violet-300 text-violet-600 rounded-lg text-xs font-medium hover:bg-violet-50"><Plus className="w-3 h-3" /> 添加项目</button>
      </div>
    );
  }
  if (value && typeof value === 'object') {
    return (
      <div className="space-y-4">
        {Object.keys(value).map(k => (
          <div key={k}>
            <label className="text-sm font-medium text-gray-700">{prettyLabel(k)}</label>
            <div className="mt-1"><ContentEditor value={value[k]} onChange={v => onChange({ ...value, [k]: v })} path={path ? path + '.' + k : k} /></div>
          </div>
        ))}
      </div>
    );
  }
  return <input type="text" value={String(value ?? '')} onChange={e => onChange(e.target.value)} className={ic} autoComplete="off" />;
}

const CONTENT_SECTIONS: { key: string; label: string }[] = [
  { key: 'nav', label: "导航栏" },
  { key: 'home', label: "主页" },
  { key: 'footer', label: "页脚文本" },
  { key: 'about', label: "关于页面" },
  { key: 'team', label: "团队页面" },
  { key: 'contact', label: "联系页面" },
  { key: 'featuresPage', label: "特征页" },
  { key: 'privacy', label: "隐私政策" },
  { key: 'terms', label: "服务条款" },
];

const editableContent = (value: any) => Object.fromEntries(CONTENT_SECTIONS
  .filter(section => value && Object.prototype.hasOwnProperty.call(value, section.key))
  .map(section => [section.key, value[section.key]]));

export default function SiteSettingsPage() {
  const [tab, setTab] = useState('business');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [settings, setSettings] = useState<any>({});
  const [content, setContent] = useState<any>(null);
  const [contentSection, setContentSection] = useState('home');
  const [codeMode, setCodeMode] = useState(false);
  const [codeText, setCodeText] = useState('');
  const [themes, setThemes] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API}/public/site-themes`).then(r => r.json()).then(d => { if (d.success) setThemes(d.data || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers: any = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API}/admin/settings?t=${Date.now()}`, { headers, cache: 'no-store' }).then(r => r.json()),
      fetch(`${API}/admin/site-content?t=${Date.now()}`, { headers, cache: 'no-store' }).then(r => r.json()),
    ]).then(([sRes, cRes]) => {
      if (cRes.success && cRes.data) setContent(cRes.data);
      if (sRes.success && sRes.data) {
        // Flatten the section-based response into a flat settings object
        const d = sRes.data;
        setSettings({
          appName: d.general?.appName || '',
          appEmail: d.general?.appEmail || '',
          appDescription: d.general?.appDescription || '',
          appUrl: d.general?.appUrl || '',
          tagline: d.branding?.tagline || '',
          logo: d.branding?.logo || '',
          logoDark: d.branding?.logoDark || '',
          favicon: d.branding?.favicon || '',
          loginBg: d.branding?.loginBg || '',
          loginHeadline: d.branding?.loginHeadline || '',
          loginSubtext: d.branding?.loginSubtext || '',
          appIcon: d.branding?.appIcon || '',
          googleAllowSignup: d.google?.allowSignup !== false,
          primaryColor: d.general?.primaryColor || '#059669',
          primaryFont: d.general?.primaryFont || 'Inter',
          siteTheme: d.general?.siteTheme || 'royal-violet',
        });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const saveSettings = async (section: string, data: any) => {
    setSaving(true); setMsg('');
    const token = localStorage.getItem('token');
    const headers: any = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      const r = await fetch(`${API}/admin/settings`, { method: 'PUT', headers, body: JSON.stringify({ section, data }) });
      const d = await r.json();
      if (r.ok && d.success !== false) setMsg("保存成功！");
      else setMsg(d.message || `保存失败(${r.status}) — 您的账户没有权限`);
      setTimeout(() => setMsg(''), 5000);
    } catch { setMsg("保存时出错"); }
    setSaving(false);
  };

  const saveContent = async (data?: any) => {
    setSaving(true); setMsg('');
    const token = localStorage.getItem('token');
    const headers: any = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      const r = await fetch(`${API}/admin/site-content`, { method: 'PUT', headers, body: JSON.stringify({ content: { ...content, ...editableContent(data || content) } }) });
      const d = await r.json();
      if (r.ok && d.success) { setContent(d.data); setMsg("已保存！网站立即更新。"); }
      else setMsg(d.message || `保存失败(${r.status}) — 您的账户没有权限`);
      setTimeout(() => setMsg(''), 3000);
    } catch { setMsg("保存时出错"); }
    setSaving(false);
  };

  const setS = (key: string, val: any) => setSettings((s: any) => ({ ...s, [key]: val }));
  if (loading) return <div className="p-8 text-center text-gray-400">加载中…</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">站点设置</h1>
          <p className="text-sm text-gray-500">管理业务信息、品牌和主题</p>
        </div>
        <a href="/" target="_blank" className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
          <Eye className="w-4 h-4" /> 预览站点
        </a>
      </div>
      {msg && <div className="mb-4 px-4 py-2 bg-violet-50 border border-violet-200 text-violet-700 rounded-lg text-sm">{msg}</div>}
      <div className="flex flex-wrap gap-1 pb-2 mb-6 border-b border-gray-100">
        <Tab active={tab === 'business'} onClick={() => setTab('business')} icon={<Globe className="w-4 h-4" />} label={"商业信息"} />
        <Tab active={tab === 'branding'} onClick={() => setTab('branding')} icon={<Palette className="w-4 h-4" />} label={"品牌"} />
        <Tab active={tab === 'theme'} onClick={() => setTab('theme')} icon={<Palette className="w-4 h-4" />} label={"主题/颜色"} />
      </div>

      {tab === 'content' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-gray-800">网站内容 — 逐字编辑所有内容</h3>
              <p className="text-sm text-gray-500">每页的所有文本都在这里，预先填充了实时内容。更改任何内容并保存 - 它会立即在网站上更新。提示：写 {"{业务}"} 任何地方，它都会自动显示您的公司名称。</p>
            </div>
            <button onClick={() => { if (!codeMode) setCodeText(JSON.stringify(editableContent(content), null, 2)); setCodeMode(!codeMode); }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
              {codeMode ? "表格模式" : "代码模式（JSON）"}
            </button>
          </div>
          {!content && <div className="text-sm text-gray-400">正在加载内容...</div>}
          {content && codeMode && (
            <div className="space-y-3">
              <textarea rows={28} value={codeText} onChange={e => setCodeText(e.target.value)} className={tc + ' font-mono text-xs'} spellCheck={false} />
              <button onClick={() => { try { const parsed = JSON.parse(codeText); setContent({ ...content, ...editableContent(parsed) }); saveContent(parsed); setCodeMode(false); } catch { setMsg("无效 JSON — 请修复并重试"); setTimeout(() => setMsg(''), 3000); } }} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? "保存中…" : "保存 JSON"}</button>
            </div>
          )}
          {content && !codeMode && (
            <div className="flex gap-6">
              <div className="w-44 shrink-0 space-y-1">
                {CONTENT_SECTIONS.map(s => (
                  <button key={s.key} onClick={() => setContentSection(s.key)} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${contentSection === s.key ? 'bg-violet-50 text-violet-700' : 'text-gray-500 hover:bg-gray-50'}`}>{s.label}</button>
                ))}
              </div>
              <div className="flex-1 min-w-0 space-y-4">
                <ContentEditor value={content[contentSection] || {}} onChange={v => setContent({ ...content, [contentSection]: v })} path={contentSection} />
                <button onClick={() => saveContent()} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? "保存中…" : "保存更改"}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'business' && (
        <div className="space-y-4 max-w-2xl">
          <h3 className="font-semibold text-gray-800">商业信息</h3>
          <p className="text-sm text-gray-500 -mt-2">此信息出现在整个网站上。更改一次，到处更新。</p>
          <Field label={"企业名称"} desc={"显示在导航栏、页脚、版权、电子邮件中"}><input type="text" value={settings.appName || ''} onChange={e => setS('appName', e.target.value)} className={ic} placeholder={"KKHS 媒体"} autoComplete="off" /></Field>
          <Field label={"标语"} desc={"徽标下方的简短描述"}><input type="text" value={settings.tagline || ''} onChange={e => setS('tagline', e.target.value)} className={ic} placeholder={"WhatsApp 商业平台"} autoComplete="off" /></Field>
          <Field label={"商业电子邮件"} desc={"显示在联系页面和电子邮件中"}><input type="email" value={settings.appEmail || ''} onChange={e => setS('appEmail', e.target.value)} className={ic} placeholder="info@yourcompany.com" autoComplete="off" /></Field>
          <Field label={"网站网址"}><input type="url" value={settings.appUrl || ''} onChange={e => setS('appUrl', e.target.value)} className={ic} placeholder="https://yoursite.com" autoComplete="off" /></Field>
          <Field label={"业务描述"} desc={"用于关于页面"}><textarea rows={3} value={settings.appDescription || ''} onChange={e => setS('appDescription', e.target.value)} className={tc} placeholder={"关于您的业务..."} /></Field>
          <button onClick={() => saveSettings('general', { appName: settings.appName, appEmail: settings.appEmail, appDescription: settings.appDescription, appUrl: settings.appUrl })} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? "保存中…" : "保存更改"}</button>
        </div>
      )}

      {tab === 'branding' && (
        <div className="space-y-4 max-w-2xl">
          <h3 className="font-semibold text-gray-800">品牌和标志</h3>
          <p className="text-xs text-gray-500 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">这是管理您的徽标和品牌的单一位置。它适用于任何地方——登录页面、导航栏、页脚以及管理和客户端侧边栏。接受任何图像格式；以下尺寸仅供参考。</p>
          <ImageUploadInput label={"标志"} value={settings.logo || ''} onChange={v => setS('logo', v)} hint={"推荐：200×60px，透明背景的PNG/SVG"} folder="branding" />
          <ImageUploadInput label={"深色标志（可选）"} value={settings.logoDark || ''} onChange={v => setS('logoDark', v)} hint={"在深色背景上显示。推荐：200×60px，PNG/SVG"} folder="branding" />
          <ImageUploadInput label={"网站图标"} value={settings.favicon || ''} onChange={v => setS('favicon', v)} hint={"推荐：32×32px或64×64px，.ico/.png"} folder="branding" />
          <ImageUploadInput label={"应用程序图标（PWA/安装应用程序）"} value={settings.appIcon || ''} onChange={v => setS('appIcon', v)} hint={"安装的应用程序上显示仅方形图标标记。推荐：512×512px PNG。留空以使用徽标。"} folder="branding" />
          <ImageUploadInput label={"登录页面图像"} value={settings.loginBg || ''} onChange={v => setS('loginBg', v)} hint={"显示在登录和注册页面的左侧。推荐：1200×1600px，JPG/PNG"} folder="branding" />
          <Field label={"登录标题"} desc={"登录页面图像上的大文本 — 默认留空"}><input type="text" value={settings.loginHeadline || ''} onChange={e => setS('loginHeadline', e.target.value)} className={ic} placeholder={"在 WhatsApp 上拓展您的业务"} autoComplete="off" /></Field>
          <Field label={"登录潜台词"} desc={"标题下的线"}><textarea rows={2} value={settings.loginSubtext || ''} onChange={e => setS('loginSubtext', e.target.value)} className={tc} placeholder={"一个用于聊天、活动和自动化的平台。"} /></Field>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={settings.googleAllowSignup !== false} onChange={e => { setS('googleAllowSignup', e.target.checked); saveSettings('google', { allowSignup: e.target.checked }); }} className="rounded border-gray-300" />允许使用“继续使用 Google”创建新账户</label>
          <Field label={"标语"} desc={"显示在徽标下方 — 更改或留空以显示白色标签"}><input type="text" value={settings.tagline || ''} onChange={e => setS('tagline', e.target.value)} className={ic} autoComplete="off" /></Field>
          <p className="text-xs text-gray-400">要重命名面板，请更改业务信息中的应用程序名称。上传新徽标后，进行硬刷新 (Ctrl+F5) 可立即看到它。</p>
          <button onClick={() => saveSettings('branding', { logo: settings.logo, logoDark: settings.logoDark, favicon: settings.favicon, loginBg: settings.loginBg, loginHeadline: settings.loginHeadline, loginSubtext: settings.loginSubtext, appIcon: settings.appIcon, tagline: settings.tagline })} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? "保存中…" : "保存品牌"}</button>
        </div>
      )}

      

      

      

      {tab === 'theme' && (
        <div className="space-y-6 max-w-4xl">
          <h3 className="font-semibold text-gray-800">网站模板</h3>
          <p className="text-sm text-gray-500 -mt-4">选择一个模板 - 内容保持不变，只有整个网站的外观发生变化。先预览，再应用。</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {themes.map(t => {
              const active = (settings.siteTheme || 'royal-violet') === t.id;
              return (
                <div key={t.id} className={`p-3 border rounded-xl space-y-2 ${active ? 'border-violet-500 ring-2 ring-violet-200' : 'border-gray-200'}`}>
                  <div className="flex h-8 rounded-lg overflow-hidden">
                    {t.colors.map((c: string, i: number) => <div key={i} className="flex-1" style={{ backgroundColor: c }} />)}
                  </div>
                  <div className="text-sm font-medium text-gray-800">{t.name}{active && <span className="ml-1 text-xs text-violet-600">✓ 活跃</span>}</div>
                  <div className="text-xs text-gray-400">{t.desc}</div>
                  <div className="flex gap-2">
                    <button onClick={() => window.open('/?previewTheme=' + t.id, '_blank')} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">预览</button>
                    {!active && <button onClick={() => { setS('siteTheme', t.id); saveSettings('general', { siteTheme: t.id }); }} disabled={saving} className="flex-1 px-2 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700">申请</button>}
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="font-semibold text-gray-800">主题/颜色</h3>
          <p className="text-sm text-gray-500 -mt-4">设置整个网站和管理面板的主要颜色和字体。</p>
          <div className="p-4 border border-gray-200 rounded-xl space-y-4">
            <h4 className="font-medium text-gray-700">原色</h4>
            <p className="text-xs text-gray-400 -mt-2">用于整个站点的按钮、链接、活动状态和强调符号。</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setS('primaryColor', c)} className={"w-8 h-8 rounded-full border-2 transition-all " + (settings.primaryColor === c ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105')} style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <input type="color" value={settings.primaryColor || '#059669'} onChange={e => setS('primaryColor', e.target.value)} className="w-10 h-10 p-0 border border-gray-200 rounded-lg cursor-pointer" />
              <input type="text" value={settings.primaryColor || '#059669'} onChange={e => setS('primaryColor', e.target.value)} className={ic + ' max-w-[140px]'} placeholder="#059669" autoComplete="off" />
              <span className="text-xs text-gray-400">选择任何自定义颜色来匹配您的徽标</span>
            </div>
            {settings.primaryColor && (
              <div className="flex items-center gap-3 mt-2">
                <div className="w-20 h-8 rounded-lg" style={{ backgroundColor: settings.primaryColor }} />
                <span className="text-sm text-gray-500">预览</span>
              </div>
            )}
          </div>
          <div className="p-4 border border-gray-200 rounded-xl space-y-3">
            <h4 className="font-medium text-gray-700">字体系列</h4>
            <select value={settings.primaryFont || 'Inter'} onChange={e => setS('primaryFont', e.target.value)} className={ic}>
              {FONTS.map(f => <option key={f.v} value={f.v}>{translateDisplay(f.l)}</option>)}
            </select>
          </div>
          <button onClick={() => saveSettings('general', { primaryColor: settings.primaryColor, primaryFont: settings.primaryFont })} disabled={saving} className={bc}><Save className="w-4 h-4" />{saving ? "保存中…" : "保存主题"}</button>
        </div>
      )}

      

      

      

      
    </div>
  );
}
