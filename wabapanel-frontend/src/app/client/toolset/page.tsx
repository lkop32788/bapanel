'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState } from 'react';
import { Bot, Link2, Copy, ExternalLink, MessageSquare, Zap, Settings, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ToolsetPage() {
  const [chatbotEnabled, setChatbotEnabled] = useState(false);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const generatedLink = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}${message ? `?text=${encodeURIComponent(message)}` : ''}` : '';

  return (
    <div className="space-y-6">
      <div>
        <div className="page-hero">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">工具箱</h1>
        <p className="text-sm text-gray-500 mt-1">聊天机器人工具和 WhatsApp 链接生成器</p>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chatbot Section */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Bot className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">聊天机器人</h2>
                <p className="text-xs text-gray-500">自动回复客户消息</p>
              </div>
            </div>
            <button onClick={() => setChatbotEnabled(!chatbotEnabled)} className={`relative w-12 h-6 rounded-full transition-colors ${chatbotEnabled ? 'bg-emerald-600' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${chatbotEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            启用后，聊天机器人将使用您配置的关键字和快速回复自动响应传入消息。
          </p>

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">管理自动回复：</p>
            <a href="/client/keywords" className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 group">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">关键词</p>
                  <p className="text-xs text-gray-500">检测到特定关键字时自动回复</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
            </a>
            <a href="/client/quick-replies" className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 group">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">快捷回复</p>
                  <p className="text-xs text-gray-500">预先保存的聊天回复模板</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
            </a>
            <a href="/client/automations" className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 group">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">自动化</p>
                  <p className="text-xs text-gray-500">构建复杂的自动回复流程</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
            </a>
          </div>
        </div>

        {/* WhatsApp Link Generator */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">WhatsApp 链接生成器</h2>
              <p className="text-xs text-gray-500">创建直接聊天链接</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">电话号码 *</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder={"919876543210（有国家代码，无+）"} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">预先填写的消息（可选）</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                placeholder={"嗨，我对你们的服务感兴趣......"} />
            </div>

            {generatedLink && (
              <div className="bg-gray-50 rounded-lg p-3 border">
                <p className="text-xs text-gray-500 mb-1">生成的链接：</p>
                <div className="flex items-center gap-2">
                  <input type="text" value={generatedLink} readOnly className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white" />
                  <button onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success(translateApiMessage("链接已复制！")); }}
                    className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700" title={"复制"}>
                    <Copy className="w-4 h-4" />
                  </button>
                  <a href={generatedLink} target="_blank" rel="noopener noreferrer"
                    className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200" title={"打开"}>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
