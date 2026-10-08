/**
 * Session cookie hardening.
 *
 * Two things the Supabase libraries do not do for you, both of which only
 * matter once the app is deployed behind a real domain and a CDN.
 *
 * 1. The Secure attribute. Neither @supabase/ssr nor auth-js sets it. Without
 *    it the browser is willing to send the session cookie over plain HTTP.
 *    On a host that redirects to HTTPS the practical exposure is small, but the
 *    attribute costs nothing and closes the gap completely.
 *
 * 2. Cache headers on a response that carries a fresh session cookie. If a CDN
 *    or reverse proxy caches that response, it can hand one visitor's session
 *    token to somebody else. The library knows this and passes the required
 *    headers to setAll as a second argument. Dropping that argument, which is
 *    easy to do without noticing, is the dangerous case.
 *
 * Both functions are pure so the rules can be tested without a running server.
 */

const HTTPS = 'https';
const HTTP = 'http';

/**
 * True when the request reached us over HTTPS, so the cookie should be marked
 * Secure.
 *
 * The scheme is taken from the request rather than guessed from NODE_ENV. A
 * production build served over plain HTTP would break every sign in if Secure
 * were forced on, and a development build reached through an HTTPS tunnel
 * cannot set it from the environment alone.
 *
 * On a mismatch the answer is Secure. If any hop reports HTTPS, the visitor is
 * on an encrypted connection somewhere in the chain, and the safer of the two
 * answers is the one that keeps the token off plain HTTP. That also means a
 * spoofed `x-forwarded-proto: http` cannot talk the app out of hardening.
 */
export function shouldSecureCookies(input: {
  /** Raw x-forwarded-proto header, which may list several hops. */
  forwardedProto?: string | null;
  /** Protocol of the request URL, for example "https:". */
  protocol?: string | null;
}): boolean {
  const forwarded = (input.forwardedProto ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (forwarded.includes(HTTPS)) return true;

  const protocol = (input.protocol ?? '').toLowerCase().replace(':', '');
  if (protocol === HTTPS) return true;

  // An explicit http answer only matters when nothing upstream claimed https.
  if (forwarded.includes(HTTP)) return false;
  return false;
}

/**
 * Cache headers for any response that sets an authentication cookie.
 *
 * These are the headers @supabase/ssr passes to setAll. They are repeated here
 * as a constant so the proxy can apply them even on a path where the library
 * did not provide them, since a private page must never be cached by anything
 * between us and the browser.
 */
export const PRIVATE_CACHE_HEADERS: Record<string, string> = {
  'cache-control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  expires: '0',
  pragma: 'no-cache',
};

/** Applies the private cache headers to a Headers object in place. */
export function applyPrivateCacheHeaders(headers: Headers): Headers {
  for (const [name, value] of Object.entries(PRIVATE_CACHE_HEADERS)) {
    headers.set(name, value);
  }
  return headers;
}
