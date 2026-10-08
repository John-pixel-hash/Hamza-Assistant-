import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';

/**
 * Ends a session and returns to the login screen.
 *
 * Why a route rather than a server action: the proxy sends a signed in but
 * unauthorised visitor here, and a redirect target has to be a GET.
 */
export async function GET(request: NextRequest) {
  if (SUPABASE_CONFIGURED) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // Already invalid session. Nothing to clear that matters.
    }
  }

  const url = new URL('/login', request.url);
  const reason = request.nextUrl.searchParams.get('reason');
  if (reason) url.searchParams.set('error', reason);

  const response = NextResponse.redirect(url);
  response.headers.set('cache-control', 'no-store');
  return response;
}
