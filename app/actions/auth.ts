'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ALLOWED_EMAIL, ALLOW_SIGNUP, SUPABASE_CONFIGURED } from '@/lib/env';

export type AuthState = { error: string | null };

/**
 * Sign in. Only the configured owner email can enter the system.
 *
 * The allowed email is checked before the password is even sent, so an
 * unauthorised address cannot be used to test passwords against your account.
 */
export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!SUPABASE_CONFIGURED) {
    return { error: 'Supabase is not connected yet. Add your keys to .env.local first.' };
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const nextPath = String(formData.get('next') ?? '/') || '/';

  if (!email || !password) {
    return { error: 'Enter your email and password.' };
  }

  if (!ALLOWED_EMAIL) {
    return {
      error: 'ALLOWED_EMAIL is not set on the server, so nobody can sign in. Set it and redeploy.',
    };
  }

  if (email !== ALLOWED_EMAIL) {
    // Deliberately vague to the visitor, specific in the server log.
    console.warn('[auth] rejected sign in attempt for non-owner email');
    return { error: 'This system is private. That email is not authorised.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: 'Wrong email or password.' };
  }

  redirect(nextPath.startsWith('/') ? nextPath : '/');
}

/**
 * First run only: claim the single account.
 * Works only while ALLOW_SIGNUP is true and no owner email is set yet.
 */
export async function claimAccount(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!SUPABASE_CONFIGURED) {
    return { error: 'Supabase is not connected yet. Add your keys to .env.local first.' };
  }

  if (!ALLOW_SIGNUP) {
    return { error: 'Setup is closed. Sign in instead.' };
  }

  if (ALLOWED_EMAIL) {
    return {
      error: 'An owner is already configured. Setup is closed. Sign in instead.',
    };
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (!email.includes('@')) {
    return { error: 'Enter a valid email address.' };
  }
  if (password.length < 12) {
    return { error: 'Use at least 12 characters. This account holds your client data.' };
  }
  if (password !== confirm) {
    return { error: 'The two passwords do not match.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  return {
    error:
      `Account created. Now set ALLOWED_EMAIL=${email} in your environment, ` +
      'turn ALLOW_SIGNUP off, then sign in.',
  };
}

export async function signOut() {
  if (SUPABASE_CONFIGURED) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect('/login');
}
