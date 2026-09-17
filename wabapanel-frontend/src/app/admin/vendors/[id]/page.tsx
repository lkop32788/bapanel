'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, Users, Megaphone, MessageCircle, LogIn, Calendar } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface VendorDetail {
  vendor: {
    _id: string; name: string; email: string; phone: string; status: string;
    companyName: string; website: string; gstNumber: string; address: string;
     
     createdAt: string; lastLogin?: string;
  };
  stats: { totalMessages: number; messages30d: number; messages7d: number; totalContacts: number; totalCampaigns: number; totalConversations: number };

  recentMessages: { _id: string; text?: string; body?: string; media?: { caption?: string }; template?: { name?: string }; type: string; createdAt: string }[];
}

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<VendorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    adminApi.getVendorDetail(params.id as string)
      .then(res => setData(res.data.data))
      .catch(() => toast.error(translateApiMessage("无法加载商户")))
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleLoginAs = async () => {
    if (!data) return;
    try {
      const res = await adminApi.loginAsVendor(data.vendor._id);
      const { token } = res.data.data;
      // ADM-14: one-time storage key instead of a token in the URL (same tab).
      localStorage.setItem('impersonateToken', token);
      toast.success(translateApiMessage("登录身份" + data.vendor.name));
      window.location.assign('/auth/login?impersonate=1');
    } catch { toast.error(translateApiMessage("操作失败")); }
  };

  if (loading) return <div className="p-6 text-center text-gray-400">加载中…</div>;
  if (!data) return <div className="p-6 text-center text-gray-400">找不到商户</div>;

  const { vendor, stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/admin/vendors')} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{vendor.name}</h1>
          <p className="text-sm text-gray-500">{vendor.email} {vendor.companyName ? `| ${vendor.companyName}` : ''}</p>
        </div>
        <Badge variant={vendor.status === 'active' ? 'success' : 'danger'}>{vendor.status}</Badge>
        <Button size="sm" onClick={handleLoginAs} icon={<LogIn className="w-4 h-4" />}>作为商户登录</Button>
      </div>

      {/* Vendor Info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4"><p className="text-xs text-gray-500">电话</p><p className="font-medium">{vendor.phone || '-'}</p></Card>

      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { icon: <MessageSquare className="w-5 h-5 text-blue-500" />, label: "消息总数", val: stats.totalMessages },
          { icon: <MessageSquare className="w-5 h-5 text-emerald-500" />, label: "消息（30 天）", val: stats.messages30d },
          { icon: <MessageSquare className="w-5 h-5 text-cyan-500" />, label: "消息 (7d)", val: stats.messages7d },
          { icon: <Users className="w-5 h-5 text-purple-500" />, label: "联系人", val: stats.totalContacts },
          { icon: <Megaphone className="w-5 h-5 text-orange-500" />, label: "营销活动", val: stats.totalCampaigns },
          { icon: <MessageCircle className="w-5 h-5 text-pink-500" />, label: "对话", val: stats.totalConversations },
        ].map((s, i) => (
          <Card key={i} className="p-4 text-center">
            <div className="flex justify-center mb-2">{s.icon}</div>
            <p className="text-2xl font-bold">{s.val.toLocaleString()}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Subscriptions */}

        {/* Invoices */}

        {/* Wallet */}

        {/* Recent Messages */}
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-indigo-600" /> 最近的消息</h3>
          {data.recentMessages.length === 0 ? <p className="text-sm text-gray-400">没有消息</p> : (
            <div className="space-y-2">
              {data.recentMessages.map(m => (
                <div key={m._id} className="p-3 bg-gray-50 rounded-lg text-sm">
                  <p className="text-gray-700 line-clamp-2">{m.text || m.media?.caption || m.template?.name || m.body || `[${m.type}]`}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(m.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Vendor Details */}
      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-600" /> 商户详细信息</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-gray-500">网站</p><p className="font-medium">{vendor.website || '-'}</p></div>
          <div><p className="text-gray-500">商品及服务税号</p><p className="font-medium">{vendor.gstNumber || '-'}</p></div>
          <div><p className="text-gray-500">地址</p><p className="font-medium">{vendor.address || '-'}</p></div>
          <div><p className="text-gray-500">已加入</p><p className="font-medium">{new Date(vendor.createdAt).toLocaleDateString()}</p></div>
          <div><p className="text-gray-500">上次登录</p><p className="font-medium">{vendor.lastLogin ? new Date(vendor.lastLogin).toLocaleString() : "从来没有"}</p></div>
        </div>
      </Card>
    </div>
  );
}
