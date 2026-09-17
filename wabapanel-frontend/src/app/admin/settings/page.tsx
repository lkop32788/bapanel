'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Save, Send, Mail, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface SystemSettings {
  general: { appName: string; appEmail: string; appDescription: string; appUrl: string; theme: string; sessionTimeout: string; contactCaptcha: boolean; };
  branding: { logo: string; logoDark: string; favicon: string; loginBg: string; tagline: string; };
  whatsapp: { enableEmbeddedSignup: boolean; enableManualSignup: boolean; apiVersion: string; webhookVerifyToken: string; appId: string; appSecret: string; configId: string; businessId: string; };
  facebook: { appId: string; appSecret: string; webhookUrl: string; };
  email: { host: string; port: string; user: string; password: string; from: string; fromName: string; encryption: string; templates: Record<string, { enabled: boolean; subject: string; body: string }>; };
  google: { clientId: string; clientSecret: string; analyticsId: string; };
  aws: { accessKeyId: string; secretAccessKey: string; region: string; bucket: string; };
  limits: { maxFileSize: string; maxGroupSize: string; maxBroadcastSize: string; };
  
  
  
  security: { webhookSignature: string; };
}

const defaultSettings: SystemSettings = {
  general: { appName: 'WabaPanel by KKHS Media', appEmail: '', appDescription: '', appUrl: '', theme: 'emerald', sessionTimeout: '24', contactCaptcha: false },
  branding: { logo: '', logoDark: '', favicon: '', loginBg: '', tagline: "KKHS 媒体" },
  whatsapp: { enableEmbeddedSignup: false, enableManualSignup: true, apiVersion: 'v21.0', webhookVerifyToken: '', appId: '', appSecret: '', configId: '', businessId: '' },
  facebook: { appId: '', appSecret: '', webhookUrl: '' },
  email: { host: '', port: '587', user: '', password: '', from: '', fromName: '', encryption: 'tls', templates: {} },
  google: { clientId: '', clientSecret: '', analyticsId: '' },
  aws: { accessKeyId: '', secretAccessKey: '', region: 'ap-south-1', bucket: '' },
  limits: { maxFileSize: '16', maxGroupSize: '256', maxBroadcastSize: '10000' },
  
  
  
  security: { webhookSignature: 'log' },
};

