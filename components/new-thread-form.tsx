'use client';

import { useActionState } from 'react';
import { createThreadAction, type ThreadFormState } from '@/app/actions/threads';

const initialState: ThreadFormState = { error: null };

const MODE_LABELS: Record<string, string> = {
  client_reply: 'Client conversation',
  project: 'Project work',
  internal: 'Internal only',
};

export function NewThreadForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(createThreadAction, initialState);

  return (
    <form action={formAction} className="card p-4">
      {state.error && (
        <div className="alert alert-error mb-3" role="alert">
          {state.error}
        </div>
      )}

      <input type="hidden" name="client_id" value={clientId} />

      <label className="label" htmlFor="thread-title">
        Start a conversation thread
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="field"
          id="thread-title"
          name="title"
          placeholder="Store build quote"
          required
        />
        <select className="field sm:w-48" name="mode" defaultValue="client_reply">
          {Object.entries(MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary shrink-0" type="submit" disabled={pending}>
          {pending ? 'Starting...' : 'Start'}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-ink-faint">
        One thread per topic. A quote, a project, or a follow up keeps its own history.
      </p>
    </form>
  );
}
