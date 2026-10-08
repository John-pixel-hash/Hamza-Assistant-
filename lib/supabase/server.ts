import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';
import { shouldSecureCookies } from '@/lib/auth/cookie-security';

/**
 * Server Supabase client, bound to the signed in user's cookies so row level
 * security applies. This is the client used by pages, server actions and route
 * handlers. It never uses the secret key.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const secure = shouldSecureCookies({
    forwardedProto: headerStore.get('x-forwarded-proto'),
    protocol: headerStore.get('x-forwarded-proto') ? null : 'http:',
  });

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, { ...options, secure });
          }
        } catch {
          // Called from a Server Component render, where cookies are read only.
          // The proxy refreshes the session on every request instead.
        }
      },
    },
  });
}
