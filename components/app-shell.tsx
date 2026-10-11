'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/actions/auth';
import { BrandMark } from '@/components/brand-mark';

const NAV = [
  { href: '/', label: 'Today', icon: 'M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z' },
  { href: '/chat', label: 'Chat', icon: 'M4 4h16v12H8.8L4 20V4z' },
  { href: '/clients', label: 'Clients', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8c0-3.3 3.6-5 8-5s8 1.7 8 5v1H4z' },
  { href: '/search', label: 'Search', icon: 'M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.2 4.2 1.4-1.4-4.2-4.2A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z' },
  { href: '/projects', label: 'Projects', icon: 'M4 5h16v4H4zM4 12h10v7H4zM17 12h3v7h-3z' },
  { href: '/settings', label: 'Settings', icon: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5c0-.6-.1-1.1-.2-1.6l2-1.5-2-3.4-2.3 1a8 8 0 0 0-2.8-1.6L14.4 2h-4.8l-.3 2.4a8 8 0 0 0-2.8 1.6l-2.3-1-2 3.4 2 1.5a9 9 0 0 0 0 3.2l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 2.8 1.6l.3 2.4h4.8l.3-2.4a8 8 0 0 0 2.8-1.6l2.3 1 2-3.4-2-1.5c.1-.5.2-1 .2-1.6Z' },
] as const;

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[860px] flex-col">
      {/* Gold hairline: one small brand detail at the very top of every screen. */}
      <div className="h-[3px] w-full bg-gradient-to-r from-gold via-gold to-brand" aria-hidden />

      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold tracking-tight">
                Hamza Assistant
              </span>
              <span className="block truncate text-[12px] text-ink-faint">{email}</span>
            </span>
          </Link>
          <form action={signOut}>
            <button className="btn btn-quiet btn-small" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-5 py-5 pb-24">{children}</main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/97 backdrop-blur"
      >
        <ul className="mx-auto flex w-full max-w-[860px]">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                    active ? 'text-brand' : 'text-ink-faint'
                  }`}
                >
                  {/* Gold marker on the active tab. */}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute top-0 h-[3px] w-8 rounded-b bg-gold"
                    />
                  )}
                  <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
