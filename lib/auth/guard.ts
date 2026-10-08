/**
 * Access rules for the whole app, kept as a pure function so they can be unit
 * tested without a server. This is the security core of Phase 1.
 *
 * Two independent conditions must both hold to enter:
 *   1. A verified Supabase session exists.
 *   2. The signed in email matches ALLOWED_EMAIL exactly.
 *
 * The second condition is what makes this a private system. Even if another
 * person somehow arrives with a valid Supabase account, they are rejected
 * before any page or API route runs.
 */

export type AccessDecision =
  | { action: 'allow' }
  | { action: 'redirect'; to: string }
  | { action: 'deny-api' };

export type GuardInput = {
  /** Pathname only, for example /clients or /login. */
  pathname: string;
  /** Verified email from Supabase, lowercased, or null when signed out. */
  userEmail: string | null;
  /** The single allowed account, lowercased. Empty string means "not set yet". */
  allowedEmail: string;
  /** True during first time setup, when no account has been created yet. */
  allowSignup: boolean;
};

/**
 * Paths that are reachable without a session. Everything not listed here is
 * private by default, including any route added later.
 */
const PUBLIC_PATHS = new Set(['/login', '/setup', '/privacy']);

/** API routes that must answer with JSON rather than an HTML redirect. */
const PUBLIC_API_PREFIXES = ['/api/health', '/api/auth/signout'];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

export function decideAccess(input: GuardInput): AccessDecision {
  const { pathname, userEmail, allowedEmail, allowSignup } = input;

  const emailMatches =
    userEmail !== null && allowedEmail.length > 0 && userEmail === allowedEmail;

  // --- Signed in as the owner ---------------------------------------------
  if (emailMatches) {
    // The login page is pointless once you are in.
    if (pathname === '/login' || pathname === '/setup') {
      return { action: 'redirect', to: '/' };
    }
    return { action: 'allow' };
  }

  // --- Signed in as somebody else -----------------------------------------
  if (userEmail !== null) {
    // Public paths stay reachable, most importantly /api/auth/signout, which is
    // how this visitor is sent back out. Without this they would loop forever.
    if (isPublicPath(pathname)) {
      return { action: 'allow' };
    }

    // A valid Supabase account that is not the owner. Never allowed through.
    if (isApiPath(pathname)) {
      return { action: 'deny-api' };
    }

    return { action: 'redirect', to: '/api/auth/signout?reason=not_allowed' };
  }

  // --- Signed out ---------------------------------------------------------
  if (isPublicPath(pathname)) {
    return { action: 'allow' };
  }

  // First run, before any account exists: send to setup so you can claim it.
  if (allowSignup) {
    return { action: 'redirect', to: '/setup' };
  }

  if (isApiPath(pathname)) {
    // API callers get a clean 401 in JSON, never an HTML login redirect.
    return { action: 'deny-api' };
  }

  return { action: 'redirect', to: '/login' };
}
