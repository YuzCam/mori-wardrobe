'use client';
import { useEffect, useState, type MouseEvent } from 'react';
import {
  House,
  PanelsTopLeft,
  Plus,
  Settings2,
  Flower2,
  Heart,
  ShieldCheck,
  Haze,
  Shirt,
  LoaderCircle,
} from 'lucide-react';
import SettingsPanel from '../../features/settings/panel';
import { usePreferences } from '../../features/wardrobe/hooks';
export type View = 'home' | 'wardrobe' | 'upload' | 'favorites';
export default function Shell({
  view,
  owner,
  children,
}: {
  view: View;
  owner: string;
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState(false);
  const [navigating, setNavigating] = useState(false);
  useEffect(() => {
    // A page restored from the browser's back/forward cache is already ready.
    const ready = () => setNavigating(false);
    window.addEventListener('pageshow', ready);
    return () => window.removeEventListener('pageshow', ready);
  }, []);
  function showNavigation(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const link = (event.target as Element).closest('a');
    if (!link || link.target || link.hasAttribute('download')) return;
    const destination = new URL(link.href, location.href);
    if (
      destination.pathname === location.pathname &&
      destination.search === location.search &&
      destination.hash
    )
      return;
    if (destination.origin === location.origin && destination.pathname !== '/signin-with-chatgpt')
      setNavigating(true);
  }
  const { data: prefs } = usePreferences(owner);
  const season =
    prefs?.theme === 'summer' || (prefs?.theme === 'seasonal' && prefs.season === 'summer')
      ? 'summer'
      : 'winter';
  // Document navigation keeps private routes usable without the client router.
  const nav = [
    { id: 'home', href: '/', label: '今日灵感', icon: House },
    { id: 'wardrobe', href: '/wardrobe', label: '我的衣橱', icon: PanelsTopLeft },
    { id: 'upload', href: '/upload', label: '添加衣物', icon: Plus },
    { id: 'favorites', href: '/favorites', label: '收藏的搭配', icon: Heart },
  ];
  return (
    <div className={`app-shell theme-${season}`} onClickCapture={showNavigation}>
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-symbol">
            <Shirt size={23} strokeWidth={1.4} />
          </span>
          <span>
            沐衣<small>MŌRI WARDROBE</small>
          </span>
        </a>
        <p className="sidebar-eyebrow">YOUR EVERYDAY, CURATED.</p>
        <nav aria-label="主导航">
          {nav.map((n) => (
            <a
              key={n.id}
              href={n.href}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              aria-current={view === n.id ? 'page' : undefined}
            >
              <n.icon size={19} />
              {n.label}
              {view === n.id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <Flower2 size={27} strokeWidth={1.2} />
          <p>
            少一点翻找，
            <br />
            多一点喜欢。
          </p>
          <span>A LITTLE SPACE FOR YOUR STYLE.</span>
        </div>
        <button className="profile-button" onClick={() => setSettings(true)}>
          <span className="avatar">沐</span>
          <span>
            我的私人衣橱
            <small>
              <ShieldCheck size={11} />
              仅自己可见
            </small>
          </span>
          <Settings2 size={17} />
        </button>
      </aside>
      <div className="main-frame">
        <header className="topbar">
          <a href="/" className="mobile-brand">
            <Shirt size={20} />
            沐衣<span>MŌRI</span>
          </a>
          <span className="topbar-breadcrumb">
            我的空间<span>/</span>
            {nav.find((n) => n.id === view)?.label}
          </span>
          <div className="topbar-right">
            <button className="season-indicator" onClick={() => setSettings(true)}>
              <Haze size={15} />
              {season === 'winter' ? '暖冬衣橱' : '清夏衣橱'}
              <span className="tiny-dot" />
            </button>
            <button
              className="icon-button mobile-settings"
              onClick={() => setSettings(true)}
              aria-label="设置"
            >
              <Settings2 size={19} />
            </button>
            <span className="private-pill">
              <ShieldCheck size={13} />
              私人空间
            </span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {children}
        </main>
        <footer className="site-footer">
          <span>沐衣 MŌRI · 好好穿衣，好好生活</span>
          <span>
            每一件，都值得被喜欢
            <Heart size={11} />
          </span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="手机导航">
        {nav.map((n) => (
          <a
            key={n.id}
            href={n.href}
            className={view === n.id ? 'active' : ''}
            aria-current={view === n.id ? 'page' : undefined}
          >
            <span className={n.id === 'upload' ? 'mobile-add-icon' : ''}>
              <n.icon size={21} />
            </span>
            {n.label}
          </a>
        ))}
      </nav>
      {navigating && (
        <div className="navigation-status" role="status">
          <LoaderCircle size={16} className="spin" />
          正在打开页面…
        </div>
      )}
      {settings && <SettingsPanel owner={owner} onClose={() => setSettings(false)} />}
    </div>
  );
}
