'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Share2, RefreshCw, Eye, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/Card';
import { useAuthStore } from '@/stores/authStore';
import { facebookLeadApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Lead {
  _id: string; name: string; email: string; phone: string; adName: string; formName: string;
  status: string; data: Record<string, string>; createdAt: string;
}

export default function FacebookLeadsPage() {
  const { currentWorkspace } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetch = () => {
    if (!currentWorkspace) return;
    facebookLeadApi.getLeads().then(r => setLeads(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { fetch(); }, [currentWorkspace]);

  const handleSync = async () => {
    if (submitting) return;
    setSubmitting(true);

    setSyncing(true);
    try {
      const r = await facebookLeadApi.syncLeads();
      toast.success(translateApiMessage(r.data?.message || "已同步"));
      fetch();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(err.response?.data?.message || "同步失败"), { duration: 8000 });
    } finally { setSubmitting(false); }
    setSyncing(false);
  };

  const handleExport = () => {
    if (leads.length === 0) { toast.error(translateApiMessage("无导出线索")); return; }
    const rows = [['Name', 'Email', 'Phone', 'Ad Campaign', 'Form', 'Status', 'Date']];
    leads.forEach(l => rows.push([
      l.name || '', l.email || '', l.phone || '', l.adName || '', l.formName || '', l.status || '',
      new Date(l.createdAt).toLocaleString(),
    ]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `facebook-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    converted: leads.filter(l => l.status === 'converted').length,
  };

  const columns = [
    { key: 'name', title: "名称", render: (l: Lead) => <span className="font-medium">{l.name}</span> },
    { key: 'email', title: "邮箱", render: (l: Lead) => <span className="text-sm text-gray-500">{l.email}</span> },
    { key: 'phone', title: "电话", render: (l: Lead) => l.phone },
    { key: 'adName', title: "广告活动", render: (l: Lead) => <span className="text-sm">{l.adName}</span> },
    { key: 'formName', title: "表格", render: (l: Lead) => <span className="text-sm text-gray-500">{l.formName}</span> },
    { key: 'status', title: "状态", render: (l: Lead) => <Badge variant={l.status === 'converted' ? 'success' : l.status === 'contacted' ? 'info' : 'warning'}>{l.status}</Badge> },
    { key: 'date', title: "日期", render: (l: Lead) => new Date(l.createdAt).toLocaleDateString() },
    { key: 'actions', title: '', render: (l: Lead) => <button onClick={() => setSelected(l)} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-4 h-4 text-gray-400" /></button> },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Facebook 领先</h1>
        <p className="text-sm mt-1">将 Facebook 潜在客户广告直接同步到您的联系人中</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Download className="w-4 h-4" />} onClick={handleExport}>出口</Button>
          <Button icon={<RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />} onClick={handleSync} loading={syncing}>同步线索</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title={"潜在客户总数"} value={stats.total} icon={<Share2 className="w-5 h-5" />} color="blue" />
        <StatCard title={"新"} value={stats.new} icon={<Share2 className="w-5 h-5" />} color="yellow" />
        <StatCard title={"已联系"} value={stats.contacted} icon={<Share2 className="w-5 h-5" />} color="blue" />
        <StatCard title={"已转换"} value={stats.converted} icon={<Share2 className="w-5 h-5" />} color="green" />
      </div>

      <Table columns={columns} data={leads} loading={loading} />

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={"线索详细信息"} size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">姓名：</span> <span className="font-medium">{selected.name}</span></div>
              <div><span className="text-gray-500">电子邮件：</span> <span className="font-medium">{selected.email}</span></div>
              <div><span className="text-gray-500">电话：</span> <span className="font-medium">{selected.phone}</span></div>
              <div><span className="text-gray-500">状态：</span> <Badge variant={selected.status === 'converted' ? 'success' : 'info'}>{selected.status}</Badge></div>
              <div><span className="text-gray-500">广告：</span> <span>{selected.adName}</span></div>
              <div><span className="text-gray-500">表格：</span> <span>{selected.formName}</span></div>
            </div>
            {selected.data && Object.keys(selected.data).length > 0 && (
              <div><h4 className="font-medium mb-2">表单数据</h4><div className="bg-gray-50 rounded-lg p-3 space-y-1">{Object.entries(selected.data).map(([k, v]) => <div key={k} className="flex justify-between text-sm"><span className="text-gray-500">{k}:</span><span>{v}</span></div>)}</div></div>
            )}
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setSelected(null)}>关闭</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
