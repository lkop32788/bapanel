'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

type Step = 0 | 1 | 2 | 3;

export default function InstallPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const [siteName, setSiteName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requiresLicenseKey, setRequiresLicenseKey] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('key');
    if (key) setLicenseKey(key);
    fetch(`${API}/install/status`)
      .then((r) => r.json())
      .then((d) => { setInstalled(!!d.installed); setRequiresLicenseKey(!!d.requiresLicenseKey); })
      .catch(() => setInstalled(false))
      .finally(() => setLoading(false));
  }, []);

  const next = () => {
    setError('');
    if (step === 1 && !siteName.trim()) return setError("请输入您的平台/网站名称。");
    if (step === 2) {
      if (!adminName.trim()) return setError("请输入管理员名称。");
      if (!/^\S+@\S+\.\S+$/.test(adminEmail)) return setError("请输入有效的管理员电子邮件。");
      if (adminPassword.length < 6) return setError("密码必须至少包含 6 个字符。");
      if (adminPassword !== confirmPassword) return setError("密码不匹配。");
      if (requiresLicenseKey && !licenseKey.trim()) return setError("请输入您的许可证密钥。");
    }
    setStep((s) => (Math.min(3, s + 1) as Step));
  };
  const back = () => { setError(''); setStep((s) => (Math.max(0, s - 1) as Step)); };

  const finish = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API}/install/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName, adminName, adminEmail, adminPassword, licenseKey: licenseKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Installation failed.');
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "安装失败。");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">加载中…</div>;
  }

  if (installed && !done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">已安装</h1>
          <p className="text-gray-600 text-sm mb-6">该平台已经建立。为了安全起见，安装程序被禁用。删除 <code className="bg-gray-100 px-1 rounded">installed.lock</code> 在服务器上再次运行它。</p>
          <button onClick={() => router.push('/auth/login')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg">前往登录</button>
        </div>
      </div>
    );
  }

  const steps = ['Welcome', 'Site', 'Admin', 'Finish'];

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-emerald-50 to-gray-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Progress */}
        <div className="flex">
          {steps.map((s, i) => (
            <div key={s} className={`flex-1 h-1.5 ${i <= step ? 'bg-emerald-500' : 'bg-gray-200'}`} />
          ))}
        </div>
        <div className="p-8">
          {done ? (
            <div className="text-center">
              <div className="text-5xl mb-3">🎉</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">一切就绪！</h1>
              <p className="text-gray-600 text-sm mb-6">您的平台已安装并准备就绪。使用您刚刚创建的管理员账户登录。</p>
              <button onClick={() => router.push('/auth/login')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg">前往登录</button>
            </div>
          ) : (
            <>
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide mb-1">步骤 {step + 1} 共 4 · {steps[step]}</p>

              {step === 0 && (
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">欢迎使用安装程序</h1>
                  <p className="text-gray-600 text-sm mb-4">此快速向导完成您的平台设置。在继续之前，请确保服务器已准备就绪（Node.js、MongoDB 和应用程序正在运行 - <code className="bg-gray-100 px-1 rounded">install.sh</code> 脚本自动执行此操作）。</p>
                  <ul className="text-sm text-gray-700 space-y-2 mb-2">
                    <li className="flex gap-2"><span className="text-emerald-500">●</span> 设置您的平台名称和品牌</li>
                    <li className="flex gap-2"><span className="text-emerald-500">●</span> 创建您的超级管理员账户</li>
                    <li className="flex gap-2"><span className="text-emerald-500">●</span> 种子默认计划和设置</li>
                  </ul>
                </div>
              )}

              {step === 1 && (
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">站点详细信息</h1>
                  <p className="text-gray-600 text-sm mb-4">在整个平台上显示的名称（您可以稍后在品牌下更改它）。</p>
                  <label className="block text-sm font-medium text-gray-700 mb-1">平台/站点名称</label>
                  <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder={"例如我的商务套房"} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 outline-none" />
                </div>
              )}

              {step === 2 && (
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">管理员账户</h1>
                  <p className="text-gray-600 text-sm mb-4">您的超级管理员登录信息。确保这些凭证的安全。</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">全名</label>
                      <input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder={"你的名字"} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                      <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@yourdomain.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
                      <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder={"至少 6 个字符"} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={"重新输入密码"} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 outline-none" />
                    </div>
                    {requiresLicenseKey && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">许可证密钥</label>
                        <input value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)} placeholder="XXXX-XXXX-XXXXXXXX-XXXXXXXX" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-400 outline-none" />
                        <p className="text-xs text-gray-500 mt-1">该面板已激活许可证。输入相同的密钥来证明所有权。</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">审查并完成</h1>
                  <p className="text-gray-600 text-sm mb-4">确认以下详细信息，然后完成安装。</p>
                  <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-gray-500">站点名称</span><span className="font-medium text-gray-900">{siteName}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">管理员名称</span><span className="font-medium text-gray-900">{adminName}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">管理员电子邮件</span><span className="font-medium text-gray-900">{adminEmail}</span></div>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

              <div className="flex gap-3 mt-6">
                {step > 0 && <button onClick={back} disabled={submitting} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50">返回</button>}
                {step < 3 && <button onClick={next} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg">继续</button>}
                {step === 3 && <button onClick={finish} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-60">{submitting ? "正在安装..." : "完成安装"}</button>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
