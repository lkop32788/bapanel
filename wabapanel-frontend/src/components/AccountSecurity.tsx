'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Lock, Shield, Smartphone, Mail } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';

type Status = { enabled: boolean; method: 'app' | 'email'; email?: string };

export default function AccountSecurity() {
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPw, setSavingPw] = useState(false);

  const [status, setStatus] = useState<Status>({ enabled: false, method: 'app' });
  const [setup, setSetup] = useState<{ method: 'app' | 'email'; qrCode?: string; secret?: string; email?: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStatus = () => {
    authApi.twoFactorStatus()
      .then(r => setStatus(r.data.data))
      .catch(() => {});
  };
  useEffect(loadStatus, []);

  const handlePasswordChange = async () => {
    if (passwords.newPassword !== passwords.confirmPassword) { toast.error(translateApiMessage("密码不匹配")); return; }
    if (passwords.newPassword.length < 6) { toast.error(translateApiMessage("密码必须至少为 6 个字符")); return; }
    setSavingPw(true);
    try {
      await authApi.changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      toast.success(translateApiMessage("密码已更改"));
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "更改密码失败"));
    }
    setSavingPw(false);
  };

  const startSetup = async (method: 'app' | 'email') => {
    setBusy(true);
    try {
      const r = await authApi.twoFactorSetup(method);
      setSetup({ method, ...r.data.data });
      setCode('');
      if (method === 'email') toast.success(translateApiMessage("验证码已发送至您的邮箱"));
    } catch { toast.error(translateApiMessage("无法启动 2FA 设置")); }
    setBusy(false);
  };

  const verifySetup = async () => {
    setBusy(true);
    try {
      await authApi.twoFactorVerify(code.trim());
      toast.success(translateApiMessage("启用两步验证"));
      setSetup(null); setCode('');
      loadStatus();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(e.response?.data?.message || "代码无效"));
    }
    setBusy(false);
  };

  const disable2FA = async () => {
    setBusy(true);
    try {
      await authApi.twoFactorDisable();
      toast.success(translateApiMessage("两步验证已禁用"));
      setStatus({ enabled: false, method: status.method });
      setSetup(null);
    } catch { toast.error(translateApiMessage("禁用失败")); }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-4 max-w-lg">
          <h3 className="text-lg font-semibold flex items-center gap-2"><Lock className="w-5 h-5" /> 更改密码</h3>
          <Input label={"当前密码"} type="password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} />
          <Input label={"新密码"} type="password" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} />
          <Input label={"确认新密码"} type="password" value={passwords.confirmPassword} onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })} />
          <Button onClick={handlePasswordChange} loading={savingPw}>更新密码</Button>
        </div>
      </Card>

      <Card>
        <div className="space-y-4 max-w-lg">
          <h3 className="text-lg font-semibold flex items-center gap-2"><Shield className="w-5 h-5" /> 两步验证（2FA）</h3>

          {status.enabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                通过启用 {status.method === 'email' ? "电子邮件 OTP" : "验证器应用程序"}
              </div>
              <p className="text-sm text-gray-500">每次登录都会要求输入第二步代码。</p>
              <Button variant="outline" onClick={disable2FA} loading={busy}>禁用2FA</Button>
            </div>
          ) : setup ? (
            <div className="space-y-3">
              {setup.method === 'app' ? (
                <>
                  <p className="text-sm text-gray-600">在 Google Authenticator、Authy 或任何 TOTP 应用程序中扫描此二维码：</p>
                  {setup.qrCode && <img src={setup.qrCode} alt={"2FA 二维码"} className="w-44 h-44 border rounded-lg" />}
                  <p className="text-xs text-gray-400 break-all">手动键： {setup.secret}</p>
                </>
              ) : (
                <p className="text-sm text-gray-600">我们发送了一个 6 位代码至 <b>{setup.email}</b>。在下面输入它以启用电子邮件 2FA。</p>
              )}
              <Input label={"输入 6 位代码"} value={code} inputMode="numeric" placeholder="123456" onChange={(e) => setCode(e.target.value)} />
              <div className="flex gap-2">
                <Button onClick={verifySetup} loading={busy}>验证并启用</Button>
                <Button variant="outline" onClick={() => { setSetup(null); setCode(''); }}>取消</Button>
                {setup.method === 'email' && (
                  <Button variant="outline" onClick={() => authApi.twoFactorResend().then(() => toast.success(translateApiMessage("代码已重新发送"))).catch(() => toast.error(translateApiMessage("操作失败")))}>重新发送</Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">添加额外的安全层。选择您希望如何接收登录代码：</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => startSetup('app')} disabled={busy} className="flex-1 flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:border-violet-300 hover:bg-violet-50 transition-colors text-left">
                  <Smartphone className="w-6 h-6 text-violet-600" />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">验证器应用程序</p>
                    <p className="text-xs text-gray-500">Google 身份验证器、Authy 等。</p>
                  </div>
                </button>
                <button onClick={() => startSetup('email')} disabled={busy} className="flex-1 flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:border-violet-300 hover:bg-violet-50 transition-colors text-left">
                  <Mail className="w-6 h-6 text-violet-600" />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">电子邮件 OTP</p>
                    <p className="text-xs text-gray-500">登录时代码已发送到您的电子邮件</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
