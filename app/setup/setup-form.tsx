'use client';

import { useActionState } from 'react';
import { claimAccount, type AuthState } from '@/app/actions/auth';

const initialState: AuthState = { error: null };

export function SetupForm() {
  const [state, formAction, pending] = useActionState(claimAccount, initialState);

  return (
    <form action={formAction} className="card p-5">
      {state.error && (
        <div
          className={state.error.startsWith('Account created') ? 'alert alert-warn mb-4' : 'alert alert-error mb-4'}
          role="status"
        >
          {state.error}
        </div>
      )}

      <div className="mb-4">
        <label className="label" htmlFor="email">
          Your email
        </label>
        <input className="field" id="email" name="email" type="email" required />
      </div>

      <div className="mb-4">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          className="field"
          id="password"
          name="password"
          type="password"
          minLength={12}
          required
        />
        <p className="mt-1 text-[13px] text-ink-faint">
          At least 12 characters. This protects every client conversation.
        </p>
      </div>

      <div className="mb-5">
        <label className="label" htmlFor="confirm">
          Confirm password
        </label>
        <input className="field" id="confirm" name="confirm" type="password" required />
      </div>

      <button className="btn btn-primary w-full" type="submit" disabled={pending}>
        {pending ? 'Creating...' : 'Create account'}
      </button>
    </form>
  );
}
