'use client';

import { useActionState, useState } from 'react';

import {
  refreshPlaybookAction,
  savePlaybookAction,
  togglePlaybookAction,
  type KnowledgeFormState,
} from '@/app/actions/knowledge';
import { freshnessState, type PlaybookLike } from '@/lib/ai/knowledge';

type PlaybookRow = PlaybookLike & {
  id: string;
  version: number;
  active: boolean;
  updated_at: string;
};

const initialState: KnowledgeFormState = { error: null };

export function PlaybookCard({ playbook }: { playbook: PlaybookRow }) {
  const [saveState, saveAction, saving] = useActionState(savePlaybookAction, initialState);
  const [toggleState, toggleAction, toggling] = useActionState(togglePlaybookAction, initialState);
  const [refreshState, refreshAction, refreshing] = useActionState(refreshPlaybookAction, initialState);
  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(playbook.content);

  const { windowDays, stale } = freshnessState(playbook, Date.now());
  const error = saveState.error ?? toggleState.error ?? refreshState.error;

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{playbook.title}</p>
          <p className="mt-0.5 text-[12px] text-ink-faint">
            v{playbook.version} · {playbook.slug}
            {playbook.has_time_sensitive
              ? ` · figures rot in ${windowDays} days`
              : ' · fundamentals, no expiry'}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            !playbook.active
              ? 'bg-line text-ink-faint'
              : stale
                ? 'bg-warn-soft text-warn'
                : 'bg-brand-soft text-brand-ink'
          }`}
        >
          {!playbook.active
            ? 'resting'
            : stale
              ? 'stale, verify before citing'
              : playbook.has_time_sensitive
                ? 'fresh'
                : 'active'}
        </span>
      </div>

      <p className="mt-1 text-[12px] text-ink-faint">
        {playbook.last_researched_at
          ? `Last researched ${new Date(playbook.last_researched_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}`
          : 'Never researched'}
      </p>

      {error && (
        <div className="alert alert-warn mt-2" role="alert">
          {error}
        </div>
      )}

      {reading && !editing && (
        <p className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-[13px] text-ink-soft">
          {playbook.content}
        </p>
      )}

      {editing && (
        <form action={saveAction} className="mt-3">
          <input type="hidden" name="playbook_id" value={playbook.id} />
          <textarea
            className="field font-mono text-[12px]"
            name="content"
            rows={14}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button className="btn btn-primary btn-small" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save, bump the version'}
            </button>
            <button
              className="btn btn-quiet btn-small"
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(playbook.content);
              }}
            >
              Close
            </button>
          </div>
        </form>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn btn-quiet btn-small"
          type="button"
          onClick={() => {
            setReading((value) => !value);
            setEditing(false);
          }}
        >
          {reading ? 'Hide' : 'Read'}
        </button>
        <button
          className="btn btn-quiet btn-small"
          type="button"
          onClick={() => {
            setEditing((value) => !value);
            setReading(true);
          }}
        >
          {editing ? 'Stop editing' : 'Edit'}
        </button>
        {playbook.has_time_sensitive && (
          <form action={refreshAction} className="contents">
            <input type="hidden" name="playbook_id" value={playbook.id} />
            <button className="btn btn-quiet btn-small" type="submit" disabled={refreshing}>
              {refreshing ? 'Researching...' : 'Refresh from research'}
            </button>
          </form>
        )}
        <form action={toggleAction} className="contents">
          <input type="hidden" name="playbook_id" value={playbook.id} />
          <button className="btn btn-quiet btn-small" type="submit" disabled={toggling}>
            {playbook.active ? 'Shelve it' : 'Activate it'}
          </button>
        </form>
      </div>
    </li>
  );
}
