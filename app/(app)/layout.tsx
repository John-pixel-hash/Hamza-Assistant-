import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';

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
