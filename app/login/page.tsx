import Link from 'next/link';
import { LoginForm } from './login-form';
import { BrandMark } from '@/components/brand-mark';
import {
  ALLOWED_EMAIL,
  ALLOW_SIGNUP,
  APP_NAME,
  ON_VERCEL,
  REQUIRED_KEYS,
  SUPABASE_CONFIGURED,
  missingKeysAdvice,
} from '@/lib/env';

export const metadata = { title: `Sign in | ${APP_NAME}` };

/** Reads runtime configuration (ALLOWED_EMAIL, ALLOW_SIGNUP). Never prerender. */
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-12">
      <div className="mb-8">
        <BrandMark size={40} />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="mt-2 text-ink-soft">Private client and project assistant.</p>
      </div>

      {error === 'not_allowed' && (
        <div className="alert alert-error mb-5" role="alert">
          This system is private and that account is not the owner, so it was signed out.
        </div>
      )}

      {!SUPABASE_CONFIGURED && (
        <div className="alert alert-warn mb-5">
          <p className="font-medium">The database is not connected yet.</p>
          <p className="mt-1">{missingKeysAdvice({ onVercel: ON_VERCEL })}</p>
          <p className="mt-2 text-sm">
            These variables are missing or blank:{' '}
            {REQUIRED_KEYS.map((key) => (
              <code key={key} className="mr-1 break-all">
                {key}
              </code>
            ))}
          </p>
        </div>
      )}

      {SUPABASE_CONFIGURED && !ALLOWED_EMAIL && (
        <div className="alert alert-warn mb-5">
          No owner is configured yet, so sign in is locked.{' '}
          {ALLOW_SIGNUP ? (
            <Link className="underline" href="/setup">
              Create your account
            </Link>
          ) : (
            'Set ALLOWED_EMAIL and enable setup first.'
          )}
          .
        </div>
      )}

      <LoginForm nextPath={next && next.startsWith('/') ? next : '/'} />
    </main>
  );
}
