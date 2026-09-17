'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { isAxiosError } from 'axios';
import { Mail, Lock, Eye, EyeOff, Handshake } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { affiliatePublicApi } from '@/lib/api';
import toast from 'react-hot-toast';

export default function PartnerLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = usePartnerAuthStore((s) => s.login);
  const loadPartner = usePartnerAuthStore((s) => s.loadPartner);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  // Auto-login with token from the admin "Login as Partner" button
  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) return;
    const current = localStorage.getItem('token');
    if (current && current !== token) localStorage.setItem('adminToken', current);
    localStorage.setItem('token', token);
    localStorage.removeItem('workspaceId');
    loadPartner().then(() => {
      if (usePartnerAuthStore.getState().isAuthenticated) {
        toast.success(translateApiMessage("以合作伙伴身份登录"));
        router.push('/partner/dashboard');
      } else {
        toast.error(translateApiMessage("令牌已过期或无效"));
        localStorage.removeItem('token');
      }
    });
  }, [searchParams, loadPartner, router]);

  useEffect(() => {
    affiliatePublicApi.state()
      .then((res) => {
        setAvailable(res.data.data?.available === true);
        setSignupOpen(res.data.data?.signupOpen === true);
      })
      .catch(() => setAvailable(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success(translateApiMessage("登录成功"));
      router.push('/partner/dashboard');
    } catch (err) {
      const message = isAxiosError(err)
        ? err.response?.data?.message || "电子邮件或密码无效"
        : err instanceof Error ? err.message : "登录失败";
      toast.error(translateApiMessage(message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-100 flex items-center justify-center">
            <Handshake className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">联属合作伙伴门户</h1>
          <p className="text-gray-500 mt-2">登录以管理您的推荐和佣金</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {available === false ? (
            <p className="text-sm text-gray-500 text-center">
              联属合作伙伴计划在此面板上不可用。
            </p>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label={"邮箱"}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  icon={<Mail className="w-4 h-4" />}
                  placeholder="you@company.com"
                />
                <div className="relative">
                  <Input
                    label={"密码"}
                    type={showPassword ? 'text' : 'password'}
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
                
                <Button type="submit" className="w-full" loading={loading}>登录</Button>
              </form>
              {signupOpen && (
                <p className="text-center text-sm text-gray-500 mt-6">
                  新伙伴？{' '}
                  <Link href="/partner/signup" className="text-emerald-600 hover:text-emerald-700 font-medium">申请加入</Link>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
