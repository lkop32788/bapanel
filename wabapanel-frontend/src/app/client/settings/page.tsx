'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState } from 'react';
import { Save, User, Globe } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import AccountSecurity from '@/components/AccountSecurity';

import { useAuthStore } from '@/stores/authStore';
import { authApi, workspaceApi } from '@/lib/api';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user, currentWorkspace, updateUser } = useAuthStore();
  const [profile, setProfile] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '' });
  const [wsSettings, setWsSettings] = useState({
    name: currentWorkspace?.name || '', timezone: currentWorkspace?.timezone || 'Asia/Kolkata',
     
  });

  const [saving, setSaving] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const handleProfileSave = async () => {
    if (submitting) return;
    setSaving(true);
    setSubmitting(true);
    try {
      const res = await authApi.updateProfile(profile);
      updateUser(res.data.data);
      toast.success(translateApiMessage("个人资料已更新"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    } finally {
      setSubmitting(false);
    }
    setSaving(false);
  };

  const handleWorkspaceSave = async () => {
    if (submitting) return;
    if (!currentWorkspace) return;
    setSaving(true);
    setSubmitting(true);
    try {
      await workspaceApi.update(currentWorkspace._id, wsSettings);
      toast.success(translateApiMessage("业务设置已更新"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "操作失败"));
    } finally {
      setSubmitting(false);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="page-hero">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">设置</h1>
        <p className="text-gray-500 text-sm mt-1">管理您的账户和业务</p>
        </div>
        </div>
      </div>

      <Tabs tabs={[
        { key: 'profile', label: "简介", content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-2xl font-bold text-emerald-600">
                  {user?.name?.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{user?.name}</h3>
                  <p className="text-sm text-gray-500">{user?.email}</p>
                </div>
              </div>
              <Input label={"名称"} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} icon={<User className="w-4 h-4" />} />
              <Input label={"邮箱"} type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              <Input label={"电话"} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              <Button onClick={handleProfileSave} loading={saving} icon={<Save className="w-4 h-4" />}>保存更改</Button>
            </div>
          </Card>
        )},
        { key: 'security', label: "安全", content: (
          <AccountSecurity />
        )},
        { key: 'workspace', label: "业务", content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Globe className="w-5 h-5" /> 业务设置</h3>
              <Input label={"企业名称"} value={wsSettings.name} onChange={(e) => setWsSettings({ ...wsSettings, name: e.target.value })} />
              <Select label={"时区"} value={wsSettings.timezone} onChange={(e) => setWsSettings({ ...wsSettings, timezone: e.target.value })}
                options={[
                  { value: 'Asia/Kolkata', label: "亚洲/加尔各答 (IST)" },
                  { value: 'UTC', label: 'UTC' },
                  { value: 'America/New_York', label: "美洲/纽约（东部时间）" },
                  { value: 'Europe/London', label: "欧洲/伦敦 (GMT)" },
                ]} />
              <Button onClick={handleWorkspaceSave} loading={saving} icon={<Save className="w-4 h-4" />}>保存</Button>
              
            </div>
          </Card>
        )},

      ]} />
    </div>
  );
}
