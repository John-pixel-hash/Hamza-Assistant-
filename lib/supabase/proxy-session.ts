import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';
import {
  applyPrivateCacheHeaders,
  shouldSecureCookies,
} from '@/lib/auth/cookie-security';

export type SessionState = {
  response: NextResponse;
  email: string | null;
  userId: string | null;
  /** True when Supabase could not be reached at all. */
  unreachable: boolean;
  /** True when this response carried a refreshed session cookie. */
  refreshed: boolean;
};

/**
 * Refreshes the Supabase session on every request and returns who is signed in.
 *
 * Uses getUser(), which verifies the token with the auth server. getSession()
 * only decodes the cookie and must not be used for access decisions.
 *
 * Two details here are deliberate and both were nearly missed:
 *
 *   - A new client is created for every request. The library keeps the required
 *     cache headers only for the first cookie write, so a reused client would
 *     leave later responses without them.
 *   - setAll takes a second argument, the headers that must accompany a
 *     response setting auth cookies. It is applied below. Dropping it lets a CDN
 *     cache a response containing somebody's session token.
 */
export async function refreshSession(request: NextRequest): Promise<SessionState> {
  let response = NextResponse.next({ request });
  let refreshed = false;

  const secure = shouldSecureCookies({
    forwardedProto: request.headers.get('x-forwarded-proto'),
    protocol: request.nextUrl.protocol,
  });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        refreshed = true;
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, { ...options, secure });
        }
        // The library supplies no-store headers for this write. They are applied
        // as given, and the constant is used if it ever omits them.
        if (headersToSet) {
          for (const [name, value] of Object.entries(headersToSet)) {
            response.headers.set(name, value);
          }
        } else {
          applyPrivateCacheHeaders(response.headers);
        }
      },
    },
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return {
      response,
      email: user?.email?.toLowerCase() ?? null,
      userId: user?.id ?? null,
      unreachable: false,
      refreshed,
    };
  } catch {
    // Network failure, invalid project URL, or placeholder keys during setup.
    // Treat as signed out rather than crashing the whole app.
    return { response, email: null, userId: null, unreachable: true, refreshed };
  }
}
