'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Bot, Save, Shield, Target, MessageSquare, ToggleLeft, ToggleRight, RefreshCw, Brain, Key, TestTube, Sparkles, Upload, FileText, Trash2 } from 'lucide-react';
import { aiSettingsApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface AISettings {
  enabled: boolean;
  provider: string;
  apiKey: string;
  model: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  azureWhisperDeployment?: string;
  azureTtsDeployment?: string;
  azureWhisperEndpoint?: string;
  azureWhisperKey?: string;
  azureRealtimeEndpoint?: string;
  azureRealtimeKey?: string;
  azureRealtimeDeployment?: string;
  azureRealtimeApiVersion?: string;
  systemPrompt: string;
  knowledgeBase: string;
  temperature: number;
  maxTokens: number;
  language: string;
  tone: string;
  targetingRules: {
    mode: string;
    channels: string[];
    targets: { type: string; value: string }[];
    excludeTags: string[];
    excludeAssigned: boolean;
    excludeActiveConversation: boolean;
  };
  handoffRules: {
    keywords: string[];
    maxUnknownReplies: number;
    detectFrustration: boolean;
    autoHandoffMessage: string;
  };
  features: { voiceToText: boolean;  autoSummary: boolean; sentiment: boolean; autoTranslate: boolean;   voiceReplyVoice?: string };
  stats?: { totalReplies: number; totalHandoffs: number; totalTokensUsed: number };
}

const defaultSettings: AISettings = {
  enabled: false, provider: 'openai', apiKey: '', model: 'gpt-4o',
  azureEndpoint: '', azureDeployment: '', azureApiVersion: '2024-02-15-preview', azureWhisperDeployment: '', azureTtsDeployment: '', azureWhisperEndpoint: '', azureWhisperKey: '',
  azureRealtimeEndpoint: '', azureRealtimeKey: '', azureRealtimeDeployment: '', azureRealtimeApiVersion: '2024-10-01-preview',
  systemPrompt: 'You are a helpful WhatsApp business assistant. Be concise, friendly, and helpful.',
  knowledgeBase: '', temperature: 0.7, maxTokens: 500, language: 'auto', tone: 'friendly',
  targetingRules: { mode: 'all', channels: [], targets: [], excludeTags: [], excludeAssigned: true, excludeActiveConversation: true },
  handoffRules: { keywords: ['agent', 'human', 'person', 'help'], maxUnknownReplies: 3, detectFrustration: true, autoHandoffMessage: "I'm connecting you with a human agent. Please hold on." },
  features: { voiceToText: false,  autoSummary: false, sentiment: false, autoTranslate: false,   voiceReplyVoice: 'openai' },
};

const targetOptions = [
  { value: 'all', label: "所有联系人", desc: "人工智能回复所有客户的消息" },
  { value: 'new_leads', label: "仅限新线索（24 小时）", desc: "仅新线索（前 24 小时）" },
  { value: 'unassigned', label: "未分配的聊天", desc: "聊天未分配给任何客服人员" },
  // BOT-07: the backend does not evaluate these two targets; shown disabled so nobody relies on them
  { value: 'no_response', label: "没有回复联系人", desc: "尚未发送回复的联系人", unsupported: true },
  { value: 'off_hours', label: "仅限非工作时间", desc: "AI 仅在工作时间之外回复", unsupported: true },
];

const MODEL_OPTIONS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o4-mini', 'gpt-3.5-turbo'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  xai: ['grok-3', 'grok-3-mini', 'grok-2-1212'],
  azure: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4', 'gpt-35-turbo'],
};

interface KbDoc { _id: string; filename: string; size: number; chars: number; status: string; note?: string; }

