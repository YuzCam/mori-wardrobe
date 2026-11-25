'use client';
import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: true },
          mutations: { retry: 0 },
        },
      }),
  );
  useEffect(() => {
    const off = () => toast('已离线，编辑内容会保存在本机草稿中');
    const on = () => toast.success('网络已恢复');
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    const viewport = () => {
      const visible = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--visible-height', `${visible}px`);
      document.documentElement.dataset.keyboardOpen =
        window.innerHeight - visible > 150 ? 'true' : 'false';
    };
    viewport();
    window.visualViewport?.addEventListener('resize', viewport);
    if ('serviceWorker' in navigator && location.protocol === 'https:')
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
      window.visualViewport?.removeEventListener('resize', viewport);
    };
  }, []);
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="top-center" richColors closeButton duration={4000} />
    </QueryClientProvider>
  );
}
