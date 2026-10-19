'use client';
import { useParams } from 'next/navigation';
import SaverStatusCheck from '@/components/SaverStatusCheck';
import { SAVER_GROUP_MAP } from '@/lib/saverTypes';

export default function SaverGroupPage() {
  const params = useParams<{ type: string }>();
  const slug = String(params?.type || '');
  if (!SAVER_GROUP_MAP[slug]) {
    return <div className="py-16 text-center text-gray-400">检测类型不存在</div>;
  }
  return <SaverStatusCheck key={slug} groupSlug={slug} />;
}
