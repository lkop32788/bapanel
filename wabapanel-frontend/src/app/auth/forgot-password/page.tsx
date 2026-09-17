'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { authApi } from '@/lib/api';
import useBranding from '@/lib/useBranding';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const brand = useBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
      toast.success(translateApiMessage("重置链接已发送！"));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(translateApiMessage(error.response?.data?.message || "发送重置链接失败"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-center">{brand.logo ? <img src={brand.logo} alt={brand.name} className="h-14 mx-auto mb-2" /> : <><h1 className="text-3xl font-bold text-emerald-600">{brand.name}</h1><p className="text-sm text-gray-400">{brand.tagline}</p></>}</div>
          <p className="text-gray-500 mt-2">重置您的密码</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">检查您的电子邮件</h3>
              <p className="text-gray-500 text-sm">我们将重置链接发送至 <strong>{email}</strong></p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label={"邮箱"} type="email" placeholder={"请输入邮箱"} value={email} onChange={(e) => setEmail(e.target.value)} required icon={<Mail className="w-4 h-4" />} />
              <Button type="submit" className="w-full" loading={loading}>发送重置链接</Button>
            </form>
          )}
          <div className="mt-6 text-center">
            <Link href="/auth/login" className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> 返回登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
