import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Vercel's free plan kills any function that runs past ten seconds, and a
 * careful draft with the repair loop takes six to thirty. Sixty is the ceiling
 * the Hobby plan allows, and setting it on this layout covers every server
 * action under it, now and later.
 */
export const maxDuration = 60;

/**
 * Layout for every private page.
 *
 * This is the second gate. The proxy already turned away anyone who is not the
 * owner, but this re-checks server side because a page must never assume it was
 * reached through the proxy. If this check fails, nothing renders.
 */
export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  if (!SUPABASE_CONFIGURED) {
    redirect('/login');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <AppShell email={user.email ?? ''}>{children}</AppShell>;
}