const EMAIL_TEMPLATE_DEFS: { key: string; label: string; description: string; variables: string[] }[] = [
  { key: 'welcome', label: "欢迎电子邮件", description: "新用户注册时发送", variables: ['userName', "应用程序名称", "应用程序网址"] },
  { key: 'passwordReset', label: "密码重置", description: "当用户请求重置密码时发送", variables: ['userName', "应用程序名称", "重置链接"] },
  { key: 'emailVerification', label: "电子邮件验证", description: "已发送以验证电子邮件地址", variables: ['userName', "应用程序名称", "验证链接"] },

  { key: 'accountDeactivation', label: "账户停用", description: "账户停用时发送", variables: ['userName', "应用程序名称"] },
  { key: 'loginAlert', label: "登录提醒", description: "检测到新登录时发送", variables: ['userName', 'appName', 'ipAddress', 'loginTime', 'deviceInfo'] },
  
  { key: 'contactForm', label: "联系表", description: "提交新的联系表单后发送", variables: ['appName', 'contactName', 'contactEmail', 'contactPhone', 'contactMessage'] },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getSettings().then(r => {
      const data = r.data.data || {};
      // Deep merge each section so no field is lost
      const merged = { ...defaultSettings };
      for (const key of Object.keys(defaultSettings) as (keyof SystemSettings)[]) {
        if (data[key] && typeof data[key] === 'object') {
          merged[key] = { ...defaultSettings[key], ...data[key] } as never;
        }
      }
      setSettings(merged);
    }).catch(() => {});
  }, []);

  const handleSave = async (section: string) => {
    setSaving(true);
    try {
      await adminApi.updateSettings({ section, data: settings[section as keyof SystemSettings] });
      toast.success(translateApiMessage(`${section} 设置已保存`));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
    setSaving(false);
  };

  const updateField = (section: keyof SystemSettings, field: string, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  };

  const updateTemplate = (key: string, field: string, value: string | boolean) => {
    setSettings(prev => ({
      ...prev,
      email: {
        ...prev.email,
        templates: {
          ...prev.email.templates,
          [key]: { ...(prev.email.templates[key] || { enabled: true, subject: '', body: '' }), [field]: value },
        },
      },
    }));
  };

  const handleTestEmail = async () => {
    if (!testEmail) { toast.error(translateApiMessage("输入电子邮件地址")); return; }
    setSendingTest(true);
    try {
      await adminApi.sendTestEmail({ to: testEmail });
      toast.success(translateApiMessage("测试电子邮件已发送！"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "发送测试电子邮件失败"));
    }
    setSendingTest(false);
  };

  const tabs = [
    { key: 'general', label: "一般", content: (
      <Card>
        <div className="space-y-4 max-w-lg">
          <Input label={"应用程序名称"} value={settings.general.appName} onChange={e => updateField('general', 'appName', e.target.value)} />
          <Input label={"应用程序电子邮件"} value={settings.general.appEmail} onChange={e => updateField('general', 'appEmail', e.target.value)} />
          <Textarea label={"说明"} value={settings.general.appDescription} onChange={e => updateField('general', 'appDescription', e.target.value)} />
          <Input label={"应用程序网址"} value={settings.general.appUrl} onChange={e => updateField('general', 'appUrl', e.target.value)} />
          <Input label={"会话超时（小时）"} type="number" value={settings.general.sessionTimeout} onChange={e => updateField('general', 'sessionTimeout', e.target.value)} />
          <button type="button" onClick={() => updateField('general', 'contactCaptcha', !settings.general.contactCaptcha)} className="flex items-center justify-between w-full p-3 border border-gray-200 rounded-lg text-left">
            <span>
              <span className="block text-sm font-medium text-gray-900">联系表格验证码</span>
              <span className="block text-xs text-gray-500">在公共联系页面上显示数学验证码以阻止垃圾邮件机器人</span>
            </span>
            {settings.general.contactCaptcha ? <ToggleRight className="w-8 h-8 text-emerald-500 shrink-0" /> : <ToggleLeft className="w-8 h-8 text-gray-400 shrink-0" />}
          </button>
          <Button onClick={() => handleSave('general')} loading={saving} icon={<Save className="w-4 h-4" />}>保存</Button>
        </div>
      </Card>
    )},
    
    { key: 'branding', label: "品牌", content: (
      <Card>
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-gray-700">品牌（徽标、深色徽标、网站图标、登录背景和标语）现在在 <b>站点设置</b> 因此您的所有网站和面板外观都位于一处。</p>
          <a href="/admin/site-settings" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
            转到站点设置 → 品牌
          </a>
        </div>
      </Card>
    )},
    { key: 'email', label: "电子邮件 SMTP", content: (
      <div className="space-y-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">SMTP 配置</h3>
          <p className="text-xs text-gray-500 mb-4">配置您的电子邮件服务器以发送系统电子邮件</p>
          <div className="space-y-4 max-w-lg">
            <Input label={"SMTP 主机"} value={settings.email.host} onChange={e => updateField('email', 'host', e.target.value)} placeholder="smtp.gmail.com" />
            <div className="grid grid-cols-2 gap-4">
              <Input label={"SMTP 端口"} value={settings.email.port} onChange={e => updateField('email', 'port', e.target.value)} placeholder="587" />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">加密</label>
                <select value={settings.email.encryption} onChange={e => updateField('email', 'encryption', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="tls">TLS（端口 587）</option>
                  <option value="ssl">SSL（端口 465）</option>
                  <option value="none">无（端口25）</option>
                </select>
              </div>
            </div>
            <Input label={"用户名"} value={settings.email.user} onChange={e => updateField('email', 'user', e.target.value)} placeholder="your@email.com" />
            <Input label={"密码"} type="password" value={settings.email.password} onChange={e => updateField('email', 'password', e.target.value)} placeholder={"应用程序密码或 SMTP 密码"} />
            <Input label={"来自电子邮件"} value={settings.email.from} onChange={e => updateField('email', 'from', e.target.value)} placeholder="noreply@yourdomain.com" />
            <Input label={"来自姓名"} value={settings.email.fromName} onChange={e => updateField('email', 'fromName', e.target.value)} placeholder="WabaPanel" />
            <div className="flex gap-2">
              <Button onClick={() => handleSave('email')} loading={saving} icon={<Save className="w-4 h-4" />}>保存 SMTP</Button>
            </div>
            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">发送测试电子邮件</p>
              <div className="flex gap-2">
                <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com" />
                <Button onClick={handleTestEmail} loading={sendingTest} variant="secondary" icon={<Send className="w-4 h-4" />}>发送测试</Button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">电子邮件模板</h3>
          <p className="text-xs text-gray-500 mb-4">配置要发送的电子邮件并自定义其内容。使用 {'{{variableName}}'} 用于动态值。</p>
          <div className="space-y-3">
            {EMAIL_TEMPLATE_DEFS.map(def => {
              const tpl = settings.email.templates[def.key] || { enabled: true, subject: '', body: '' };
              const isExpanded = expandedTemplate === def.key;
              return (
                <div key={def.key} className={`border rounded-lg ${tpl.enabled ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 bg-gray-50/30'}`}>
                  <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => setExpandedTemplate(isExpanded ? null : def.key)}>
                    <div className="flex items-center gap-3">
                      <Mail className={`w-4 h-4 ${tpl.enabled ? 'text-emerald-500' : 'text-gray-400'}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{def.label}</p>
                        <p className="text-[11px] text-gray-500">{def.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={(e) => { e.stopPropagation(); updateTemplate(def.key, 'enabled', !tpl.enabled); }} className="flex items-center">
                        {tpl.enabled ? <ToggleRight className="w-8 h-8 text-emerald-500" /> : <ToggleLeft className="w-8 h-8 text-gray-400" />}
                      </button>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t border-gray-100 pt-3">
                      <Input label={"主题"} value={tpl.subject} onChange={e => updateTemplate(def.key, 'subject', e.target.value)} placeholder={`电子邮件主题 ${def.label}`} />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">正文 (HTML)</label>
                        <textarea rows={6} value={tpl.body} onChange={e => updateTemplate(def.key, 'body', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder={"<h2>电子邮件内容...</h2>"} />
                      </div>
                      <p className="text-[11px] text-gray-400">可用变量： {def.variables.map(v => `{{${v}}}`).join(', ')}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <Button onClick={() => handleSave('email')} loading={saving} icon={<Save className="w-4 h-4" />}>保存所有电子邮件设置</Button>
          </div>
        </Card>
      </div>
    )},
    { key: 'google', label: "谷歌登录", content: (
      <Card>
        <div className="space-y-4 max-w-xl">
          <p className="text-sm text-gray-500">
            在此处粘贴 Google OAuth 客户端，以在登录页面上显示“继续使用 Google”按钮。             将这两个字段留空以关闭 Google 登录。只有此面板上已存在的账户才能使用 Google 登录 - 它永远不会创建新账户。
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
            <p className="font-medium text-gray-700 mb-1">授权重定向 URI（将其粘贴到 Google Cloud Console 中）</p>
            <code className="break-all">{(process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')}/auth/google/callback</code>
          </div>
          <Input label={"Google 客户端 ID"} value={settings.google.clientId} onChange={e => updateField('google', 'clientId', e.target.value)} autoComplete="off" />
          <Input label={"Google 客户端秘密"} type="password" value={settings.google.clientSecret} onChange={e => updateField('google', 'clientSecret', e.target.value)} autoComplete="off" />
          <Input label={"Google Analytics ID（可选）"} value={settings.google.analyticsId} onChange={e => updateField('google', 'analyticsId', e.target.value)} autoComplete="off" />
          <Button onClick={() => handleSave('google')} loading={saving} icon={<Save className="w-4 h-4" />}>保存</Button>
        </div>
      </Card>
    )},
    { key: 'aws', label: 'AWS S3', content: (
      <Card>
        <div className="space-y-4 max-w-lg">
          <Input label={"访问密钥 ID"} value={settings.aws.accessKeyId} onChange={e => updateField('aws', 'accessKeyId', e.target.value)} />
          <Input label={"秘密访问密钥"} type="password" value={settings.aws.secretAccessKey} onChange={e => updateField('aws', 'secretAccessKey', e.target.value)} />
          <Input label={"地区"} value={settings.aws.region} onChange={e => updateField('aws', 'region', e.target.value)} />
          <Input label={"存储桶名称"} value={settings.aws.bucket} onChange={e => updateField('aws', 'bucket', e.target.value)} />
          <Button onClick={() => handleSave('aws')} loading={saving} icon={<Save className="w-4 h-4" />}>保存</Button>
        </div>
      </Card>
    )},
    { key: 'limits', label: "限制", content: (
      <Card>
        <div className="space-y-4 max-w-lg">
          <Input label={"最大文件大小 (MB)"} type="number" value={settings.limits.maxFileSize} onChange={e => updateField('limits', 'maxFileSize', e.target.value)} />
          <Input label={"最大组大小"} type="number" value={settings.limits.maxGroupSize} onChange={e => updateField('limits', 'maxGroupSize', e.target.value)} />
          <Input label={"最大广播大小"} type="number" value={settings.limits.maxBroadcastSize} onChange={e => updateField('limits', 'maxBroadcastSize', e.target.value)} />
          <Button onClick={() => handleSave('limits')} loading={saving} icon={<Save className="w-4 h-4" />}>保存</Button>
        </div>
      </Card>
    )},
    
    { key: 'security', label: "安全", content: (
      <Card>
        <div className="space-y-4 max-w-2xl">
          <p className="text-sm text-gray-600">元 webhook 签名检查（WhatsApp、Facebook Leads）。使用 WhatsApp / Facebook 选项卡中保存的应用程序密钥。除非您选择“严格”，否则消息永远不会被丢弃。</p>
          {[
            ['log', "仅记录（默认）", "验证 X-Hub-Signature-256 并在服务器日志中记录故障；所有 webhook 仍在处理中。"],
            ['strict', "严格", "拒绝签名缺失或无效的 webhook (401)。仅在每个连接的号码使用此处配置的应用程序密钥后启用 - 否则它们的入站消息将停止。"],
            ['off', "关闭", "不检查签名。"],
          ].map(([val, title, desc]) => (
            <label key={val} className="flex items-start gap-3 text-sm border border-gray-200 rounded-lg p-3 cursor-pointer">
              <input type="radio" name="webhookSignature" checked={(settings.security.webhookSignature || 'log') === val} onChange={() => updateField('security', 'webhookSignature', val)} className="mt-1" />
              <span><b>{title}</b> — {desc}</span>
            </label>
          ))}
          <Button onClick={() => handleSave('security')} loading={saving} icon={<Save className="w-4 h-4" />}>保存</Button>
        </div>
      </Card>
    )},
    
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero">
      <h1 className="text-2xl font-bold text-gray-900">系统偏好设置</h1>
      </div>
      <p className="text-sm mt-1">系统范围的设置 — 品牌、常规和集成</p>
      <Tabs tabs={tabs} />
    </div>
  );
}
