'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { signOut } from '@/app/actions/auth';
import { BrandMark } from '@/components/brand-mark';

const MAIN_NAV = [
  { href: '/', label: 'Today', icon: 'M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z' },
  { href: '/chat', label: 'Chat', icon: 'M4 4h16v12H8.8L4 20V4z' },
  { href: '/clients', label: 'Clients', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8c0-3.3 3.6-5 8-5s8 1.7 8 5v1H4z' },
  { href: '/search', label: 'Search', icon: 'M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.2 4.2 1.4-1.4-4.2-4.2A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z' },
  { href: '/projects', label: 'Projects', icon: 'M4 5h16v4H4zM4 12h10v7H4zM17 12h3v7h-3z' },
] as const;

const MORE_NAV = [
  { href: '/research', label: 'Research', icon: 'M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.2 4.2 1.4-1.4-4.2-4.2A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z' },
  { href: '/knowledge', label: 'Playbooks', icon: 'M4 4h16v16H7a3 3 0 0 0-3 3zm3 2v11h11V6zM9 8h7v1.5H9zm0 4h7v1.5H9z' },
  { href: '/settings', label: 'Settings', icon: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5c0-.6-.1-1.1-.2-1.6l2-1.5-2-3.4-2.3 1a8 8 0 0 0-2.8-1.6L14.4 2h-4.8l-.3 2.4a8 8 0 0 0-2.8 1.6l-2.3-1-2 3.4 2 1.5a9 9 0 0 0 0 3.2l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 2.8 1.6l.3 2.4h4.8l.3-2.4a8 8 0 0 0 2.8-1.6l2.3 1 2-3.4-2-1.5c.1-.5.2-1 .2-1.6Z' },
] as const;

const ALL_NAV = [...MAIN_NAV, ...MORE_NAV];

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/clients' && pathname.startsWith('/threads/')) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor">
      <path d={path} />
    </svg>
  );
}

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_NAV.some((item) => isActivePath(pathname, item.href));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moreOpen]);

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-3 px-6 py-7">
          <BrandMark size={38} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold tracking-tight">Hamza Assistant</p>
            <p className="mt-0.5 text-[12px] text-ink-faint">Private workspace</p>
          </div>
        </div>

        <p className="px-6 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
          Workspace
        </p>
        <nav aria-label="Main" className="px-3">
          <ul className="space-y-1">
            {ALL_NAV.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`desktop-nav-link ${active ? 'desktop-nav-link-active' : ''}`}
                  >
                    <NavIcon path={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto border-t border-line p-4">
          <p className="mb-3 truncate px-2 text-[12px] text-ink-faint" title={email}>{email}</p>
          <form action={signOut}>
            <button className="btn btn-quiet w-full" type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="mobile-header sticky top-0 z-30 flex min-h-[64px] items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <BrandMark size={32} />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold tracking-tight">Hamza Assistant</span>
              <span className="mobile-user-email block truncate text-[11px] text-ink-faint">{email}</span>
            </span>
          </Link>
          <form action={signOut} className="shrink-0">
            <button className="btn btn-quiet btn-small" type="submit">Sign out</button>
          </form>
        </header>

        <main
          id="main-content"
          className="mx-auto w-full min-w-0 max-w-[1280px] flex-1 px-4 pb-[calc(76px+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-7 lg:px-10 lg:pb-10 lg:pt-9"
        >
          {children}
        </main>

        {moreOpen && (
          <>
            <button
              type="button"
              className="mobile-more-backdrop lg:hidden"
              aria-label="Close more navigation"
              onClick={() => setMoreOpen(false)}
            />
            <nav id="mobile-more-panel" aria-label="More sections" className="mobile-more-panel lg:hidden">
              <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">More</p>
              {MORE_NAV.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={`mobile-more-link ${active ? 'mobile-more-link-active' : ''}`}
                  >
                    <NavIcon path={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </>
        )}

        <nav aria-label="Main" className="mobile-bottom-nav lg:hidden">
          <ul className="mx-auto flex w-full max-w-[560px]">
            {MAIN_NAV.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href} className="min-w-0 flex-1">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`mobile-nav-link ${active ? 'mobile-nav-link-active' : ''}`}
                  >
                    {active && <span className="mobile-nav-marker" aria-hidden="true" />}
                    <NavIcon path={item.icon} />
                    <span className="mobile-nav-label">{item.label}</span>
                  </Link>
                </li>
              );
            })}
            <li className="min-w-0 flex-1">
              <button
                type="button"
                className={`mobile-nav-link w-full ${moreActive || moreOpen ? 'mobile-nav-link-active' : ''}`}
                aria-expanded={moreOpen}
                aria-controls={moreOpen ? 'mobile-more-panel' : undefined}
                onClick={() => setMoreOpen((open) => !open)}
              >
                {(moreActive || moreOpen) && <span className="mobile-nav-marker" aria-hidden="true" />}
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
                <span className="mobile-nav-label">More</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
