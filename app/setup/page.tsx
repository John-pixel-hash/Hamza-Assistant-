import { redirect } from 'next/navigation';
import { SetupForm } from './setup-form';
import { BrandMark } from '@/components/brand-mark';
import {
  ALLOWED_EMAIL,
  ALLOW_SIGNUP,
  APP_NAME,
  ON_VERCEL,
  SUPABASE_CONFIGURED,
  missingKeysAdvice,
} from '@/lib/env';

export const metadata = { title: `Setup | ${APP_NAME}` };

/**
 * Dynamic on purpose. This page reads environment variables that change between
 * deploys (ALLOW_SIGNUP, ALLOWED_EMAIL). If Next prerendered it at build time,
 * first run setup would be frozen to whatever the build machine saw.
 */
export const dynamic = 'force-dynamic';

export default function SetupPage() {
  // Setup is closed the moment an owner exists.
  if (!ALLOW_SIGNUP || ALLOWED_EMAIL) {
    redirect('/login');
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-12">
      <div className="mb-8">
        <BrandMark size={40} />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">First run setup</h1>
        <p className="mt-2 text-ink-soft">
          Create the single account that owns this system. After this, signup closes
          permanently and only this email can sign in.
        </p>
      </div>

      {!SUPABASE_CONFIGURED && (
        <div className="alert alert-warn mb-5">
          The database is not connected yet, so no account can be created. {missingKeysAdvice({ onVercel: ON_VERCEL })}
        </div>
      )}

      <SetupForm />
    </main>
  );
}
