'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isAxiosError } from 'axios';
import { Handshake } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { affiliatePublicApi } from '@/lib/api';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import toast from 'react-hot-toast';

const emptyForm = { name: '', email: '', phone: '', company: '', password: '', confirmPassword: '' };

export default function PartnerSignupPage() {
  const router = useRouter();
  const loadPartner = usePartnerAuthStore((s) => s.loadPartner);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<{ available: boolean; signupOpen: boolean; commissionRate: number } | null>(null);

  useEffect(() => {
    affiliatePublicApi.state()
      .then((res) => setState({
        available: res.data.data?.available === true,
        signupOpen: res.data.data?.signupOpen === true,
        commissionRate: Number(res.data.data?.commissionRate) || 0,
      }))
      .catch(() => setState({ available: false, signupOpen: false, commissionRate: 0 }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone || !form.password) {
      toast.error(translateApiMessage("请填写所有字段"));
      return;
    }
    if (form.password.length < 6) {
      toast.error(translateApiMessage("密码必须至少为 6 个字符"));
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error(translateApiMessage("密码不匹配"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await affiliatePublicApi.register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim(),
        company: form.company.trim(),
      });
      const token = res.data.data?.token;
      if (token) {
        localStorage.setItem('token', token);
        localStorage.removeItem('workspaceId');
        await loadPartner();
        toast.success(translateApiMessage(`欢迎加入！您的推荐码是 ${res.data.data?.partner?.code}`));
        router.push('/partner/dashboard');
        return;
      }
      toast.success(translateApiMessage("申请已提交"));
      router.push('/partner/login');
    } catch (err) {
      toast.error(translateApiMessage(isAxiosError(err) ? err.response?.data?.message || "注册失败" : "注册失败"));
    } finally {
      setSubmitting(false);
    }
  };

  if (state && (!state.available || !state.signupOpen)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-xl font-bold text-gray-900">合作伙伴注册已结束</h1>
          <p className="text-gray-500 mt-2">
            {state.available
              ? "新的合作伙伴申请现已暂停。请稍后再回来查看。"
              : "联属合作伙伴计划在此面板上不可用。"}
          </p>
          <Link href="/partner/login">
            <Button variant="outline" className="w-full mt-6">返回登录</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-100 flex items-center justify-center">
            <Handshake className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">成为授权业务合作伙伴</h1>
          <p className="text-gray-500 mt-2">
            {state?.commissionRate
              ? `赚取 ${state.commissionRate}您推荐的每位客户的佣金百分比`
              : "申请加入联盟计划"}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label={"全名"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label={"邮箱"} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input label={"手机号码"} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            <Input label={"公司/企业名称"} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            <Input label={"密码"} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <Input label={"确认密码"} type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required />
            <Button type="submit" className="w-full" loading={submitting}>创建合作伙伴账户</Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-6">
            已经是合作伙伴？{' '}
            <Link href="/partner/login" className="text-emerald-600 hover:text-emerald-700 font-medium">登录</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
