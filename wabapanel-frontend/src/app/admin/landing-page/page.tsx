'use client';
import { translateApiMessage } from '@/lib/zhMessages';
import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import Tabs from '@/components/ui/Tabs';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import ImageUploadInput from '@/components/ui/ImageUploadInput';

interface LandingPageData {
  hero: { title: string; subtitle: string; description: string; ctaText: string; ctaLink: string; heroImage: string };
  features: Array<{ icon: string; title: string; description: string }>;
  
  faq: Array<{ question: string; answer: string }>;
  testimonials: Array<{ name: string; company: string; text: string; avatar: string }>;
  contact: { title: string; email: string; phone: string; address: string };
  footer: { companyName: string; description: string; copyrightText: string; socialLinks: { facebook: string; twitter: string; instagram: string; linkedin: string; youtube: string } };
  seo: { title: string; description: string };
  isPublished: boolean;
}

const defaultData: LandingPageData = {
  hero: { title: "改变您的商务沟通", subtitle: "强大的 WhatsApp Business API 平台", description: '', ctaText: "免费开始", ctaLink: '/auth/register', heroImage: '' },
  features: [],
  
  faq: [],
  testimonials: [],
  contact: { title: "联系我们", email: '', phone: '', address: '' },
  footer: { companyName: '', description: '', copyrightText: '', socialLinks: { facebook: '', twitter: '', instagram: '', linkedin: '', youtube: '' } },
  seo: { title: '', description: '' },
  isPublished: true,
};

function merge(base: LandingPageData, incoming: Partial<LandingPageData>): LandingPageData {
  return {
    ...base,
    ...incoming,
    hero: { ...base.hero, ...(incoming.hero || {}) },
    
    contact: { ...base.contact, ...(incoming.contact || {}) },
    footer: { ...base.footer, ...(incoming.footer || {}), socialLinks: { ...base.footer.socialLinks, ...(incoming.footer?.socialLinks || {}) } },
    seo: { ...base.seo, ...(incoming.seo || {}) },
    features: incoming.features?.length ? incoming.features : base.features,
    faq: incoming.faq?.length ? incoming.faq : base.faq,
    testimonials: incoming.testimonials?.length ? incoming.testimonials : base.testimonials,
  };
}

