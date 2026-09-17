'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import useBranding from '@/lib/useBranding';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, MailCheck } from 'lucide-react';
import AuthSide from '@/components/auth/AuthSide';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const brand = useBranding();
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      localStorage.setItem('affiliateRef', ref);
      setReferralCode(ref);
    } else {
      setReferralCode(localStorage.getItem('affiliateRef') || '');
    }
  }, []);

  const startGoogleSignup = () => {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'https://api.wabapanel.com/api').replace(/\/$/, '');
    window.location.href = `${apiBase}/auth/google`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error(translateApiMessage("密码不匹配"));
      return;
    }
    setLoading(true);
    try {
      const needsVerification = await register(email, password, referralCode);
      localStorage.removeItem('affiliateRef');
      if (needsVerification) {
        setVerificationSent(true);
        return;
      }
      toast.success(translateApiMessage("账户已创建！"));
      router.push('/client/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "注册失败"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-ui-auth className="min-h-screen flex">
      <AuthSide />
      <div className="flex-1 flex items-center justify-center bg-gray-50 px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
        <div className="text-center mb-6">
          {brand.logo && <img src={brand.logo} alt={brand.name} className="h-12 mx-auto mb-3 lg:hidden" />}
          <h1 className="text-2xl font-bold text-gray-900">创建您的账户</h1>
          <p className="text-gray-500 mt-1 text-sm">开始于 {brand.name} 几秒钟后</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
          {verificationSent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MailCheck className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">验证您的电子邮件</h3>
              <p className="text-gray-500 text-sm">我们将验证链接发送至 <strong>{email}</strong>。单击电子邮件中的链接激活您的账户，然后登录。</p>
              <Link href="/auth/login" className="inline-block mt-4 text-violet-600 hover:text-violet-700 font-medium text-sm">前往登录</Link>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {referralCode && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                由合作伙伴代码引用 <strong>{referralCode}</strong>
              </p>
            )}
            <Input label={"邮箱"} type="email" placeholder={"请输入邮箱"} value={email} onChange={(e) => setEmail(e.target.value)} required icon={<Mail className="w-4 h-4" />} />
            <Input label={"密码"} type="password" placeholder={"创建密码"} value={password} onChange={(e) => setPassword(e.target.value)} required icon={<Lock className="w-4 h-4" />} />
            <Input label={"确认密码"} type="password" placeholder={"确认密码"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required icon={<Lock className="w-4 h-4" />} />
            <Button type="submit" className="w-full" loading={loading}>创建账户</Button>
            {brand.googleLogin && (
              <>
                <div className="flex items-center gap-3 pt-1">
                  <span className="h-px flex-1 bg-gray-200" />
                  <span className="text-xs text-gray-400">or</span>
                  <span className="h-px flex-1 bg-gray-200" />
                </div>
                <button type="button" onClick={startGoogleSignup}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <img src="https://www.google.com/favicon.ico" alt="" className="w-4 h-4" />
                  使用 Google 注册
                </button>
              </>
            )}
          </form>
          )}
          <p className="text-center text-sm text-gray-500 mt-6">
            已经有账户？{' '}
            <Link href="/auth/login" className="text-violet-600 hover:text-violet-700 font-medium">登录</Link>
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}
