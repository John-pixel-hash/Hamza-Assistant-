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
      <p className="mb-2 mt-0.5 text-[12px] text-ink-faint">
        {hasStoredKey
          ? 'A key is saved in your account.'
          : hasEnvKey
            ? 'Using the key from the server environment.'
            : 'Not set yet. Free at app.tavily.com, about 1000 searches a month.'}
      </p>
      <div className="flex gap-2">
        <input
          name="tavily_key"
          type="password"
          autoComplete="off"
          className="input flex-1"
          placeholder="tvly-..."
        />
        <button className="btn btn-primary shrink-0" type="submit" disabled={pending}>
          {pending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}
