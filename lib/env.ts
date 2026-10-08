/**
 * Environment access, in one place.
 *
 * Public values fall back to placeholders so the app can build and render a
 * useful setup screen before keys exist. Server values are checked strictly by
 * the code paths that truly need them.
 *
 * Security rule: only variables prefixed NEXT_PUBLIC_ are ever sent to the
 * browser. The secret key and provider keys must never be.
 *
 * A note on Supabase key names. Supabase is retiring the legacy anon and
 * service_role keys in favour of a publishable key (sb_publishable_...) and a
 * secret key (sb_secret_...). A project created today may only offer the new
 * pair, while an older project still has the old one. The new name is read
 * first and the old name is the fallback, so either works without edits.
 */

/**
 * A secret key in a public variable would ship full database access to every
 * visitor. Supabase blocks secret keys used from a browser, but that is a
 * safety net for a curl call away from disaster, so it is checked here too and
 * the app refuses to start rather than quietly leak.
 */
export function keyMisuseProblem(value: string | undefined | null): string | null {
  if (!value) return null;
  if (value.startsWith('sb_secret_')) {
    return 'NEXT_PUBLIC_SUPABASE_ANON_KEY holds a secret key (sb_secret_). A secret key bypasses row level security and must never be sent to the browser. Use the publishable key (sb_publishable_) here instead, and move the secret to SUPABASE_SECRET_KEY.';
  }
  return null;
}

/**
 * Returns the first value that is genuinely filled in.
 *
 * This exists because `??` is wrong here. An empty variable is extremely common,
 * since a .env file lists every name and you only fill in the ones you need.
 * `??` treats an empty string as a real value, so a blank
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY would win over a correctly filled
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, and the app would fail with "your project's URL
 * and Key are required" while the key sat right there in the file. Blank has to
 * mean absent.
 */
export function firstFilled(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

const PUBLIC_KEY = firstFilled(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const publicKeyProblem = keyMisuseProblem(PUBLIC_KEY);
if (publicKeyProblem) throw new Error(publicKeyProblem);

export const SUPABASE_URL =
  firstFilled(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? 'https://placeholder.supabase.co';

export const SUPABASE_ANON_KEY = PUBLIC_KEY ?? 'placeholder-anon-key';

/** Server only. Bypasses row level security, so it never reaches the browser. */
export const SUPABASE_SECRET_KEY =
  firstFilled(process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY) ?? '';

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Hamza Assistant';

export const ALLOWED_EMAIL = (firstFilled(process.env.ALLOWED_EMAIL) ?? '').toLowerCase();

export const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === 'true';

export const DEFAULT_AI_PROVIDER = process.env.DEFAULT_AI_PROVIDER ?? 'google';

export const TONE_SCORE_THRESHOLD = Number(process.env.TONE_SCORE_THRESHOLD ?? 7);

/** True when the app has enough configuration to talk to Supabase. */
export const SUPABASE_CONFIGURED =
  !SUPABASE_URL.includes('placeholder') && !SUPABASE_ANON_KEY.includes('placeholder');

/** Server-only readiness checks, used by the dashboard setup checklist. */
export function serverConfigStatus() {
  const has = (name: string) => {
    const value = process.env[name];
    return Boolean(value && value.trim().length > 0 && !value.startsWith('your-'));
  };

  return {
    allowedEmail: ALLOWED_EMAIL.length > 0,
    supabaseUrl: Boolean(firstFilled(process.env.NEXT_PUBLIC_SUPABASE_URL)),
    supabaseKey: Boolean(
      firstFilled(
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
    ),
    secretKey: has('SUPABASE_SECRET_KEY') || has('SUPABASE_SERVICE_ROLE_KEY'),
    googleKey: has('GOOGLE_GENERATIVE_AI_API_KEY'),
    tavilyKey: has('TAVILY_API_KEY'),
  };
}

/**
 * True when this build is running on Vercel rather than on a laptop.
 *
 * Vercel sets VERCEL=1 in every environment it builds and runs, so this is a
 * reliable signal rather than a guess.
 */

/**
 * True when this build is running on Vercel.
 *
 * Three separate system variables are checked because they are not all exposed
 * the same way. VERCEL is the primary signal. VERCEL_ENV and VERCEL_URL are
 * accepted as corroboration so the advice cannot silently fall back to the
 * local wording when the app is in fact deployed.
 */
export function isHostedOnVercel(env: {
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
}): boolean {
  if (env.VERCEL === '1' || env.VERCEL === 'true') return true;
  return Boolean(env.VERCEL_ENV || env.VERCEL_URL);
}

export const ON_VERCEL = isHostedOnVercel({
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
});

/**
 * The variables a fresh deployment is missing, in the order they are worth
 * adding. Only the names, never a value.
 */
export const REQUIRED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
] as const;

/**
 * Where to put the keys, which depends entirely on where the app is running.
 *
 * This sentence used to say ".env.local, then restart the server" everywhere,
 * which is correct locally and actively misleading on a deployed app. Vercel
 * never reads .env.local. It was in the code only because local development was
 * the only place it had ever been seen. A message that sends somebody to edit a
 * file the server cannot see costs them an hour.
 */
export function missingKeysAdvice(input: { onVercel: boolean }): string {
  return input.onVercel
    ? 'Add them in Vercel under Settings, Environment Variables, then redeploy. Vercel does not read a .env.local file.'
    : 'Add them to .env.local, then restart the server.';
}
