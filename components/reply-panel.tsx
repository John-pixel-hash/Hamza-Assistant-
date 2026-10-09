'use client';

import { useState } from 'react';
import { useActionState } from 'react';

import {
  EMPTY_DRAFT_STATE,
  draftReplyAction,
  saveSentAction,
  type DraftState,
  type SaveSentState,
} from '@/app/actions/drafts';

/**
 * The reply panel: paste what the client sent, get a draft, edit it, keep it.
 *
 * Built for a phone first. The draft arrives in a text box rather than as
 * finished text, because a draft he cannot adjust is a draft he will not trust.
 *
 * The activity line matters: a real draft takes 6 to 18 seconds. Silence for
 * that long reads as broken, so the panel says what it is doing.
 */

const CHANNELS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'fiverr', label: 'Fiverr' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'upwork', label: 'Upwork' },
  { value: 'linkedin', label: 'LinkedIn' },
];

const TONES = [
  { value: 'unknown', label: 'Work it out' },
  { value: 'casual', label: 'Casual' },
  { value: 'formal', label: 'Formal' },
  { value: 'short', label: 'Short' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'warm', label: 'Warm' },
  { value: 'direct', label: 'Direct' },
];

const SAVE_SENT_INITIAL: SaveSentState = { error: null, saved: false };

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="btn btn-quiet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2500);
        } catch {
          // Clipboard access can be refused. The text box is still selectable,
          // so this is a convenience failing, not the feature failing.
          setCopied(false);
        }
      }}
      type="button"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function ReplyPanel({
  threadId,
  defaultChannel,
  lastClientMessage,
}: {
  threadId: string;
  defaultChannel: string;
  lastClientMessage?: string | null;
}) {
  const [draftState, draftAction, drafting] = useActionState(draftReplyAction, EMPTY_DRAFT_STATE);
  const [saveState, saveAction, saving] = useActionState(saveSentAction, SAVE_SENT_INITIAL);

  const [incoming, setIncoming] = useState('');
  const [channel, setChannel] = useState(
    CHANNELS.some((c) => c.value === defaultChannel) ? defaultChannel : 'instagram',
  );
  const [tone, setTone] = useState('unknown');
  const [text, setText] = useState('');

  // When a new draft arrives it goes into the editable box. Adjusting state
  // during render is the documented React pattern for a value derived from a
  // changing source, and it means the box never shows a stale draft.
  const shownDraft = draftState.draft ?? '';
  const [loadedDraft, setLoadedDraft] = useState('');
  if (shownDraft !== '' && shownDraft !== loadedDraft) {
    setLoadedDraft(shownDraft);
    setText(shownDraft);
  }

  return (
    <section className="card mt-4 p-4" aria-busy={drafting}>
      <div className="flex items-baseline justify-between">
        <h2 className="h2">Write a reply</h2>
        {draftState.attempts > 0 && !drafting && (
          <span className="text-[12px] text-ink-faint">
            {draftState.attempts === 1 ? 'first attempt' : 'repaired once'} ·{' '}
            {(draftState.latencyMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      <p className="mt-1 text-[13px] muted">
        Paste what they sent, or leave it empty to reply to the last message in the thread.
      </p>

      {lastClientMessage && (
        <p className="mt-2 rounded-lg border border-line bg-surface p-3 text-[13px] text-ink-soft">
          <span className="font-medium">Last from them: </span>
          {lastClientMessage.length > 180
            ? `${lastClientMessage.slice(0, 180)}...`
            : lastClientMessage}
        </p>
      )}

      <form action={draftAction} className="mt-3">
        <input name="thread_id" type="hidden" value={threadId} />

        <label className="label" htmlFor="incoming">
          What the client sent
        </label>
        <textarea
          className="field mt-1"
          id="incoming"
          name="incoming"
          onChange={(event) => setIncoming(event.target.value)}
          placeholder="Paste their message here. Or keep it blank to use the thread history."
          rows={3}
          value={incoming}
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="channel">
              Platform
            </label>
            <select
              className="field mt-1"
              id="channel"
              name="channel"
              onChange={(event) => setChannel(event.target.value)}
              value={channel}
            >
              {CHANNELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tone">
              Their tone
            </label>
            <select
              className="field mt-1"
              id="tone"
              name="tone"
              onChange={(event) => setTone(event.target.value)}
              value={tone}
            >
              {TONES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="label mt-3" htmlFor="instruction">
          Anything I should know (optional)
        </label>
        <input
          className="field mt-1"
          id="instruction"
          name="instruction"
          placeholder="For example: he is sensitive about price, or mention the deadline"
          type="text"
        />

        <button className="btn btn-primary mt-3 w-full" disabled={drafting} type="submit">
          {drafting ? 'Writing the draft...' : 'Draft the reply'}
        </button>
        <p className="mt-2 text-[12px] text-ink-faint">
          {drafting
            ? 'Reading the thread and writing. Stay on this screen.'
            : 'Takes ten to twenty seconds, because it reads the whole thread first.'}
        </p>
      </form>

      {draftState.error && (
        <div className="alert alert-warn mt-3" role="alert">
          {draftState.error}
        </div>
      )}

      {draftState.draft && !drafting && (
        <div className="mt-4 border-t border-line pt-4">
          {draftState.fixed && draftState.ok && (
            <p className="mb-2 text-[12px] text-ink-faint">
              The first attempt broke a rule, so it was written again. This one is clean.
            </p>
          )}
          {!draftState.ok && draftState.problems.length > 0 && (
            <div className="alert alert-warn mb-2" role="alert">
              <p className="font-medium">Read this one before sending it.</p>
              <ul className="mt-1 list-disc pl-4 text-[13px]">
                {draftState.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-baseline justify-between">
            <label className="label" htmlFor="sent">
              The draft, ready to edit
            </label>
            <CopyButton text={text} />
          </div>
          <textarea
            className="field mt-1"
            id="sent"
            onChange={(event) => setText(event.target.value)}
            rows={5}
            value={text}
          />
          <p className="mt-1 text-[12px] text-ink-faint">
            {text.trim() === '' ? 0 : text.trim().split(/\s+/).length} words ·{' '}
            {text.split('?').length - 1} question{text.split('?').length - 1 === 1 ? '' : 's'}
          </p>

          <form action={saveAction} className="mt-3">
            <input name="thread_id" type="hidden" value={threadId} />
            <input name="channel" type="hidden" value={channel} />
            <input name="incoming" type="hidden" value={incoming} />
            <input name="sent" type="hidden" value={text} />
            <button
              className="btn btn-primary w-full"
              disabled={saving || text.trim().length < 2}
              type="submit"
            >
              {saving ? 'Saving...' : 'I sent this, save it to the thread'}
            </button>
          </form>

          {saveState.error && (
            <div className="alert alert-warn mt-2" role="alert">
              {saveState.error}
            </div>
          )}
          {saveState.saved && (
            <p className="mt-2 text-[13px] text-ink-soft">
              Saved. It is on the thread now, so the next draft knows what you said.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
