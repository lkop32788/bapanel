'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import { zhNavigation } from '@/lib/zhNavigation';
import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { PERMISSION_TREE } from '@/components/layout/ClientSidebar';

const ROLES = ['admin', 'user', 'agent', 'super_admin'];
const ROLE_LABELS: Record<string, string> = {
  admin: '管理员', user: '用户', agent: '客服', super_admin: '超级管理员',
};
const ACTION_LABELS: Record<string, string> = {
  view: '查看', create: '创建', edit: '编辑', delete: '删除',
};
const LEGACY_LABELS: Record<string, string> = {
  dashboard: '仪表盘', chat: '聊天', analytics: '数据分析', contacts: '联系人',
  segments: '联系人分组', tags: '标签', templates: '消息模板', broadcasts: '群发消息',
  drips: '分阶段营销', automations: '自动化流程', whatsapp: 'WhatsApp 设置',
  forms: '获客表单', shortLinks: '短链接', agents: '客服管理', teams: '团队管理',
  settings: '设置', campaigns: 'BMS群发与普通群发',
};


// Legacy module keys that roles may already have stored against them.
const LEGACY_MODULES = [
  'dashboard', 'chat', 'analytics', 'contacts', 'segments', 'tags', 'templates',
  'broadcasts', 'drips', 'automations', 'whatsapp', 'forms', 'shortLinks',
  'agents', 'teams',   'settings',  
];

// The rest of the rows come from the live client menu, so every feature added
// to the panel shows up here without touching this page again.
const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_TREE.map(s => [s.moduleKey, s.label])
);
const MODULES = Array.from(new Set([...PERMISSION_TREE.map(s => s.moduleKey), ...LEGACY_MODULES]));
const ACTIONS = ['view', 'create', 'edit', 'delete'];
const moduleLabel = (key: string) => LEGACY_LABELS[key] || zhNavigation[MODULE_LABELS[key]] || MODULE_LABELS[key] || key;

type PermissionsData = Record<string, Record<string, Record<string, boolean>>>;

export default function PermissionsPage() {
  const [permissions, setPermissions] = useState<PermissionsData>({});
  const [selectedRole, setSelectedRole] = useState('user');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getPermissions().then(r => {
      const raw = r.data.data;
      const data: PermissionsData = {};
      if (Array.isArray(raw)) {
        raw.forEach((p: { role?: string; permissions?: Record<string, Record<string, boolean>> }) => {
          if (p?.role) data[p.role] = p.permissions || {};
        });
      } else if (raw && typeof raw === 'object') {
        Object.assign(data, raw);
      }
      const perms: PermissionsData = {};
      ROLES.forEach(role => {
        perms[role] = {};
        MODULES.forEach(mod => {
          perms[role][mod] = {};
          ACTIONS.forEach(act => { perms[role][mod][act] = data[role]?.[mod]?.[act] ?? (role === 'super_admin'); });
        });
      });
      setPermissions(perms);
    }).catch(() => {
      const perms: PermissionsData = {};
      ROLES.forEach(role => {
        perms[role] = {};
        MODULES.forEach(mod => {
          perms[role][mod] = {};
          ACTIONS.forEach(act => { perms[role][mod][act] = role === 'super_admin' || (role !== 'agent' && act === 'view'); });
        });
      });
      setPermissions(perms);
    }).finally(() => setLoading(false));
  }, []);

  const togglePermission = (mod: string, act: string) => {
    setPermissions(prev => ({
      ...prev, [selectedRole]: {
        ...prev[selectedRole], [mod]: { ...prev[selectedRole][mod], [act]: !prev[selectedRole][mod][act] }
      }
    }));
  };

  const setAll = (val: boolean) => {
    setPermissions(prev => {
      const rolePerms: Record<string, Record<string, boolean>> = {};
      MODULES.forEach(mod => { rolePerms[mod] = {}; ACTIONS.forEach(act => { rolePerms[mod][act] = val; }); });
      return { ...prev, [selectedRole]: rolePerms };
    });
  };

  const setAllForAction = (act: string, val: boolean) => {
    setPermissions(prev => {
      const rolePerms = { ...prev[selectedRole] };
      MODULES.forEach(mod => { rolePerms[mod] = { ...rolePerms[mod], [act]: val }; });
      return { ...prev, [selectedRole]: rolePerms };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updatePermissions({ role: selectedRole, permissions: permissions[selectedRole] });
      toast.success(translateApiMessage("权限已保存"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    }
    setSaving(false);
  };

  if (loading) return <div className="text-center py-8 text-gray-400">加载中…</div>;

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">权限控制</h1><p className="text-gray-500 text-sm mt-1">按角色设置各功能的查看、创建、编辑和删除权限</p></div>
        <Button icon={<Save className="w-4 h-4" />} onClick={handleSave} loading={saving}>保存更改</Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {ROLES.map(role => (
          <button key={role} onClick={() => setSelectedRole(role)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${selectedRole === role ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {ROLE_LABELS[role]}
          </button>
        ))}
        {selectedRole !== 'super_admin' && (
          <div className="flex gap-2 ml-auto">
            <button onClick={() => setAll(true)} className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">全选</button>
            <button onClick={() => setAll(false)} className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">取消全选</button>
          </div>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">模块</th>
                {ACTIONS.map(act => {
                  const allChecked = MODULES.every(mod => permissions[selectedRole]?.[mod]?.[act]);
                  return (
                    <th key={act} className="text-center py-3 px-4 text-sm font-semibold text-gray-700 capitalize">
                      <div className="flex flex-col items-center gap-1">
                        {ACTION_LABELS[act]}
                        <input type="checkbox" title={`全选${ACTION_LABELS[act]}权限`} aria-label={`全选${ACTION_LABELS[act]}权限`} checked={allChecked} onChange={e => setAllForAction(act, e.target.checked)}
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" disabled={selectedRole === 'super_admin'} />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {MODULES.map(mod => (
                <tr key={mod} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-medium capitalize text-gray-800">{moduleLabel(mod)}</td>
                  {ACTIONS.map(act => (
                    <td key={act} className="text-center py-3 px-4">
                      <input type="checkbox" aria-label={`${moduleLabel(mod)}：${ACTION_LABELS[act]}`} checked={permissions[selectedRole]?.[mod]?.[act] || false} onChange={() => togglePermission(mod, act)}
                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                        disabled={selectedRole === 'super_admin'} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
