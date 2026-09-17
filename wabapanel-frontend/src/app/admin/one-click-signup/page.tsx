'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Save, Copy } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

interface WhatsAppSettings {
  enableEmbeddedSignup: boolean;
  enableManualSignup: boolean;
  enableCoexistence: boolean;
  apiVersion: string;
  webhookVerifyToken: string;
  appId: string;
  appSecret: string;
  configId: string;
  businessId: string;
}

const defaultWhatsapp: WhatsAppSettings = {
  enableEmbeddedSignup: false,
  enableManualSignup: true,
  enableCoexistence: false,
  apiVersion: 'v21.0',
  webhookVerifyToken: '',
  appId: '',
  appSecret: '',
  configId: '',
  businessId: '',
};

export default function OneClickSignupPage() {
  const [whatsapp, setWhatsapp] = useState<WhatsAppSettings>(defaultWhatsapp);
  const [saving, setSaving] = useState(false);
  const [ig, setIg] = useState({ appId: '', appSecret: '', configId: '', enableOneClick: false, enableManual: true });
  const [addonOn, setAddonOn] = useState(false);
  const [savingIg, setSavingIg] = useState(false);
  const [fb, setFb] = useState({ configId: '', enableOneClick: false });
  const [savingFb, setSavingFb] = useState(false);

  useEffect(() => {
    adminApi.getSettings().then(r => {
      const data = r.data.data || {};
      if (data.whatsapp && typeof data.whatsapp === 'object') {
        setWhatsapp({ ...defaultWhatsapp, ...data.whatsapp });
      }
      setIg({
        appId: data.facebook?.appId || '',
        appSecret: data.facebook?.appSecret || '',
        configId: data.instagram?.configId || '',
        enableOneClick: !!data.instagram?.enableOneClick,
        enableManual: data.instagram?.enableManual !== false,
      });
      setFb({ configId: data.facebook?.configId || '', enableOneClick: !!data.facebook?.enableOneClick });
      setAddonOn(!!data.addons?.igAutoDm);
    }).catch(() => {});
  }, []);

  const updateField = (field: keyof WhatsAppSettings, value: string | boolean) => {
    setWhatsapp(prev => ({ ...prev, [field]: value }));
  };

  const apiBase = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}/api` : '');
  const callbackUrl = apiBase ? `${apiBase.replace(/\/$/, '')}/webhook/whatsapp` : '';

  const copy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(translateApiMessage("已复制"));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateSettings({ section: 'whatsapp', data: whatsapp });
      toast.success(translateApiMessage("已保存一键注册设置"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
    setSaving(false);
  };

  const handleSaveFb = async () => {
    setSavingFb(true);
    try {
      await adminApi.updateSettings({ section: 'facebook', data: { appId: ig.appId, appSecret: ig.appSecret, configId: fb.configId, enableOneClick: fb.enableOneClick } });
      toast.success(translateApiMessage("Facebook Messenger 设置已保存"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
    setSavingFb(false);
  };

  const handleSaveIg = async () => {
    setSavingIg(true);
    try {
      await adminApi.updateSettings({ section: 'facebook', data: { appId: ig.appId, appSecret: ig.appSecret } });
      await adminApi.updateSettings({ section: 'instagram', data: { configId: ig.configId, enableOneClick: ig.enableOneClick, enableManual: ig.enableManual } });
      await adminApi.updateSettings({ section: 'addons', data: { igAutoDm: addonOn } });
      toast.success(translateApiMessage("Instagram 自动 DM 设置已保存"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
    setSavingIg(false);
  };

  return (
    <div className="space-y-6">
      <div className="page-hero">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FacebookIcon className="w-6 h-6 text-blue-600" /> 一键注册
        </h1>
      </div>
      <p className="text-sm mt-1">WhatsApp 嵌入式注册 — 让客户通过 Facebook 一键连接他们的 WhatsApp Business 账户。</p>

      <Card>
        <div className="space-y-6 max-w-lg">
          {/* Signup Methods Toggle */}
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">WhatsApp 注册方法</h3>
            <p className="text-xs text-gray-500 mb-4">选择您的客户可以用来连接其 WhatsApp Business 账户的注册方法。</p>
          </div>
          <div className="space-y-3 rounded-lg border border-gray-200 p-4 bg-gray-50">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={whatsapp.enableEmbeddedSignup} onChange={e => updateField('enableEmbeddedSignup', e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
              <div>
                <span className="text-sm font-medium text-gray-800">启用嵌入式注册</span>
                <p className="text-xs text-gray-500">对于技术提供商批准的管理员。客户可以直接通过您的平台创建/连接 WhatsApp Business 账户。</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={whatsapp.enableManualSignup} onChange={e => updateField('enableManualSignup', e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
              <div>
                <span className="text-sm font-medium text-gray-800">启用手动注册</span>
                <p className="text-xs text-gray-500">客户端手动输入其电话号码 ID、WABA ID 和永久访问令牌。</p>
              </div>
            </label>
          </div>

          {/* Embedded Signup Config - shown only when enabled */}
          {whatsapp.enableEmbeddedSignup && (
            <>
              <hr className="border-gray-200" />
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-1">嵌入式注册配置</h3>
                <p className="text-xs text-gray-500 mb-4">配置您的 Facebook 应用程序以进行 WhatsApp 嵌入式注册。请勿将同一应用程序用于任何其他目的，例如手动 WhatsApp API 设置等。</p>
              </div>
              <Input label={"Facebook 应用程序 ID"} value={whatsapp.appId} onChange={e => updateField('appId', e.target.value)} placeholder="e.g. 1234567890123456" />
              <Input label={"Facebook 应用程序秘密"} type="password" value={whatsapp.appSecret} onChange={e => updateField('appSecret', e.target.value)} placeholder={"输入您的 Facebook 应用程序密码"} />
              <Input label={"配置ID"} value={whatsapp.configId} onChange={e => updateField('configId', e.target.value)} placeholder={"WhatsApp 嵌入式注册配置 ID"} />
              <Input label={"现有 WhatsApp 企业 ID（可选）"} value={whatsapp.businessId} onChange={e => updateField('businessId', e.target.value)} placeholder={"您现有的 WABA 企业 ID"} />

              <div className="space-y-3 rounded-lg border border-blue-200 p-4 bg-blue-50">
                <p className="text-xs text-gray-600">将这两个值粘贴到您的元应用程序 → WhatsApp → 配置 (Webhook) 中。客户不需要执行此操作 - 这是您的应用程序的一次性设置。</p>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">回调网址</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={callbackUrl} className="flex-1 text-sm rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-gray-800" />
                    <button type="button" onClick={() => copy(callbackUrl)} className="shrink-0 rounded-md border border-gray-300 bg-white p-2 hover:bg-gray-100" title={"复制"}><Copy className="w-4 h-4 text-gray-600" /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">验证令牌</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={whatsapp.webhookVerifyToken} placeholder={"在 API 设置中设置下面的令牌，然后保存"} className="flex-1 text-sm rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-gray-800" />
                    <button type="button" onClick={() => copy(whatsapp.webhookVerifyToken)} className="shrink-0 rounded-md border border-gray-300 bg-white p-2 hover:bg-gray-100" title={"复制"}><Copy className="w-4 h-4 text-gray-600" /></button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-gray-200 p-4 bg-gray-50">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={whatsapp.enableCoexistence} onChange={e => updateField('enableCoexistence', e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
                  <div>
                    <span className="text-sm font-medium text-gray-800">启用共存（WhatsApp Business 应用程序号码）</span>
                    <p className="text-xs text-gray-500">让客户端连接已在 WhatsApp Business 应用程序中运行的号码，并同时在应用程序和 API 上使用它（聊天保持同步）。需要技术提供商批准并在元应用程序中启用共存 Webhook 字段。</p>
                  </div>
                </label>
              </div>
            </>
          )}

          <hr className="border-gray-200" />
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">API 设置</h3>
            <p className="text-xs text-gray-500 mb-4">WhatsApp Cloud API 常规配置。</p>
          </div>
          <Input label={"API版本"} value={whatsapp.apiVersion} onChange={e => updateField('apiVersion', e.target.value)} />
          <Input label={"Webhook 验证令牌"} value={whatsapp.webhookVerifyToken} onChange={e => updateField('webhookVerifyToken', e.target.value)} placeholder={"用于 webhook 验证的自定义验证令牌"} />
          <Button onClick={handleSave} loading={saving} icon={<Save className="w-4 h-4" />}>保存</Button>
        </div>
      </Card>

      <Card>
        <div className="space-y-5 max-w-lg">
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Facebook Messenger 一键连接</h3>
            <p className="text-xs text-gray-500">让客户一键从频道连接他们的 Facebook 页面，无需页面 ID 或令牌。使用下面设置的 Facebook 应用程序 ID/秘密。</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-blue-200 p-3 bg-blue-50">
            <input type="checkbox" checked={fb.enableOneClick} onChange={e => setFb(v => ({ ...v, enableOneClick: e.target.checked }))} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-800">启用一键连接（Facebook 登录）</span>
          </label>
          {fb.enableOneClick && (
            <Input label={"Messenger 配置 ID（可选）"} value={fb.configId} onChange={e => setFb(v => ({ ...v, configId: e.target.value }))} placeholder={"Facebook 企业登录配置 ID"} />
          )}
          <Button onClick={handleSaveFb} loading={savingFb} icon={<Save className="w-4 h-4" />}>保存 Messenger 设置</Button>
        </div>
      </Card>

      <Card>
        <div className="space-y-5 max-w-lg">
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Instagram 自动 DM（附加）</h3>
            <p className="text-xs text-gray-500">可选附加组件。启用该面板的许可证，然后在管理 → 功能下为每个客户打开它。使用下面的 Facebook 应用程序进行一键连接。</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-pink-200 p-3 bg-pink-50">
            <input type="checkbox" checked={addonOn} onChange={e => setAddonOn(e.target.checked)} className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500" />
            <div>
              <span className="text-sm font-medium text-gray-800">为此面板启用 Instagram Auto DM 插件（商店许可证）</span>
              <p className="text-xs text-gray-500">关闭时，该面板上的每个客户都会隐藏该附加组件。</p>
            </div>
          </label>
          <div className="space-y-3 rounded-lg border border-gray-200 p-4 bg-gray-50">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={ig.enableOneClick} onChange={e => setIg(v => ({ ...v, enableOneClick: e.target.checked }))} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm font-medium text-gray-800">启用一键连接（Facebook 登录）</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={ig.enableManual} onChange={e => setIg(v => ({ ...v, enableManual: e.target.checked }))} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm font-medium text-gray-800">启用手动连接（页面 ID + 令牌）</span>
            </label>
          </div>
          {ig.enableOneClick && (
            <>
              <Input label={"Facebook 应用程序 ID"} value={ig.appId} onChange={e => setIg(v => ({ ...v, appId: e.target.value }))} placeholder="e.g. 1234567890123456" />
              <Input label={"Facebook 应用程序秘密"} type="password" value={ig.appSecret} onChange={e => setIg(v => ({ ...v, appSecret: e.target.value }))} placeholder={"输入您的 Facebook 应用程序密码"} />
              <Input label={"Instagram 配置 ID（可选）"} value={ig.configId} onChange={e => setIg(v => ({ ...v, configId: e.target.value }))} placeholder={"Facebook 企业登录配置 ID"} />
            </>
          )}
          <Button onClick={handleSaveIg} loading={savingIg} icon={<Save className="w-4 h-4" />}>保存 Instagram 设置</Button>
        </div>
      </Card>
    </div>
  );
}