export default function LandingPageAdmin() {
  const [data, setData] = useState<LandingPageData>(defaultData);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getLandingPage().then(r => setData(merge(defaultData, r.data.data || {}))).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try { await adminApi.updateLandingPage({ ...data, isPublished: true }); toast.success(translateApiMessage("着陆页已保存")); } catch { toast.error(translateApiMessage("操作失败")); }
    setSaving(false);
  };

  const addFeature = () => setData({ ...data, features: [...data.features, { icon: '', title: '', description: '' }] });
  const removeFeature = (i: number) => setData({ ...data, features: data.features.filter((_, idx) => idx !== i) });
  const addFaq = () => setData({ ...data, faq: [...data.faq, { question: '', answer: '' }] });
  const removeFaq = (i: number) => setData({ ...data, faq: data.faq.filter((_, idx) => idx !== i) });
  const addTestimonial = () => setData({ ...data, testimonials: [...data.testimonials, { name: '', company: '', text: '', avatar: '' }] });
  const removeTestimonial = (i: number) => setData({ ...data, testimonials: data.testimonials.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      <div className="page-hero flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">登陆页面设置</h1>
          <p className="text-sm text-gray-500 mt-1">自定义公共登陆页面的每个部分。定价计划自动来自管理 → 计划。</p>
        </div>
        <Button onClick={handleSave} loading={saving} icon={<Save className="w-4 h-4" />}>全部保存</Button>
      </div>

      <Tabs tabs={[
        { key: 'hero', label: "英雄", content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <Input label={"标题"} value={data.hero.title} onChange={e => setData({ ...data, hero: { ...data.hero, title: e.target.value } })} />
              <Textarea label={"副标题"} value={data.hero.subtitle} onChange={e => setData({ ...data, hero: { ...data.hero, subtitle: e.target.value } })} />
              <div className="grid grid-cols-2 gap-4">
                <Input label={"CTA 文本"} value={data.hero.ctaText} onChange={e => setData({ ...data, hero: { ...data.hero, ctaText: e.target.value } })} />
                <Input label={"CTA 链接"} value={data.hero.ctaLink} onChange={e => setData({ ...data, hero: { ...data.hero, ctaLink: e.target.value } })} />
              </div>
              <ImageUploadInput label={"英雄形象"} value={data.hero.heroImage} onChange={v => setData({ ...data, hero: { ...data.hero, heroImage: v } })} hint={"推荐：800x600px或更大的JPG/PNG"} folder="landing" />
            </div>
          </Card>
        )},
        { key: 'features', label: "特点", content: (
          <Card>
            {data.features.map((f, i) => (
              <div key={i} className="flex gap-3 items-start mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <Input placeholder={"图标（消息/zap/发送/机器人/用户/图表/日历/管道/电话）"} value={f.icon} onChange={e => { const features = [...data.features]; features[i] = { ...f, icon: e.target.value }; setData({ ...data, features }); }} />
                  <Input placeholder={"标题"} value={f.title} onChange={e => { const features = [...data.features]; features[i] = { ...f, title: e.target.value }; setData({ ...data, features }); }} />
                  <Input placeholder={"说明"} value={f.description} onChange={e => { const features = [...data.features]; features[i] = { ...f, description: e.target.value }; setData({ ...data, features }); }} />
                </div>
                <button onClick={() => removeFeature(i)} className="text-red-400 mt-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addFeature} icon={<Plus className="w-3 h-3" />}>添加功能</Button>
          </Card>
        )},
        
        { key: 'faq', label: 'FAQ', content: (
          <Card>
            {data.faq.map((f, i) => (
              <div key={i} className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input placeholder={"问题"} value={f.question} onChange={e => { const faq = [...data.faq]; faq[i] = { ...f, question: e.target.value }; setData({ ...data, faq }); }} />
                    <Textarea placeholder={"答案"} value={f.answer} onChange={e => { const faq = [...data.faq]; faq[i] = { ...f, answer: e.target.value }; setData({ ...data, faq }); }} />
                  </div>
                  <button onClick={() => removeFaq(i)} className="text-red-400 mt-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addFaq} icon={<Plus className="w-3 h-3" />}>添加常见问题解答</Button>
          </Card>
        )},
        { key: 'testimonials', label: "感言", content: (
          <Card>
            {data.testimonials.map((t, i) => (
              <div key={i} className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input placeholder={"名称"} value={t.name} onChange={e => { const ts = [...data.testimonials]; ts[i] = { ...t, name: e.target.value }; setData({ ...data, testimonials: ts }); }} />
                    <Input placeholder={"公司/角色"} value={t.company} onChange={e => { const ts = [...data.testimonials]; ts[i] = { ...t, company: e.target.value }; setData({ ...data, testimonials: ts }); }} />
                    <Input placeholder={"头像网址"} value={t.avatar} onChange={e => { const ts = [...data.testimonials]; ts[i] = { ...t, avatar: e.target.value }; setData({ ...data, testimonials: ts }); }} className="col-span-2" />
                    <Textarea placeholder={"推荐文字"} value={t.text} onChange={e => { const ts = [...data.testimonials]; ts[i] = { ...t, text: e.target.value }; setData({ ...data, testimonials: ts }); }} className="col-span-2" />
                  </div>
                  <button onClick={() => removeTestimonial(i)} className="text-red-400 mt-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addTestimonial} icon={<Plus className="w-3 h-3" />}>添加推荐</Button>
          </Card>
        )},
        { key: 'contact', label: "联系方式", content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <Input label={"邮箱"} value={data.contact.email} onChange={e => setData({ ...data, contact: { ...data.contact, email: e.target.value } })} />
              <Input label={"电话"} value={data.contact.phone} onChange={e => setData({ ...data, contact: { ...data.contact, phone: e.target.value } })} />
              <Textarea label={"地址"} value={data.contact.address} onChange={e => setData({ ...data, contact: { ...data.contact, address: e.target.value } })} />
            </div>
          </Card>
        )},
        { key: 'footer', label: "页脚", content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <Input label={"公司名称"} value={data.footer.companyName} onChange={e => setData({ ...data, footer: { ...data.footer, companyName: e.target.value } })} placeholder="WabaPanel" />
              <Textarea label={"公司描述"} value={data.footer.description} onChange={e => setData({ ...data, footer: { ...data.footer, description: e.target.value } })} placeholder={"适用于现代企业的 WhatsApp 商业平台。"} />
              <Input label={"版权文本"} value={data.footer.copyrightText} onChange={e => setData({ ...data, footer: { ...data.footer, copyrightText: e.target.value } })} placeholder={"© 2026 WabaPanel。版权所有。"} />
            </div>
          </Card>
        )},
        { key: 'seo', label: 'SEO', content: (
          <Card>
            <div className="space-y-4 max-w-lg">
              <Input label={"元标题"} value={data.seo.title} onChange={e => setData({ ...data, seo: { ...data.seo, title: e.target.value } })} />
              <Textarea label={"元描述"} value={data.seo.description} onChange={e => setData({ ...data, seo: { ...data.seo, description: e.target.value } })} />
            </div>
          </Card>
        )},
      ]} />
    </div>
  );
}
