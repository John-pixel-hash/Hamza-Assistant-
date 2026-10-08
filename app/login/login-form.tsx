'use client';

import { useActionState } from 'react';
import { signIn, type AuthState } from '@/app/actions/auth';

const initialState: AuthState = { error: null };

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="card p-5">
      {state.error && (
        <div className="alert alert-error mb-4" role="alert">
          {state.error}
        </div>
      )}

      <input type="hidden" name="next" value={nextPath} />

      <div className="mb-4">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          className="field"
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
        />
      </div>

      <div className="mb-5">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          className="field"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <button className="btn btn-primary w-full" type="submit" disabled={pending}>
        {pending ? 'Signing in...' : 'Sign in'}
      </button>

      <p className="mt-4 text-[13px] text-ink-faint">
        This system has one account. Other addresses are rejected.
      </p>
    </form>
  );
}
