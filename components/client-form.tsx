'use client';

import { useActionState } from 'react';
import { createClientAction, updateClientAction, type ClientFormState } from '@/app/actions/clients';
import { CHANNELS, CHANNEL_LABELS, SOURCES, SOURCE_LABELS, STAGES, STAGE_LABELS } from '@/lib/domain';

const initialState: ClientFormState = { error: null };

export type ClientFormDefaults = {
  id?: string;
  name?: string;
  company?: string | null;
  stage?: string;
  source?: string | null;
  channel?: string | null;
  country?: string | null;
  deal_value?: string;
  currency?: string | null;
  tags?: string[];
  notes?: string | null;
};

export function ClientForm({ defaults = {} }: { defaults?: ClientFormDefaults }) {
  const isEdit = Boolean(defaults.id);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateClientAction : createClientAction,
    initialState,
  );

  return (
    <form action={formAction} className="card p-5">
      {state.error && (
        <div className="alert alert-error mb-4" role="alert">
          {state.error}
        </div>
      )}

      {isEdit && <input type="hidden" name="id" value={defaults.id} />}

      <div className="mb-4">
        <label className="label" htmlFor="name">
          Name or company
        </label>
        <input
          className="field"
          id="name"
          name="name"
          defaultValue={defaults.name ?? ''}
          maxLength={120}
          required
        />
        <p className="mt-1 text-[12px] text-ink-faint">
          Whatever you will recognise in six months. A person, a business, or both.
        </p>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="company">
            Company
          </label>
          <input className="field" id="company" name="company" defaultValue={defaults.company ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="country">
            Country or city
          </label>
          <input className="field" id="country" name="country" defaultValue={defaults.country ?? ''} />
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="stage">
            Stage
          </label>
          <select className="field" id="stage" name="stage" defaultValue={defaults.stage ?? 'lead'}>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="source">
            Came from
          </label>
          <select className="field" id="source" name="source" defaultValue={defaults.source ?? ''}>
            <option value="">Not known</option>
            {SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="channel">
            Talks on
          </label>
          <select className="field" id="channel" name="channel" defaultValue={defaults.channel ?? ''}>
            <option value="">Not known</option>
            {CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {CHANNEL_LABELS[channel]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="deal_value">
            Deal value
          </label>
          <input
            className="field"
            id="deal_value"
            name="deal_value"
            defaultValue={defaults.deal_value ?? ''}
            placeholder="1500 or 1.5k"
            inputMode="decimal"
          />
          <p className="mt-1 text-[12px] text-ink-faint">Your best estimate is fine. You can update it later.</p>
        </div>
        <div>
          <label className="label" htmlFor="currency">
            Currency
          </label>
          <input
            className="field"
            id="currency"
            name="currency"
            defaultValue={defaults.currency ?? 'USD'}
            maxLength={3}
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="label" htmlFor="tags">
          Tags
        </label>
        <input
          className="field"
          id="tags"
          name="tags"
          defaultValue={(defaults.tags ?? []).join(', ')}
          placeholder="shopify, urgent, repeat buyer"
        />
        <p className="mt-1 text-[12px] text-ink-faint">Comma separated. Useful for finding groups later.</p>
      </div>

      <div className="mb-5">
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <textarea
          className="field"
          id="notes"
          name="notes"
          defaultValue={defaults.notes ?? ''}
          placeholder="Anything you want in front of you before you reply."
        />
      </div>

      <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={pending}>
        {pending ? 'Saving...' : isEdit ? 'Save changes' : 'Add client'}
      </button>
    </form>
  );
}
