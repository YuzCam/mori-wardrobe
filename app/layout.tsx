import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from '../components/providers';

export const metadata: Metadata = {
  title: '沐衣 MŌRI · 我的电子衣橱',
  description: '把喜欢的衣服，穿成喜欢的日常。私人电子衣橱、衣物整理与每日穿搭。',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#faf9f6',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <a href="#main-content" className="skip-link">
          跳到主要内容
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
