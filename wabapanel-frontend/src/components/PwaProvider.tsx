'use client';
import { useEffect } from 'react';

// 只注册 service worker（Web 推送通知依赖它）。「安装到桌面」功能已移除：
// 不再输出 manifest、不再拦截 beforeinstallprompt，浏览器不会再提供安装入口。
export default function PwaProvider() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
