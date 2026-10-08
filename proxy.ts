import { NextResponse, type NextRequest } from 'next/server';
import { decideAccess, isApiPath } from '@/lib/auth/guard';
import { refreshSession } from '@/lib/supabase/proxy-session';
import { applyPrivateCacheHeaders } from '@/lib/auth/cookie-security';
import { ALLOWED_EMAIL, ALLOW_SIGNUP } from '@/lib/env';

/**
 * The network boundary. In Next.js 16 this file is called proxy.ts (it replaced
 * middleware.ts) and it runs on the Node.js runtime.
 *
 * It does two jobs on every request:
 *   1. Refresh the Supabase session and find out who is signed in.
 *   2. Apply the access rules, which admit exactly one email address.
 *
 * Note: this is a first gate, not the only one. Every protected page and server
 * action also verifies the session server side before touching data, so a
 * mistake here cannot expose anything on its own.
 */
export default async function proxy(request: NextRequest) {
  const { response, email, userId, refreshed } = await refreshSession(request);
  const { pathname } = request.nextUrl;

  const decision = decideAccess({
    pathname,
    userEmail: email,
    allowedEmail: ALLOWED_EMAIL,
    allowSignup: ALLOW_SIGNUP,
  });

  if (decision.action === 'allow') {
    // Pass the verified user id downstream so pages do not have to re-verify
    // for simple renders. Pages still re-verify before any write.
    if (userId) {
      response.headers.set('x-user-id', userId);
    }

    // Every response past this point is either a private page or a response
    // that just carried a refreshed session cookie. Either way nothing between
    // here and the browser, a CDN included, may store it. This is set
    // unconditionally rather than only when `refreshed`, because a signed in
    // page rendered from cached HTML would be just as wrong.
    applyPrivateCacheHeaders(response.headers);

    return response;
  }

  if (decision.action === 'deny-api') {
    return NextResponse.json(
      { error: 'Not authorised' },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    );
  }

  const target = new URL(decision.to, request.url);

  // Remember where they were headed, but only when sending them to sign in.
  // Attaching this to other redirects would send them somewhere odd afterwards.
  if (decision.to === '/login' && !isApiPath(pathname)) {
    target.searchParams.set('next', pathname);
  }

  const redirect = NextResponse.redirect(target);
  // Preserve any refreshed auth cookies on the redirect itself.
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  applyPrivateCacheHeaders(redirect.headers);
  return redirect;
}

export const config = {
  /**
   * Run on everything except static assets and image optimisation, so a new
   * route is private by default without anyone remembering to add it.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
