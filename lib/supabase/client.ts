'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

/**
 * Browser Supabase client. Public key only, no elevated privileges.
 * Session cookies are managed by @supabase/ssr, not by hand.
 *
 * cookieOptions matches what the server writes, so the browser cannot quietly
 * take a cookie the server marked Secure and rewrite it without the attribute.
 * The scheme is read from the page rather than assumed, so local development
 * over http still works.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: {
      secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
    },
  });
}
