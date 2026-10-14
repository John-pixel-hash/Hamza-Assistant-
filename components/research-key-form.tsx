'use client';

import { useActionState } from 'react';

import { saveTavilyKeyAction, type ResearchKeyState } from '@/app/actions/settings';

export function ResearchKeyForm({ hasStoredKey, hasEnvKey }: { hasStoredKey: boolean; hasEnvKey: boolean }) {
  const [state, formAction, pending] = useActionState(saveTavilyKeyAction, {
    error: null,
  } as ResearchKeyState);

  return (
    <form action={formAction} className="card p-4">
      {state.error && (
        <div className="alert alert-error mb-2" role="alert">
          {state.error}
        </div>
      )}
      {state.saved && !state.error && (
        <div className="alert mb-2" role="status">
          Saved. Research is live.
        </div>
      )}
      <p className="text-[14px] font-medium">Tavily research key</p>
      <p className="mb-3 mt-1 text-[13px] text-ink-faint">
        {hasStoredKey
          ? 'A key is saved securely for your account.'
          : hasEnvKey
            ? 'Using the server key.'
            : 'Add a Tavily key to enable live research.'}
      </p>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <input
          name="tavily_key"
          type="password"
          autoComplete="off"
          className="field min-w-0 flex-1"
          placeholder="tvly-..."
        />
        <button className="btn btn-primary w-full shrink-0 sm:w-auto" type="submit" disabled={pending}>
          {pending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}
