'use client';
import { translateDisplay } from '@/lib/zhDisplay';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Trash2, Users, UserPlus, ShieldCheck, LogIn, Pencil } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { teamApi } from '@/lib/api';
import { PERMISSION_TREE } from '@/components/layout/ClientSidebar';
import { ChevronDown, ChevronRight } from 'lucide-react';

import toast from 'react-hot-toast';

interface Agent { _id: string; name: string; email: string; phone?: string; role: string; status: string; avatar?: string; lastActive?: string; conversationsHandled?: number; permissions?: string[]; allowedChannels?: string[]; inboxScope?: string; maskNumbers?: boolean; }

// Expandable permission tree: check a section to grant the whole menu, or expand
// it to grant only specific sub-pages.
function PermTree({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState<string[]>([]);
  const toggleModule = (key: string) => {
    if (value.includes(key)) onChange(value.filter(x => x !== key));
    else {
      const childHrefs = (PERMISSION_TREE.find(s => s.moduleKey === key)?.children || []).map(c => c.href);
      onChange([...value.filter(x => !childHrefs.includes(x) && x !== key), key]);
    }
  };
  const toggleChild = (href: string) =>
    onChange(value.includes(href) ? value.filter(x => x !== href) : [...value, href]);
  return (
    <div className="space-y-1">
      {PERMISSION_TREE.map(sec => {
        const secChecked = value.includes(sec.moduleKey);
        const childGranted = sec.children.some(c => value.includes(c.href));
        const expanded = open.includes(sec.label);
        return (
          <div key={sec.label} className="border rounded-lg bg-white">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <input type="checkbox" checked={secChecked}
                ref={el => { if (el) el.indeterminate = !secChecked && childGranted; }}
                className="w-3.5 h-3.5 accent-indigo-600" onChange={() => toggleModule(sec.moduleKey)} />
              <span className="text-xs text-gray-700 flex-1 cursor-pointer" onClick={() => toggleModule(sec.moduleKey)}>{translateDisplay(sec.label)}</span>
              {sec.children.length > 0 && (
                <button type="button" onClick={() => setOpen(o => o.includes(sec.label) ? o.filter(x => x !== sec.label) : [...o, sec.label])}
                  className="p-0.5 text-gray-400 hover:text-gray-600">
                  {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            {expanded && sec.children.length > 0 && (
              <div className="pl-7 pr-2 pb-2 grid grid-cols-1 gap-1">
                {sec.children.map(c => (
                  <label key={c.href} className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={secChecked || value.includes(c.href)} disabled={secChecked}
                      className="w-3 h-3 accent-indigo-600" onChange={() => toggleChild(c.href)} />
                    {translateDisplay(c.label)}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CHANNEL_OPTIONS = [
  { key: 'whatsapp', label: "WhatsApp（云API）" },
  { key: 'whatsapp_qr', label: "WhatsApp (二维码)" },
  { key: 'facebook', label: 'Facebook Messenger' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'telegram', label: "电报机器人" },
  { key: 'telegram_personal', label: "电报个人" },
  { key: 'email', label: "邮箱" },
];

interface Perf { _id: string; name: string; email: string; role: string; assignedChats: number; resolvedChats: number; messagesSent: number; avgResponseMins: number | null; }
interface Team { _id: string; name: string; members: Agent[]; description?: string; }

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [perf, setPerf] = useState<Perf[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [agentForm, setAgentForm] = useState({ name: '', email: '', password: '', phone: '', role: 'agent' });
  const [agentPerms, setAgentPerms] = useState<string[]>([]);
  const [agentChans, setAgentChans] = useState<string[]>([]);
  const [agentScope, setAgentScope] = useState<string>('all');
  const [agentMask, setAgentMask] = useState(false);
  const [permAgent, setPermAgent] = useState<Agent | null>(null);
  const [permEdit, setPermEdit] = useState<string[]>([]);
  const [chanEdit, setChanEdit] = useState<string[]>([]);
  const [scopeEdit, setScopeEdit] = useState<string>('all');
  const [maskEdit, setMaskEdit] = useState(false);
  const [phoneEdit, setPhoneEdit] = useState<string>('');
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', password: '', status: 'active' });
  const [teamForm, setTeamForm] = useState({ name: '', description: '', members: [] as string[] });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([teamApi.listAgents(), teamApi.list()]).then(([agRes, tmRes]) => {
      setAgents(agRes.data.data || []);
      setTeams(tmRes.data.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
    teamApi.performance().then(r => setPerf(r.data.data || [])).catch(() => {});
  }, []);

  const handleAddAgent = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      await teamApi.addAgent({ ...agentForm, permissions: agentPerms, allowedChannels: agentChans, inboxScope: agentScope, maskNumbers: agentMask });
      toast.success(translateApiMessage("已添加代理"));
      setShowAgentModal(false);
      setAgentForm({ name: '', email: '', password: '', phone: '', role: 'agent' });
      setAgentPerms([]); setAgentChans([]); setAgentScope('all');
      teamApi.listAgents().then(r => setAgents(r.data.data || []));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTeam = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await teamApi.create(teamForm);
      toast.success(translateApiMessage("团队已创建"));
      setShowTeamModal(false);
      teamApi.list().then(r => setTeams(r.data.data || []));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { key: 'name', title: "客服", render: (a: Agent) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-semibold text-sm">{a.name?.charAt(0)}</div>
        <div>
          <p className="font-medium text-gray-900">{a.name}</p>
          <p className="text-xs text-gray-400">{a.email}</p>
        </div>
      </div>
    )},
    { key: 'role', title: "角色", render: (a: Agent) => <Badge variant={a.role === 'admin' ? 'info' : 'default'}>{a.role}</Badge> },
    { key: 'status', title: "状态", render: (a: Agent) => (
      <Badge variant={a.status === 'active' ? 'success' : 'default'}>{a.status || "活跃"}</Badge>
    )},
    { key: 'conversations', title: "对话", render: (a: Agent) => a.conversationsHandled || 0 },
    { key: 'permissions', title: "访问", render: (a: Agent) => (
      <span className="text-xs text-gray-500">{(a.permissions?.length || 0) > 0 ? `${a.permissions!.length} 模块` : "完全访问"}</span>
    )},
    { key: 'actions', title: '', render: (a: Agent) => (
      <div className="flex gap-1">
        <button title={"权限 — 控制该代理可以访问哪些模块"} onClick={() => { setPermAgent(a); setPermEdit(a.permissions || []); setChanEdit(a.allowedChannels || []); setScopeEdit(a.inboxScope || 'all'); setMaskEdit(!!a.maskNumbers); setPhoneEdit(a.phone || ''); }}
          className="p-1 hover:bg-indigo-50 rounded"><ShieldCheck className="w-4 h-4 text-indigo-500" /></button>
        <button title={"编辑个人资料 — 姓名、电子邮件、手机号码、密码"} onClick={() => {
          setEditAgent(a);
          setEditForm({ name: a.name || '', email: a.email || '', phone: a.phone || '', password: '', status: a.status || 'active' });
        }} className="p-1 hover:bg-blue-50 rounded"><Pencil className="w-4 h-4 text-blue-500" /></button>
        <button title={"作为该代理登录"} onClick={async () => {
          try {
            const res = await teamApi.loginAsAgent(a._id);
            const { token, user } = res.data.data;
            window.open(`/auth/login?token=${token}&name=${encodeURIComponent(user.name)}`, '_blank');
            toast.success(translateApiMessage(`登录身份 ${a.name}`));
          } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } };
            toast.error(translateApiMessage(error.response?.data?.message || "无法以代理身份登录"));
          }
        }} className="p-1 hover:bg-emerald-50 rounded"><LogIn className="w-4 h-4 text-emerald-500" /></button>
        <button onClick={async () => {
          if (!confirm("删除该代理账户？他们将无法再登录。")) return;
          try {
            await teamApi.removeAgent(a._id);
            toast.success(translateApiMessage("代理已删除"));
            teamApi.listAgents().then(r => setAgents(r.data.data || []));
          } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } } };
            toast.error(translateApiMessage(error.response?.data?.message || "删除代理失败"));
          }
        }}
          className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">团队和代理</h1>
          <p className="text-gray-500 text-sm mt-1">管理团队成员</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Users className="w-4 h-4" />} onClick={() => setShowTeamModal(true)}>新团队</Button>
          <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => { setAgentForm({ name: '', email: '', password: '', phone: '', role: 'agent' }); setAgentPerms([]); setAgentChans([]); setAgentScope('all'); setShowAgentModal(true); }}>添加代理</Button>
        </div>
      </div>

      {/* Teams */}
      {teams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => (
            <Card key={team._id}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{team.name}</h3>
                  <p className="text-xs text-gray-500">{team.members?.length || 0} 成员</p>
                </div>
              </div>
              <div className="flex -space-x-2">
                {(team.members || []).slice(0, 5).map((m, i) => (
                  <div key={i} className="w-7 h-7 bg-gray-200 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium">{m.name?.charAt(0)}</div>
                ))}
                {(team.members?.length || 0) > 5 && <div className="w-7 h-7 bg-gray-100 rounded-full border-2 border-white flex items-center justify-center text-xs">+{team.members.length - 5}</div>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Agents Table */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">所有代理</h3>
        <Table columns={columns} data={agents} loading={loading} emptyText={"尚未添加代理"} />
      </Card>

      {/* Agent Performance */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">代理绩效</h3>
        <p className="text-xs text-gray-400 mb-4">过去 30 天 — 分配的聊天、已解决的聊天、发送的消息和平均回复时间</p>
        <Table
          columns={[
            { key: 'name', title: "客服", render: (p: Perf) => (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-semibold text-xs">{p.name?.charAt(0)}</div>
                <span className="font-medium text-gray-900">{p.name}</span>
              </div>
            )},
            { key: 'assignedChats', title: "指定的聊天", render: (p: Perf) => p.assignedChats },
            { key: 'resolvedChats', title: "已解决（30天）", render: (p: Perf) => p.resolvedChats },
            { key: 'messagesSent', title: "已发送消息（30 天）", render: (p: Perf) => p.messagesSent },
            { key: 'avgResponseMins', title: "平均回复时间", render: (p: Perf) => p.avgResponseMins == null ? '—' : p.avgResponseMins < 60 ? `${p.avgResponseMins} min` : `${Math.round(p.avgResponseMins / 6) / 10} hr` },
          ]}
          data={perf}
          loading={loading}
          emptyText={"尚未有代理活动"}
        />
      </Card>

      {/* Add Agent Modal */}
      <Modal isOpen={showAgentModal} onClose={() => setShowAgentModal(false)} title={"添加代理"}>
        <div className="space-y-4">
          <Input label={"名称"} value={agentForm.name} onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} required />
          <Input label={"邮箱"} type="email" value={agentForm.email} onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })} required />
          <Input label={"密码"} type="password" value={agentForm.password} onChange={(e) => setAgentForm({ ...agentForm, password: e.target.value })} required />
          <Input label={"WhatsApp 号码（用于后续警报）"} value={agentForm.phone} onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })} placeholder="e.g. 9876543210" />
          {agentForm.role === 'agent' && (
            <div className="border rounded-lg p-3 bg-indigo-50/40 border-indigo-100">
              <p className="text-xs font-medium text-gray-700 mb-1">模块访问（可选）</p>
              <p className="text-[11px] text-gray-400 mb-2">勾选菜单以进行完全访问，或展开菜单 (›) 以仅允许特定子页面。不选中所有内容即可获得完全访问权限。</p>
              <div className="max-h-72 overflow-y-auto pr-1">
                <PermTree value={agentPerms} onChange={setAgentPerms} />
              </div>
            </div>
          )}
          {agentForm.role === 'agent' && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">该客服人员可以看到的频道</p>
              <p className="text-xs text-gray-400 mb-2">不选中所有通道以允许每个通道。</p>
              <div className="grid grid-cols-2 gap-2">
                {CHANNEL_OPTIONS.map(c => (
                  <label key={c.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer border rounded-lg px-3 py-2 hover:bg-gray-50">
                    <input type="checkbox" checked={agentChans.includes(c.key)} className="w-4 h-4 accent-indigo-600"
                      onChange={() => setAgentChans(p => p.includes(c.key) ? p.filter(x => x !== c.key) : [...p, c.key])} />
                    {translateDisplay(c.label)}
                  </label>
                ))}
              </div>
            </div>
          )}
          {agentForm.role === 'agent' && (
            <>
              <Select label={"聊天可见性"} value={agentScope} onChange={(e) => setAgentScope(e.target.value)}
                options={[{ value: 'all', label: "所有聊天" }, { value: 'assigned', label: "仅分配给该客服人员的聊天" }]} />
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer border rounded-lg px-3 py-2 hover:bg-gray-50">
                <input type="checkbox" checked={agentMask} className="w-4 h-4 mt-0.5 accent-indigo-600"
                  onChange={() => setAgentMask(v => !v)} />
                <span>
                  隐藏客户号码（号码屏蔽）
                  <span className="block text-xs text-gray-400">代理在聊天、联系人、CRM、导出和 API 中看到 91*****500，而不是完整数字。</span>
                </span>
              </label>
            </>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowAgentModal(false)}>取消</Button>
            <Button onClick={handleAddAgent}>添加代理</Button>
          </div>
        </div>
      </Modal>

      {/* Agent Permissions Modal */}
      <Modal isOpen={!!permAgent} onClose={() => setPermAgent(null)} title={`权限 — ${permAgent?.name || ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">勾选菜单以进行完全访问，或展开菜单 (›) 以仅允许特定子页面。如果未选择任何内容，则代理具有对所有模块的完全访问权限。</p>
          <div className="max-h-72 overflow-y-auto pr-1">
            <PermTree value={permEdit} onChange={setPermEdit} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">该客服人员可以看到的频道</p>
            <p className="text-xs text-gray-400 mb-2">不选中所有通道以允许每个通道。</p>
            <div className="grid grid-cols-2 gap-2">
              {CHANNEL_OPTIONS.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer border rounded-lg px-3 py-2 hover:bg-gray-50">
                  <input type="checkbox" checked={chanEdit.includes(c.key)} className="w-4 h-4 accent-indigo-600"
                    onChange={() => setChanEdit(p => p.includes(c.key) ? p.filter(x => x !== c.key) : [...p, c.key])} />
                  {translateDisplay(c.label)}
                </label>
              ))}
            </div>
          </div>
          <Select label={"聊天可见性"} value={scopeEdit} onChange={(e) => setScopeEdit(e.target.value)}
            options={[{ value: 'all', label: "所有聊天" }, { value: 'assigned', label: "仅分配给该客服人员的聊天" }]} />
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer border rounded-lg px-3 py-2 hover:bg-gray-50">
            <input type="checkbox" checked={maskEdit} className="w-4 h-4 mt-0.5 accent-indigo-600"
              onChange={() => setMaskEdit(v => !v)} />
            <span>
              隐藏客户号码（号码屏蔽）
              <span className="block text-xs text-gray-400">代理在聊天、联系人、CRM、导出和 API 中看到 91*****500，而不是完整数字。</span>
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPermAgent(null)}>取消</Button>
            <Button onClick={async () => {
              if (!permAgent) return;
              try {
                await teamApi.updateAgent(permAgent._id, { permissions: permEdit, allowedChannels: chanEdit, inboxScope: scopeEdit, maskNumbers: maskEdit, phone: phoneEdit });
                toast.success(translateApiMessage("权限已更新 — 代理将在下次登录或页面刷新时看到更改"));
                setPermAgent(null);
                teamApi.listAgents().then(r => setAgents(r.data.data || []));
              } catch { toast.error(translateApiMessage("更新权限失败")); }
            }}>保存权限</Button>
          </div>
        </div>
      </Modal>

      {/* Agent Profile Modal */}
      <Modal isOpen={!!editAgent} onClose={() => setEditAgent(null)} title={`编辑代理 — ${editAgent?.name || ''}`}>
        <div className="space-y-4">
          <Input label={"名称"} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <Input label={"电子邮件（登录）"} type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          <Input label={"WhatsApp 号码（用于后续警报）"} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="e.g. 9876543210" />
          <Input label={"新密码（留空保留当前密码）"} type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
          <Select label={"状态"} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
            options={[{ value: 'active', label: "启用" }, { value: 'suspended', label: "已暂停（无法登录）" }]} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditAgent(null)}>取消</Button>
            <Button disabled={submitting} onClick={async () => {
              if (!editAgent) return;
              setSubmitting(true);
              try {
                await teamApi.updateAgent(editAgent._id, {
                  name: editForm.name, email: editForm.email, phone: editForm.phone,
                  status: editForm.status, ...(editForm.password ? { password: editForm.password } : {}),
                });
                toast.success(translateApiMessage("代理已更新"));
                setEditAgent(null);
                teamApi.listAgents().then(r => setAgents(r.data.data || []));
              } catch (err: unknown) {
                const error = err as { response?: { data?: { message?: string } } };
                toast.error(translateApiMessage(error.response?.data?.message || "无法更新代理"));
              } finally { setSubmitting(false); }
            }}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* Create Team Modal */}
      <Modal isOpen={showTeamModal} onClose={() => setShowTeamModal(false)} title={"创建团队"}>
        <div className="space-y-4">
          <Input label={"团队名称"} value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} required />
          <Input label={"说明"} value={teamForm.description} onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })} />
          {agents.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">选择成员</label>
              <div className="flex flex-wrap gap-2">
                {agents.map(a => (
                  <button key={a._id} onClick={() => setTeamForm({ ...teamForm, members: teamForm.members.includes(a._id) ? teamForm.members.filter(x => x !== a._id) : [...teamForm.members, a._id] })}
                    className={`px-3 py-1 text-xs rounded-full border ${teamForm.members.includes(a._id) ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200'}`}>
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowTeamModal(false)}>取消</Button>
            <Button onClick={handleCreateTeam}>创建团队</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
