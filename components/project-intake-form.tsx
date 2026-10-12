'use client';

import { useActionState } from 'react';

import { createProjectAction, type ProjectFormState } from '@/app/actions/projects';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'PKR', 'AED', 'SAR', 'CAD', 'AUD'];

const initialState: ProjectFormState = { error: null };

/**
 * Project intake. One screen, honest about time: the AI pass restates the
 * brief and writes the gap questions, which takes ten to twenty seconds, so
 * the form says what it is doing instead of sitting silent.
 */
export function ProjectIntakeForm({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createProjectAction, initialState);

  return (
    <form action={formAction} className="card p-4">
      {state.error && (
        <div className="alert alert-error mb-3" role="alert">
          {state.error}
        </div>
      )}

      <label className="label" htmlFor="project-title">
        Project title
      </label>
      <input
        className="field mt-1"
        id="project-title"
        name="title"
        required
        minLength={3}
        placeholder="For example: Store rebuild for Ali"
      />

      <label className="label mt-3" htmlFor="project-client">
        Client
      </label>
      <select className="field mt-1" id="project-client" name="client_id" defaultValue="">
        <option value="">No client linked yet</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>

      <label className="label mt-3" htmlFor="project-brief">
        The brief, in your words
      </label>
      <textarea
        className="field mt-1"
        id="project-brief"
        name="brief"
        required
        minLength={20}
        rows={6}
        placeholder="Paste what the client asked for, or write it yourself. Include everything they said about the site, the deadline, the budget, and anything they are vague about. Vague parts are fine, they become questions."
      />

      <label className="label mt-3" htmlFor="project-deliverables">
        Deliverables, one per line (optional)
      </label>
      <textarea
        className="field mt-1"
        id="project-deliverables"
        name="deliverables"
        rows={3}
        placeholder={'5 page WordPress site\nContact form to email\nBasic SEO setup'}
      />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="project-deadline">
            Deadline (optional)
          </label>
          <input className="field mt-1" id="project-deadline" name="deadline" type="date" />
        </div>
        <div>
          <label className="label" htmlFor="project-budget">
            Budget (optional)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              className="field min-w-0 flex-1"
              id="project-budget"
              name="budget_amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="250"
            />
            <select className="field w-auto" name="currency" defaultValue="USD" aria-label="Currency">
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <button className="btn btn-primary mt-4 w-full" type="submit" disabled={pending}>
        {pending ? 'Reading the brief and writing the questions...' : 'Create the project'}
      </button>
      <p className="mt-2 text-[12px] text-ink-faint">
        {pending
          ? 'Restating your brief and finding the gaps. Takes ten to twenty seconds. Stay on this screen.'
          : 'It restates the brief and writes the questions a professional asks before planning. Nothing is sent to the client.'}
      </p>
    </form>
  );
}
