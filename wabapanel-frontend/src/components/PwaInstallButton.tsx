'use client';
import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const getDeferred = () => (window as unknown as { deferredPwaPrompt?: BeforeInstallPromptEvent }).deferredPwaPrompt;

export default function PwaInstallButton() {
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone) {
      setInstalled(true);
      return;
    }
    if (getDeferred()) setCanPrompt(true);
    const onInstallable = () => setCanPrompt(true);
    const onInstalled = () => setInstalled(true);
    window.addEventListener('pwa-installable', onInstallable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('pwa-installable', onInstallable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    const deferred = getDeferred();
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      (window as unknown as { deferredPwaPrompt?: BeforeInstallPromptEvent }).deferredPwaPrompt = undefined;
      setCanPrompt(false);
    } else {
      setShowHelp(true);
    }
  };

  return (
    <div className="relative">
      <button onClick={handleClick} title={"将此面板安装为应用程序"}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-full transition-colors">
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">安装应用程序</span>
      </button>
      {showHelp && !canPrompt && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl ring-1 ring-gray-100 dark:ring-gray-700 z-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5"><Smartphone className="w-4 h-4" /> 安装应用程序</h4>
            <button onClick={() => setShowHelp(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 list-disc pl-4">
            <li><b>iPhone / iPad (Safari):</b> 点击“共享”按钮，然后点击“添加到主屏幕”。</li>
            <li><b>安卓（Chrome）：</b> 点击 ⋮ 菜单，然后点击“安装应用程序”或“添加到主屏幕”。</li>
            <li><b>桌面（Chrome / Edge）：</b> 单击地址栏中的安装图标。</li>
          </ul>
        </div>
      )}
    </div>
  );
}
