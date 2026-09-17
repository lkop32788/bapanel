'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { botFlowApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface ReportRow {
  phone: string; name: string; flows: string;
  botMessages: number; replies: number; firstAt: string; lastAt: string;
}
interface Report {
  totals: { numbers: number; botMessages: number; replies: number; truncated: boolean };
  flows: { name: string; numbers: number; botMessages: number }[];
  rows: ReportRow[];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const shown = (v: string) => (v ? new Date(v).toLocaleString() : '');

export default function BotFlowReport({
  isOpen, onClose, flows,
}: {
  isOpen: boolean;
  onClose: () => void;
  flows: { _id: string; name: string }[];
}) {
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(ymd(new Date()));
  const [flowId, setFlowId] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [report, setReport] = useState<Report | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await botFlowApi.report({ from, to, flowId });
      setReport(res.data.data);
    } catch {
      toast.error(translateApiMessage("无法加载报告"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isOpen) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isOpen]);

  const download = async (format: 'excel' | 'pdf') => {
    setExporting(format);
    try {
      const res = await botFlowApi.reportFile({ from, to, flowId, format });
      const type = format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const url = URL.createObjectURL(new Blob([res.data], { type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `bot-flow-number-report-${from}_to_${to}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(translateApiMessage("导出失败"));
    } finally {
      setExporting('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={"机器人流量报告（按数字）"} size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Input label={"来自"} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label={"至"} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Select label={"机器人流程"} value={flowId} onChange={(e) => setFlowId(e.target.value)}
            options={[{ value: '', label: "所有流" }, ...flows.map((f) => ({ value: f._id, label: f.name }))]} />
          <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={load} disabled={loading}>
            {loading ? "加载中…" : "申请"}
          </Button>
        </div>

        {report && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-gray-50 border">
                <p className="text-xs text-gray-500">数字</p>
                <p className="text-xl font-semibold">{report.totals.numbers}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 border">
                <p className="text-xs text-gray-500">机器人消息</p>
                <p className="text-xl font-semibold">{report.totals.botMessages}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 border">
                <p className="text-xs text-gray-500">客户回复</p>
                <p className="text-xl font-semibold">{report.totals.replies}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button icon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => download('excel')} disabled={!!exporting}>
                {exporting === 'excel' ? "准备中……" : "导出Excel"}
              </Button>
              <Button variant="secondary" icon={<FileText className="w-4 h-4" />} onClick={() => download('pdf')} disabled={!!exporting}>
                {exporting === 'pdf' ? "准备中……" : "导出 PDF"}
              </Button>
            </div>

            <div className="max-h-[45vh] overflow-auto border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-gray-600">
                    <th className="px-3 py-2">号码</th>
                    <th className="px-3 py-2">名称</th>
                    <th className="px-3 py-2">机器人流程</th>
                    <th className="px-3 py-2 text-right">机器人消息</th>
                    <th className="px-3 py-2 text-right">回复</th>
                    <th className="px-3 py-2">第一个活动</th>
                    <th className="px-3 py-2">上次活动</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.phone} className="border-t">
                      <td className="px-3 py-2 font-medium">{r.phone}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-gray-600">{r.flows}</td>
                      <td className="px-3 py-2 text-right">{r.botMessages}</td>
                      <td className="px-3 py-2 text-right">{r.replies}</td>
                      <td className="px-3 py-2 text-gray-500">{shown(r.firstAt)}</td>
                      <td className="px-3 py-2 text-gray-500">{shown(r.lastAt)}</td>
                    </tr>
                  ))}
                  {!report.rows.length && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">在此期间没有机器人流活动</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {report.totals.truncated && (
              <p className="text-xs text-amber-600">显示最近的 20,000 个数字 — 缩小较小报告的日期范围。</p>
            )}
            <p className="text-xs text-gray-500">
              仅对机器人流发送的消息进行计数。在此更新之前发送的较旧消息计入总数，但显示空白流名称。
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