export default function AISettingsPage() {
  const [settings, setSettings] = useState<AISettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [submitting, setSubmitting] = useState(false);
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([]);
  const [uploadingKb, setUploadingKb] = useState(false);

  const loadKbDocs = () => {
    aiSettingsApi.listKnowledgeDocs().then(r => setKbDocs(r.data.data || [])).catch(() => {});
  };
  useEffect(() => { loadKbDocs(); }, []);

  const handleKbUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploadingKb(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const r = await aiSettingsApi.uploadKnowledgeDoc(fd);
        const d = r.data.data;
        if (d.status === 'no_text') toast('Uploaded ' + d.filename + ' \u2014 image/video saved, but no text could be read', { icon: '\u26A0\uFE0F' });
        else if (d.status === 'error') toast.error(translateApiMessage("无法读取" + d.filename));
        else toast.success(translateApiMessage(d.filename + "添加（" + d.chars + "字符）"));
      }
      loadKbDocs();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(translateApiMessage(msg || "上传失败"));
    } finally {
      setUploadingKb(false);
    }
  };

  const handleKbDelete = async (id: string) => {
    try { await aiSettingsApi.deleteKnowledgeDoc(id); setKbDocs(docs => docs.filter(d => d._id !== id)); toast.success(translateApiMessage("已删除")); }
    catch { toast.error(translateApiMessage("删除失败")); }
  };

  useEffect(() => {
    aiSettingsApi.get()
      .then(r => { if (r.data.data) setSettings({ ...defaultSettings, ...r.data.data, features: { ...defaultSettings.features, ...(r.data.data.features || {}) } }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);

    setSaving(true);
    try {
      await aiSettingsApi.update(settings);
      toast.success(translateApiMessage("AI 设置已保存！"));
    } catch { toast.error(translateApiMessage("保存失败")); } finally { setSubmitting(false); }
    setSaving(false);
  };

  const handleTest = async () => {
    if (submitting) return;
    setTesting(true);
    setSubmitting(true);
    try {
      const r = await aiSettingsApi.test();
      toast.success(translateApiMessage("连接成功！回应：" + (r.data.data?.response || 'OK')));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "连接失败"));
    } finally {
      setSubmitting(false);
    }
    setTesting(false);
  };

  const toggleTarget = (type: string) => {
    const targets = settings.targetingRules.targets || [];
    const exists = targets.find(t => t.type === type);
    const newTargets = exists ? targets.filter(t => t.type !== type) : [...targets, { type, value: '' }];
    setSettings({ ...settings, targetingRules: { ...settings.targetingRules, targets: newTargets } });
  };

  const channelOptions = [
    { value: 'whatsapp', label: "WhatsApp（官方API）" },
    { value: 'whatsapp_qr', label: "WhatsApp 二维码" },
    { value: 'telegram', label: "电报机器人" },
    { value: 'telegram_personal', label: "个人电报" },
    { value: 'facebook', label: 'Facebook Messenger' },
    { value: 'instagram', label: "Instagram 私信" },
  ];

  const toggleChannel = (value: string) => {
    const channels = settings.targetingRules.channels || [];
    const newChannels = channels.includes(value) ? channels.filter(c => c !== value) : [...channels, value];
    setSettings({ ...settings, targetingRules: { ...settings.targetingRules, channels: newChannels } });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const tabs = [
    { id: 'general', label: "一般", icon: <Brain className="w-4 h-4" /> },
    { id: 'prompt', label: "提示与知识", icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'targeting', label: "定位规则", icon: <Target className="w-4 h-4" /> },
    { id: 'handoff', label: "切换规则", icon: <Shield className="w-4 h-4" /> },
    { id: 'features', label: "人工智能特征", icon: <Sparkles className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Bot className="w-6 h-6 text-emerald-600" /> 人工智能聊天机器人设置</h1>
          <p className="text-sm text-gray-500 mt-1">为传入的 WhatsApp 消息配置 AI 自动回复</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${settings.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            {settings.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            {settings.enabled ? "人工智能活跃" : "人工智能不活跃"}
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? "保存中…" : "保存设置"}
          </button>
        </div>
      </div>

      {settings.stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">人工智能回复</p><p className="text-2xl font-bold text-gray-900 mt-1">{settings.stats.totalReplies}</p></div>
          <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">移交给人类</p><p className="text-2xl font-bold text-gray-900 mt-1">{settings.stats.totalHandoffs}</p></div>
          <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">使用的代币</p><p className="text-2xl font-bold text-gray-900 mt-1">{settings.stats.totalTokensUsed?.toLocaleString()}</p></div>
        </div>
      )}

      <div className="flex gap-2 border-b">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${activeTab === tab.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border p-6">
        {activeTab === 'general' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">人工智能提供商</label>
                <select value={settings.provider} onChange={e => setSettings({ ...settings, provider: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="openai">OpenAI (ChatGPT)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="xai">xAI（Grok）</option>
                  <option value="azure">Azure OpenAI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">型号</label>
                <select value={MODEL_OPTIONS[settings.provider]?.includes(settings.model) ? settings.model : 'custom'}
                  onChange={e => { if (e.target.value !== 'custom') setSettings({ ...settings, model: e.target.value }); else setSettings({ ...settings, model: '' }); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  {(MODEL_OPTIONS[settings.provider] || []).map(m => <option key={m} value={m}>{translateDisplay(m)}</option>)}
                  <option value="custom">定制模型...</option>
                </select>
                {!MODEL_OPTIONS[settings.provider]?.includes(settings.model) && (
                  <input type="text" value={settings.model} onChange={e => setSettings({ ...settings, model: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm mt-2" placeholder={"输入型号名称（例如 gpt-4o）"} />
                )}
              </div>
            </div>
            {settings.provider === 'azure' && (
              <div className="grid grid-cols-1 gap-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-sm font-semibold text-blue-800">💬 聊天 AI — WhatsApp 文本自动回复</p>
                <p className="text-xs text-blue-700">这些设置用于 <b>聊天/文字回复</b> （回复 WhatsApp 消息）。 Azure OpenAI 使用您的资源终结点加上您在 Azure 中创建的部署名称（而不是普通模型名称）。在 Azure 门户 → 您的资源 → 密钥和端点/部署中找到这些内容。在中输入其密钥 <b>聊天 API 密钥
下面的</b> 字段。</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Azure 端点</label>
                  <input type="text" value={settings.azureEndpoint || ''} onChange={e => setSettings({ ...settings, azureEndpoint: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://your-resource.openai.azure.com" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">部署名称</label>
                    <input type="text" value={settings.azureDeployment || ''} onChange={e => setSettings({ ...settings, azureDeployment: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={"例如GPT-4O"} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API版本</label>
                    <input type="text" value={settings.azureApiVersion || ''} onChange={e => setSettings({ ...settings, azureApiVersion: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={"2024-02-15-预览"} />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-white border border-blue-200">
                  <p className="text-sm font-semibold text-blue-800 mb-1">🎤 语音消息（语音） <span className="text-gray-400 font-normal">— 可选</span></p>
                  <p className="text-xs text-blue-700 mb-2">最简单：创建一个 <b>Azure AI 语音</b> 资源并粘贴其端点（例如 <code>https://centralindia.api.cognitive.microsoft.com/</code>) &amp; 下面的键 — 无需部署。那么人工智能 <b>听</b> 客户语音备注和 <b>通过语音留言回复</b> （印地语/英语自动）。可以选择在最后一个框中输入神经语音名称（例如 <code>hi-IN-SwaraNeural</code>）。使用 Azure OpenAI 代替？粘贴你的耳语/tts <b>部署名称</b> 那里。图像通过上面的聊天部署读取 - 无需额外设置。</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">语音转文本（仅限 Azure OpenAI）</label>
                      <input type="text" value={settings.azureWhisperDeployment || ''} onChange={e => setSettings({ ...settings, azureWhisperDeployment: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={"例如耳语"} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">语音/TTS部署</label>
                      <input type="text" value={settings.azureTtsDeployment || ''} onChange={e => setSettings({ ...settings, azureTtsDeployment: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={"例如hi-IN-SwaraNeural"} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">端点</label>
                      <input type="text" value={settings.azureWhisperEndpoint || ''} onChange={e => setSettings({ ...settings, azureWhisperEndpoint: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://centralindia.api.cognitive.microsoft.com/" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">API 密钥</label>
                      <input type="password" value={settings.azureWhisperKey || ''} onChange={e => setSettings({ ...settings, azureWhisperKey: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={"空白 = 与聊天相同"} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2"><Key className="w-4 h-4" /> 聊天 API 密钥
下面的</label>
                  <div className="flex gap-2">
                    <input type="password" value={settings.apiKey} onChange={e => setSettings({ ...settings, apiKey: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder={"Azure 资源密钥（用于聊天）"} />
                    <button onClick={handleTest} disabled={testing} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 flex items-center gap-1 disabled:opacity-50">
                      <TestTube className="w-4 h-4" /> {testing ? "测试..." : "测试"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {settings.provider !== 'azure' && (
              <div className="grid grid-cols-1 gap-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-sm font-semibold text-blue-800">💬 聊天 AI — WhatsApp 文本自动回复</p>
                <p className="text-xs text-blue-700">该键用于 <b>聊天/文字回复</b> （回复 WhatsApp 消息）与上面选择的提供商和型号。在下面的部分中，呼叫使用自己的密钥。</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2"><Key className="w-4 h-4" /> 聊天 API 密钥
下面的</label>
                  <div className="flex gap-2">
                    <input type="password" value={settings.apiKey} onChange={e => setSettings({ ...settings, apiKey: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="sk-..." />
                    <button onClick={handleTest} disabled={testing} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 flex items-center gap-1 disabled:opacity-50">
                      <TestTube className="w-4 h-4" /> {testing ? "测试..." : "测试"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 p-3 rounded-lg bg-purple-50 border border-purple-100">
                <p className="text-sm font-semibold text-purple-800">📞 AI 通话 — 语音（电话）</p>
                <p className="text-xs text-purple-700">这些设置仅适用于 <b>语音/通话</b> （与聊天分开）。实时语音模型通常位于其自己的 Azure 资源中，因此即使上面的聊天使用其他提供商，其端点和密钥也可以工作。{settings.provider === 'azure' ? "将端点/密钥留空以重复使用聊天端点/密钥。" : "此处均需要端点、部署名称和密钥。"} <b>填写部署名称以启用 Azure 调用。</b> （语音在AI通话设置页面选择 - 使用 <b>马林/雪松</b> 最人性化的声音。）</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">实时端点（可选）</label>
                  <input type="text" value={settings.azureRealtimeEndpoint || ''} onChange={e => setSettings({ ...settings, azureRealtimeEndpoint: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://your-realtime-resource.cognitiveservices.azure.com" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">实时部署名称</label>
                    <input type="text" value={settings.azureRealtimeDeployment || ''} onChange={e => setSettings({ ...settings, azureRealtimeDeployment: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={"例如gpt-实时-2.1"} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">实时API版本</label>
                    <input type="text" value={settings.azureRealtimeApiVersion || ''} onChange={e => setSettings({ ...settings, azureRealtimeApiVersion: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={"2024年10月1日预览"} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2"><Key className="w-4 h-4" /> 实时API密钥（可选）</label>
                  <input type="password" value={settings.azureRealtimeKey || ''} onChange={e => setSettings({ ...settings, azureRealtimeKey: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={settings.provider === 'azure' ? "留空以重复使用聊天密钥" : "Azure 实时资源密钥"} />
                </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">温度({settings.temperature})</label>
                <input type="range" min="0" max="2" step="0.1" value={settings.temperature}
                  onChange={e => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
                  className="w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最大令牌</label>
                <input type="number" value={settings.maxTokens} onChange={e => setSettings({ ...settings, maxTokens: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">语气</label>
                <select value={settings.tone} onChange={e => setSettings({ ...settings, tone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="friendly">友好</option>
                  <option value="professional">专业</option>
                  <option value="formal">正式</option>
                  <option value="casual">休闲</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'prompt' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">系统提示</label>
              <p className="text-xs text-gray-400 mb-2">告诉人工智能它是谁、如何行为以及您的业务是什么</p>
              <textarea value={settings.systemPrompt} onChange={e => setSettings({ ...settings, systemPrompt: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm h-32 resize-y" placeholder={"您是[您的企业]的得力助手......"} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">知识库</label>
              <p className="text-xs text-gray-400 mb-2">添加您的常见问题解答、产品信息、定价、政策 — 人工智能将用它来回答问题</p>
              <textarea value={settings.knowledgeBase} onChange={e => setSettings({ ...settings, knowledgeBase: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm h-48 resize-y" placeholder={"产品： - 产品 A：999 卢比，功能... - 产品 B：1999 卢比，功能... 常见问题解答：问：您的工作时间是几点？答：周一至周六，上午 10 点至下午 7 点（美国标准时间）"} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">知识文件</label>
              <p className="text-xs text-gray-400 mb-2">上传 PDF、Word、Excel、CSV 或文本文件（产品列表、目录、价目表）。人工智能会读取他们的文本并用它来回答。存储图像和视频以供参考，但无法读取其文本。</p>
              <label className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg py-6 cursor-pointer transition-colors ${uploadingKb ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-emerald-300 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50'}`}>
                <Upload className="w-5 h-5" />
                <span className="text-sm font-medium">{uploadingKb ? "正在上传..." : "点击上传文件"}</span>
                <span className="text-[11px] text-gray-400">PDF、DOCX、XLSX、CSV、TXT、图像（每个最大 50MB）</span>
                <input type="file" multiple className="hidden" disabled={uploadingKb}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*,video/mp4"
                  onChange={e => { handleKbUpload(e.target.files); e.currentTarget.value=''; }} />
              </label>
              {kbDocs.length > 0 && (
                <div className="mt-3 space-y-2">
                  {kbDocs.map(d => (
                    <div key={d._id} className="flex items-center gap-3 px-3 py-2 border rounded-lg bg-white">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700 truncate">{d.filename}</div>
                        <div className="text-[11px] text-gray-400">
                          {(d.size/1024).toFixed(0)} KB
                          {d.status === 'ready' && d.chars ? ` · ${d.chars} 读取的字符` : ''}
                          {d.status === 'no_text' ? "·无文字（存储供参考）" : ''}
                          {d.status === 'error' ? "·无法阅读" : ''}
                        </div>
                      </div>
                      <button type="button" onClick={() => handleKbDelete(d._id)} className="text-gray-400 hover:text-red-500 shrink-0" title={"删除"}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'targeting' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">AI应该通过哪些渠道回复？</label>
              <p className="text-xs text-gray-400 mb-3">选择人工智能自动回复处于活动状态的频道。不选中所有选项以在每个通道上启用 AI。</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {channelOptions.map(opt => {
                  const on = settings.targetingRules.channels?.includes(opt.value) || false;
                  return (
                    <label key={opt.value} className={`p-3 rounded-lg border cursor-pointer transition ${on ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="checkbox" className="hidden" checked={on} onChange={() => toggleChannel(opt.value)} />
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">AI应该回复谁？</label>
              <p className="text-xs text-gray-400 mb-3">选择一个或多个类别 - AI 将自动回复所选类别的消息</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {targetOptions.map(opt => {
                  const on = settings.targetingRules.targets?.some(t => t.type === opt.value) || false;
                  if ('unsupported' in opt && opt.unsupported) {
                    return (
                      <div key={opt.value} title={"尚不支持 — 此选项无效"} className="p-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed">
                        <p className="text-sm font-medium text-gray-500">{opt.label}</p>
                        <p className="text-xs text-gray-400">尚不支持 — 此选项无效</p>
                      </div>
                    );
                  }
                  return (
                    <label key={opt.value} className={`p-3 rounded-lg border cursor-pointer transition ${on ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="checkbox" className="hidden" checked={on} onChange={() => toggleTarget(opt.value)} />
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-medium text-gray-700">从 AI 回复中排除：</h4>
              <label className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={settings.targetingRules.excludeAssigned}
                  onChange={e => setSettings({ ...settings, targetingRules: { ...settings.targetingRules, excludeAssigned: e.target.checked } })}
                  className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-gray-700">排除分配给代理的聊天（代理处理，而不是 AI）</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={settings.targetingRules.excludeActiveConversation}
                  onChange={e => setSettings({ ...settings, targetingRules: { ...settings.targetingRules, excludeActiveConversation: e.target.checked } })}
                  className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-gray-700">排除活跃的人类对话（如果客服人员在过去 30 分钟内回复）</span>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">每个功能都有自己的开/关切换。 AI API 密钥在“常规”选项卡中设置 - 如果该密钥丢失或某个功能关闭，该功能将被静默跳过并且面板正常工作。</p>
            {([
              ['voiceToText', "语音留言 → 文本", "自动将客户语音注释转换为文本（需要 OpenAI 提供商）——AI 回复也适用于语音消息"],
              
              ['autoSummary', "对话自动摘要", "✨ 聊天标题中的摘要按钮 — 整个对话的人工智能摘要"],
              ['sentiment', "情绪分析", "😟 在聊天列表中标记不满意的顾客"],
              ['autoTranslate', "自动翻译", "在用其他语言编写的消息下方显示英文翻译"],
              
            ] as [string, string, string][]).map(([key, label, desc]) => {
              const feats = settings.features as unknown as Record<string, boolean>;
              return (
                <div key={key} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="pr-3">
                    <p className="text-sm font-medium text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <button onClick={() => setSettings({ ...settings, features: { ...settings.features, [key]: !feats[key] } })}>
                    {feats[key] ? <ToggleRight className="w-9 h-9 text-emerald-600" /> : <ToggleLeft className="w-9 h-9 text-gray-300" />}
                  </button>
                </div>
              );
            })}
            {settings.features.voiceToText && (
              <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                <label className="block text-sm font-medium text-gray-700 mb-1">🎙 语音回复应该使用哪种语音？</label>
                <select value={settings.features.voiceReplyVoice || 'openai'}
                  onChange={e => setSettings({ ...settings, features: { ...settings.features, voiceReplyVoice: e.target.value } })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  <option value="openai">标准 AI (OpenAI TTS) — 使用“常规”选项卡中的 OpenAI 键</option>
                  <option value="calling_agent">呼叫代理语音 — 来自 AI 呼叫代理的 ElevenLabs / Sarvam / Cartesia 语音</option>
                </select>
                <p className="text-xs text-gray-400 mt-1.5">选择呼叫代理时：AI Calling 下的代理必须配置语音提供商、API 密钥和语音 ID — 相同的语音（最适合印地语）也将在聊天语音回复中说话。如果座席语音失败，则会回退到 OpenAI。</p>
              </div>
            )}
            
          </div>
        )}

        {activeTab === 'handoff' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">切换关键字</label>
              <p className="text-xs text-gray-400 mb-2">当客户输入这些单词时，人工智能会将信息传输给人工代理</p>
              <input type="text" value={settings.handoffRules.keywords?.join(', ')}
                onChange={e => setSettings({ ...settings, handoffRules: { ...settings.handoffRules, keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k) } })}
                className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={"代理人、人、人、帮助、投诉"} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">移交前最大未知回复数</label>
              <input type="number" value={settings.handoffRules.maxUnknownReplies}
                onChange={e => setSettings({ ...settings, handoffRules: { ...settings.handoffRules, maxUnknownReplies: parseInt(e.target.value) } })}
                className="w-full px-3 py-2 border rounded-lg text-sm" min="1" max="10" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">切换消息</label>
              <textarea value={settings.handoffRules.autoHandoffMessage}
                onChange={e => setSettings({ ...settings, handoffRules: { ...settings.handoffRules, autoHandoffMessage: e.target.value } })}
                className="w-full px-3 py-2 border rounded-lg text-sm h-20 resize-y" />
            </div>
            <label className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={settings.handoffRules.detectFrustration}
                onChange={e => setSettings({ ...settings, handoffRules: { ...settings.handoffRules, detectFrustration: e.target.checked } })}
                className="w-4 h-4 text-emerald-600 rounded" />
              <div>
                <span className="text-sm text-gray-700 font-medium">检测挫败感</span>
                <p className="text-xs text-gray-400">当客户显得沮丧或生气时自动切换</p>
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
