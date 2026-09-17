'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import useBranding from '@/lib/useBranding';
import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import AuthSide from '@/components/auth/AuthSide';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loadUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [twoFA, setTwoFA] = useState<{ method: string; challengeToken: string } | null>(null);
  const [code, setCode] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [blockRemaining, setBlockRemaining] = useState(0);

  const redirectAfterLogin = () => {
    const u = useAuthStore.getState().user;
    let saved = '';
    try { saved = sessionStorage.getItem('postLoginRedirect') || ''; sessionStorage.removeItem('postLoginRedirect'); } catch { /* */ }
    const isAdmin = u?.role === 'admin' || u?.role === 'super_admin';
    if (saved && (isAdmin || !saved.startsWith('/admin'))) router.push(saved);
    else router.push(isAdmin ? '/admin/dashboard' : '/client/dashboard');
  };

  // Auto-login with token from admin "Login as Vendor" button
  // ADM-14: the token is handed over in a one-time localStorage key (?impersonate=1), never
  // in the URL. A legacy ?token= link is still accepted, but removed from the URL/history.
  useEffect(() => {
    let token = searchParams.get('token');
    if (searchParams.get('impersonate') === '1') {
      token = localStorage.getItem('impersonateToken');
      localStorage.removeItem('impersonateToken');
    }
    if (searchParams.get('token') || searchParams.get('impersonate')) router.replace('/auth/login');
    if (token) {
      // Save current admin token so we can switch back (keep an existing one: never
      // overwrite the real admin token with a vendor token from an earlier login-as)
      const currentToken = localStorage.getItem('token');
      if (currentToken && currentToken !== token && !localStorage.getItem('adminToken')) {
        localStorage.setItem('adminToken', currentToken);
      }
      localStorage.setItem('token', token);
      loadUser().then(() => {
        toast.success(translateApiMessage("登录成功"));
        const u = useAuthStore.getState().user;
        (() => {
        let saved = '';
        try { saved = sessionStorage.getItem('postLoginRedirect') || ''; sessionStorage.removeItem('postLoginRedirect'); } catch { /* */ }
        const isAdmin = u?.role === 'admin' || u?.role === 'super_admin';
        if (saved && (isAdmin || !saved.startsWith('/admin'))) router.push(saved);
        else router.push(isAdmin ? '/admin/dashboard' : '/client/dashboard');
      })();
      }).catch(() => {
        toast.error(translateApiMessage("令牌已过期或无效"));
        localStorage.removeItem('token');
      });
    }
  }, [searchParams, loadUser, router]);

  useEffect(() => {
    if (!blocked || blockRemaining <= 0) return;
    const t = setInterval(() => {
      setBlockRemaining((s) => {
        if (s <= 1) { setBlocked(false); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [blocked, blockRemaining]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const googleError = searchParams.get('google_error');
  const googleErrorText: Record<string, string> = {
    disabled: "尚未在此面板上配置 Google 登录。",
    nouser: `未找到 ${searchParams.get('email') || '此 Google 账户'} 对应的账户，请使用已有账户登录或联系管理员。`,
    suspended: "该账户已被暂停。请联系支持人员。",
    twofa: "此账户已启用两步验证 - 请使用您的密码登录。",
    cancelled: "Google 登录已取消。",
  };

  const startGoogleLogin = () => {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/$/, '');
    window.location.href = `${apiBase}/auth/google`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result && result.requires2FA) {
        setTwoFA({ method: result.method || 'app', challengeToken: result.challengeToken || '' });
        toast.success(translateApiMessage(result.method === 'email' ? "代码已发送至您的电子邮件" : "输入您的验证码"));
        return;
      }
      toast.success(translateApiMessage("登录成功！"));
      redirectAfterLogin();
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { message?: string; code?: string } } };
      if (error.response?.status === 429 || error.response?.data?.code === 'LOGIN_BLOCKED') {
        setBlocked(true);
        setBlockRemaining(5 * 60);
        toast.error(translateApiMessage(error.response?.data?.message || "尝试次数过多。登录暂时被阻止。"));
      } else {
        if (error.response?.data?.code === 'EMAIL_NOT_VERIFIED') setNeedsVerification(true);
        toast.error(translateApiMessage(error.response?.data?.message || "登录失败"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFA) return;
    setLoading(true);
    try {
      await useAuthStore.getState().complete2FALogin(twoFA.challengeToken, code.trim());
      toast.success(translateApiMessage("登录成功！"));
      redirectAfterLogin();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "代码无效"));
    } finally {
      setLoading(false);
    }
  };

  const handle2FAResend = async () => {
    if (!twoFA) return;
    try {
      await authApi.twoFactorLoginResend(twoFA.challengeToken);
      toast.success(translateApiMessage("新代码已发送至您的电子邮件"));
    } catch {
      toast.error(translateApiMessage("无法重新发送代码"));
    }
  };

  const handleResend = async () => {
    try {
      await authApi.resendVerification(email);
      toast.success(translateApiMessage("验证电子邮件已发送。请检查您的收件箱。"));
    } catch {
      toast.error(translateApiMessage("无法发送验证电子邮件"));
    }
  };

  const brand = useBranding();

  return (
    <div data-ui-auth className="min-h-screen flex">
      <AuthSide />
      <div className="flex-1 flex items-center justify-center bg-gray-50 px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
        <div data-ui-auth-card className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
        <div data-ui-auth-heading className="text-center mb-6">
          {brand.logo && <img src={brand.logo} alt={brand.name} className="h-12 mx-auto mb-3 lg:hidden" />}
          <h1 className="text-2xl font-bold text-gray-900">{brand.name}</h1>
        </div>
          {twoFA ? (
          <form onSubmit={handle2FASubmit} className="space-y-4">
            <div className="text-center mb-2">
              <div className="w-12 h-12 mx-auto bg-violet-100 rounded-full flex items-center justify-center mb-3">
                <Lock className="w-6 h-6 text-violet-600" />
              </div>
              <h3 className="font-semibold text-gray-900">两步验证</h3>
              <p className="text-sm text-gray-500 mt-1">
                {twoFA.method === 'email'
                  ? "请输入发送到邮箱的 6 位验证码。"
                  : "请输入身份验证器中的 6 位验证码。"}
              </p>
            </div>
            <Input
              label={"验证码"}
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
            <Button type="submit" className="w-full" loading={loading}>验证并登录</Button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => { setTwoFA(null); setCode(''); }} className="text-gray-500 hover:text-gray-700">返回登录</button>
              {twoFA.method === 'email' && (
                <button type="button" onClick={handle2FAResend} className="text-violet-600 hover:text-violet-700 font-medium">重新发送验证码</button>
              )}
            </div>
          </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={"邮箱"}
              type="email"
              placeholder={"请输入邮箱"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              icon={<Mail className="w-4 h-4" />}
            />
            <div className="relative">
              <Input
                label={"密码"}
                type={showPassword ? 'text' : 'password'}
                placeholder={"请输入密码"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                icon={<Lock className="w-4 h-4" />}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                记住我
              </label>
            </div>
            {blocked && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                <p className="font-medium">登录暂时被阻止</p>
                <p className="mt-1">失败的尝试太多。它将自动解锁 <span className="font-semibold">{fmt(blockRemaining)}</span>.</p>
              </div>
            )}
            {googleError && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                {googleErrorText[googleError] || "Google 登录失败。请重试或使用您的密码。"}
              </div>
            )}
            {needsVerification && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                您的电子邮件尚未验证。{' '}
                <button type="button" onClick={handleResend} className="font-medium text-violet-600 hover:text-violet-700 underline">重新发送验证电子邮件</button>
              </div>
            )}
            <Button type="submit" className="w-full" loading={loading} disabled={blocked}>
              {blocked ? `被阻止（${fmt(blockRemaining)})` : "登录"}
            </Button>
            {brand.googleLogin && (
              <>
                <div className="flex items-center gap-3 pt-1">
                  <span className="h-px flex-1 bg-gray-200" />
                  <span className="text-xs text-gray-400">or</span>
                  <span className="h-px flex-1 bg-gray-200" />
                </div>
                <button type="button" onClick={startGoogleLogin}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <img src="https://www.google.com/favicon.ico" alt="" className="w-4 h-4" />
                  继续使用 Google
                </button>
              </>
            )}
          </form>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400">加载中…</p></div>}>
      <LoginForm />
    </Suspense>
  );
}
