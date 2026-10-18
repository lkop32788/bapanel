'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, ToggleLeft, ToggleRight, Play } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { useAuthStore } from '@/stores/authStore';
import { eventApi, predefinedActionApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface PredefinedAction {
  _id: string;
  name: string;
  description: string;
  trigger: string;
  actions: { type: string; value: string; delay: number }[];
  isActive: boolean;
  executionCount: number;
}

interface EventItem {
  _id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  triggerConfig: { webhookUrl: string; schedule: string; eventName: string };
  filters: { tags: string[]; segments: string[] };
  actions: { type: string; config: { value?: string } }[];
  stats: { triggered: number };
  createdAt: string;
}

export default function EventsPage() {
  const { currentWorkspace } = useAuthStore();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<EventItem | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    eventName: 'message_received',
    status: 'active',
    actionType: 'add_tag',
    actionValue: '',
  });
  const [paItems, setPaItems] = useState<PredefinedAction[]>([]);
  const [paModal, setPaModal] = useState(false);
  const [paEdit, setPaEdit] = useState<PredefinedAction | null>(null);
  const [paForm, setPaForm] = useState({ name: '', description: '', trigger: 'manual', actionType: 'send_message', actionValue: '' });

  const paTriggerLabels: Record<string, string> = {
    manual: "手册（运行按钮）",
    on_message: "留言",
    on_subscribe: "订阅（开始回复）",

  };
  const paActionLabels: Record<string, string> = {
    send_message: "发送 WhatsApp 消息",
    send_template: "发送模板",
    add_tag: "添加标签",
    remove_tag: "删除标签",
    assign_agent: "指定代理",
  };

  const fetchPa = () => {
    predefinedActionApi.list().then((r) => setPaItems(r.data.data || [])).catch(() => {});
  };

  const handlePaSave = async () => {
    if (!paForm.name.trim()) { toast.error(translateApiMessage("姓名为必填项")); return; }
    if (!paForm.actionValue.trim()) { toast.error(translateApiMessage("需要操作值")); return; }
    const payload = {
      name: paForm.name,
      description: paForm.description,
      trigger: paForm.trigger,
      actions: [{ type: paForm.actionType, value: paForm.actionValue, delay: 0 }],
    };
    try {
      if (paEdit) await predefinedActionApi.update(paEdit._id, payload);
      else await predefinedActionApi.create(payload);
      toast.success(translateApiMessage(paEdit ? "已更新" : "已创建"));
      setPaModal(false); setPaEdit(null); fetchPa();
    } catch { toast.error(translateApiMessage("操作失败")); }
  };

  const handlePaRun = async (a: PredefinedAction) => {
    const phone = prompt("对哪个联系人运行此操作？输入电话号码（带国家代码）：");
    if (!phone) return;
    try {
      const res = await predefinedActionApi.run(a._id, { phone });
      toast.success(translateApiMessage(res.data.message || "已执行"));
      fetchPa();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "运行失败"));
    }
  };

  const eventTypeMap: Record<string, string> = {
    message_received: 'message_event',
    contact_created: 'contact_event',

    webhook: 'webhook',
  };
  const eventLabels: Record<string, string> = {
    message_received: "已收到消息",
    contact_created: "已创建新联系人",

    webhook: "传入Webhook（来自另一个系统）",
  };
  const actionLabels: Record<string, string> = {
    send_message: "发送 WhatsApp 消息",
    send_template: "发送模板",
    add_tag: "添加标签",
    remove_tag: "删除标签",
  };

  const fetchEvents = () => {
    if (!currentWorkspace) return;
    eventApi
      .getEvents()
      .then((r) => setEvents(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEvents();
    fetchPa();
  }, [currentWorkspace]);

  const handleSave = async () => {
    if (!form.actionValue.trim()) { toast.error(translateApiMessage("需要操作值（消息文本/模板名称/标签名称）")); return; }
    const payload = {
      name: form.name,
      description: form.description,
      status: form.status,
      type: eventTypeMap[form.eventName] || 'custom',
      triggerConfig: { eventName: form.eventName === 'webhook' ? '' : form.eventName },
      actions: [{ type: form.actionType, config: { value: form.actionValue } }],
    };
    try {
      if (editItem) {
        await eventApi.updateEvent(editItem._id, payload);
      } else {
        await eventApi.createEvent(payload);
      }
      toast.success(translateApiMessage(editItem ? "已更新" : "已创建"));
      setShowModal(false);
      setEditItem(null);
      fetchEvents();
    } catch {
      toast.error(translateApiMessage("操作失败"));
    }
  };

  const toggleStatus = async (e: EventItem) => {
    try {
      await eventApi.updateEvent(e._id, {
        status: e.status === 'active' ? 'inactive' : 'active',
      });
      fetchEvents();
    } catch {
      toast.error(translateApiMessage("操作失败"));
    }
  };

  const columns = [
    {
      key: 'name',
      title: "事件名称",
      render: (e: EventItem) => (
        <div>
          <span className="font-medium">{e.name}</span>
          {e.description && (
            <p className="text-xs text-gray-400 mt-0.5">{e.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      title: "当",
      render: (e: EventItem) => (
        <Badge variant="info">{eventLabels[e.triggerConfig?.eventName] || (e.type === 'webhook' ? eventLabels.webhook : e.type)}</Badge>
      ),
    },
    {
      key: 'action',
      title: "然后",
      render: (e: EventItem) => (
        <span className="text-sm text-gray-600">
          {(e.actions || []).map((a) => `${actionLabels[a.type] || a.type}: ${a.config?.value || ''}`).join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'triggered',
      title: "已触发",
      render: (e: EventItem) => (
        <span className="text-sm">{e.stats?.triggered || 0}</span>
      ),
    },
    {
      key: 'status',
      title: "状态",
      render: (e: EventItem) => (
        <button
          onClick={() => toggleStatus(e)}
          className="flex items-center gap-1"
        >
          {e.status === 'active' ? (
            <ToggleRight className="w-5 h-5 text-emerald-600" />
          ) : (
            <ToggleLeft className="w-5 h-5 text-gray-400" />
          )}
          <span className="text-xs">{translateDisplay(e.status)}</span>
        </button>
      ),
    },
    {
      key: 'actions',
      title: '',
      render: (e: EventItem) => (
        <div className="flex gap-1">
          <button
            onClick={() => {
              setEditItem(e);
              setForm({
                name: e.name,
                description: e.description || '',
                eventName: e.type === 'webhook' ? 'webhook' : (e.triggerConfig?.eventName || 'message_received'),
                status: e.status,
                actionType: e.actions?.[0]?.type || 'add_tag',
                actionValue: e.actions?.[0]?.config?.value || '',
              });
              setShowModal(true);
            }}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Edit className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => {
              if (confirm("删除此事件？"))
                eventApi.deleteEvent(e._id).then(() => { fetchEvents(); toast.success(translateApiMessage("事件已删除")); }).catch(() => toast.error(translateApiMessage("删除失败")));
            }}
            className="p-1 hover:bg-red-50 rounded"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">事件触发器</h1>
          <p className="text-sm text-gray-500 mt-1">
            根据事件配置自动操作
          </p>
        </div>
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setEditItem(null);
            setForm({
              name: '',
              description: '',
              eventName: 'message_received',
              status: 'active',
              actionType: 'add_tag',
              actionValue: '',
            });
            setShowModal(true);
          }}
        >
          添加事件
        </Button>
      </div>

      <Table columns={columns} data={events} loading={loading} onBulkDelete={async (ids) => { await Promise.all(ids.map((id) => eventApi.deleteEvent(id).catch(() => null))); fetchEvents(); }} />

      {/* Predefined Actions (merged from /client/predefined-actions) */}
      <div className="flex items-center justify-between mt-8">
        <div>
          <h2 className="text-lg font-bold text-gray-900">预定义动作</h2>
          <p className="text-sm text-gray-500 mt-0.5">可重复使用的操作 - 在任何联系人上手动运行或在消息/订阅/订单/付款上触发</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} variant="secondary" onClick={() => { setPaEdit(null); setPaForm({ name: '', description: '', trigger: 'manual', actionType: 'send_message', actionValue: '' }); setPaModal(true); }}>添加操作</Button>
      </div>
      <div className="space-y-3">
        {paItems.length === 0 ? (
          <div className="bg-white rounded-xl border p-6 text-center text-sm text-gray-400">尚无预定义的操作。</div>
        ) : paItems.map((a) => (
          <div key={a._id} className="bg-white rounded-xl border p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={async () => { try { await predefinedActionApi.update(a._id, { isActive: !a.isActive }); fetchPa(); toast.success(translateApiMessage(a.isActive ? "操作已禁用" : "已启用操作")); } catch { toast.error(translateApiMessage("更新失败")); } }} className="shrink-0">
                {a.isActive ? <ToggleRight className="w-6 h-6 text-emerald-600" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
              </button>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{a.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  <Badge variant="info">{paTriggerLabels[a.trigger] || a.trigger}</Badge>
                  <span className="ml-2">{(a.actions || []).map((x) => `${paActionLabels[x.type] || x.type}: ${x.value || ''}`).join(', ')}</span>
                  <span className="ml-2 text-gray-400">·奔跑 {a.executionCount || 0} 次</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => handlePaRun(a)} className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs hover:bg-emerald-100 flex items-center gap-1" title={"立即在联系人上运行"}><Play className="w-3 h-3" /> 运行</button>
              <button onClick={() => { setPaEdit(a); setPaForm({ name: a.name, description: a.description || '', trigger: a.trigger || 'manual', actionType: a.actions?.[0]?.type || 'send_message', actionValue: a.actions?.[0]?.value || '' }); setPaModal(true); }} className="p-1.5 hover:bg-gray-100 rounded"><Edit className="w-4 h-4 text-gray-400" /></button>
              <button onClick={() => { if (confirm("删除此操作？")) predefinedActionApi.delete(a._id).then(() => { fetchPa(); toast.success(translateApiMessage("操作已删除")); }).catch(() => toast.error(translateApiMessage("删除失败"))); }} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={paModal} onClose={() => { setPaModal(false); setPaEdit(null); }} title={paEdit ? "编辑预定义操作" : "添加预定义操作"}>
        <div className="space-y-4">
          <Input label={"名称"} value={paForm.name} onChange={(e) => setPaForm({ ...paForm, name: e.target.value })} required />
          <Input label={"说明"} value={paForm.description} onChange={(e) => setPaForm({ ...paForm, description: e.target.value })} placeholder={"可选描述"} />
          <Select label={"触发器"} value={paForm.trigger} onChange={(e) => setPaForm({ ...paForm, trigger: e.target.value })}
            options={[
              { value: 'manual', label: "手动（使用“运行”按钮自行运行）" },
              { value: 'on_message', label: "消息（每个客户最多一次/24 小时）" },
              { value: 'on_subscribe', label: "订阅时（客户回复开始）" },

            ]} />
          <Select label={"行动"} value={paForm.actionType} onChange={(e) => setPaForm({ ...paForm, actionType: e.target.value })}
            options={[
              { value: 'send_message', label: "发送 WhatsApp 消息" },
              { value: 'send_template', label: "发送模板" },
              { value: 'add_tag', label: "添加标签" },
              { value: 'remove_tag', label: "删除标签" },
              { value: 'assign_agent', label: "指定代理" },
            ]} />
          <Input
            label={paForm.actionType === 'send_message' ? "消息文本" : paForm.actionType === 'send_template' ? "模板名称（必须获得批准）" : paForm.actionType === 'assign_agent' ? "代理电子邮件或姓名" : "标签名称"}
            value={paForm.actionValue} onChange={(e) => setPaForm({ ...paForm, actionValue: e.target.value })}
            placeholder={paForm.actionType === 'send_message' ? "例如感谢您的订单！" : paForm.actionType === 'send_template' ? "例如kkhs_lead_followup" : paForm.actionType === 'assign_agent' ? "例如代理@company.com" : "例如热销"} required />
          <div className="flex gap-2 pt-2">
            <Button onClick={handlePaSave}>{paEdit ? "更新" : "创建"}</Button>
            <Button variant="secondary" onClick={() => { setPaModal(false); setPaEdit(null); }}>取消</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditItem(null);
        }}
        title={editItem ? "编辑事件" : "添加事件"}
      >
        <div className="space-y-4">
          <Input
            label={"事件名称"}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label={"说明"}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={"可选描述"}
          />
          <Select
            label={"当（触发）"}
            value={form.eventName}
            onChange={(e) => setForm({ ...form, eventName: e.target.value })}
            options={[
              { value: 'message_received', label: "已收到消息（每个客户的第一条消息/24 小时）" },
              { value: 'contact_created', label: "已创建新联系人" },

              { value: 'webhook', label: "传入Webhook（来自另一个系统）" },
            ]}
          />
          <Select
            label={"然后（行动）"}
            value={form.actionType}
            onChange={(e) => setForm({ ...form, actionType: e.target.value })}
            options={[
              { value: 'add_tag', label: "添加标签到联系人" },
              { value: 'remove_tag', label: "从联系人中删除标签" },
              { value: 'send_message', label: "发送 WhatsApp 消息给联系人" },
              { value: 'send_template', label: "发送模板至联系人" },
            ]}
          />
          <Input
            label={form.actionType === 'send_message' ? "消息文本" : form.actionType === 'send_template' ? "模板名称（必须获得批准）" : "标签名称"}
            value={form.actionValue}
            onChange={(e) => setForm({ ...form, actionValue: e.target.value })}
            placeholder={form.actionType === 'send_message' ? "例如感谢您的订单！" : form.actionType === 'send_template' ? "例如kkhs_lead_followup" : "例如热销"}
            required
          />
          {form.eventName === 'webhook' && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
              {editItem
                ? <>Webhook URL： <code className="break-all">{`${typeof window !== 'undefined' ? window.location.origin : ''}/api/events/hook/${editItem._id}`}</code> — 使用 JSON 正文进行 POST {'{ "phone": "91XXXXXXXXXX" }'}</>
                : "首先保存 — 当您编辑此事件时，将显示 webhook URL。"}
            </p>
          )}
          <Select
            label={"状态"}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={[
              { value: 'active', label: "启用" },
              { value: 'inactive', label: "停用" },
            ]}
          />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave}>
              {editItem ? "更新" : "创建"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowModal(false);
                setEditItem(null);
              }}
            >
              取消
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
