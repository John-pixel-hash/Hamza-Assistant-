'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { draftReplyAction, saveSentAction } from '@/app/actions/drafts';
import { EMPTY_DRAFT_STATE, type DraftState, type SaveSentState } from '@/lib/ai/draft-state';

const CHANNELS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'fiverr', label: 'Fiverr' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'upwork', label: 'Upwork' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'call', label: 'Call' },
  { value: 'other', label: 'Other / not sure' },
];

const TONES = [
  { value: 'unknown', label: 'Use their tone' },
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
      className="btn btn-quiet btn-small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2500);
        } catch {
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
  const [slowDraft, setSlowDraft] = useState(false);
  const retrying = drafting && Boolean(draftState.error);

  useEffect(() => {
    if (!drafting) {
      setSlowDraft(false);
      return;
    }
    setSlowDraft(false);
    const timer = window.setTimeout(() => setSlowDraft(true), 20000);
    return () => window.clearTimeout(timer);
  }, [drafting]);

  const [incoming, setIncoming] = useState('');
  const [channel, setChannel] = useState(
    CHANNELS.some((item) => item.value === defaultChannel) ? defaultChannel : 'other',
  );
  const [tone, setTone] = useState('unknown');
  const [text, setText] = useState('');
  const [detectedTone, setDetectedTone] = useState<string | null>(null);
  const toneTouched = useRef(false);

  useEffect(() => {
    if (!draftState.draftSaved || !draftState.draft) return;
    setIncoming('');
    setDetectedTone(null);
    if (!toneTouched.current) setTone('unknown');
  }, [draftState.draftSaved, draftState.draft]);

  useEffect(() => {
    if (incoming.trim().length < 12) {
      setDetectedTone(null);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/tone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: incoming }),
        });
        if (!response.ok) return;
        const data = (await response.json()) as { tone?: string };
        const read = data.tone ?? 'unknown';
        setDetectedTone(read);
        if (!toneTouched.current) setTone(read);
      } catch {
        // Tone detection is optional and must never block a reply.
      }
    }, 600);
    return () => window.clearTimeout(handle);
  }, [incoming]);

  const shownDraft = draftState.draft ?? '';
  const [loadedDraft, setLoadedDraft] = useState('');
  if (shownDraft !== '' && shownDraft !== loadedDraft) {
    setLoadedDraft(shownDraft);
    setText(shownDraft);
  }

  return (
    <section className="card mt-4 p-4 sm:p-5" aria-busy={drafting} aria-labelledby="reply-panel-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Reply</p>
          <h2 id="reply-panel-title" className="h2 mt-1">Write a reply</h2>
        </div>
        {draftState.attempts > 0 && !drafting && (
          <span className="text-[12px] text-ink-faint">
            {draftState.attempts === 1 ? 'First attempt' : 'Repaired once'} ·{' '}
            {(draftState.latencyMs / 1000).toFixed(1)}s
            {draftState.modelId ? ` · ${draftState.modelId.replace('gemini-', '')}` : ''}
          </span>
        )}
      </div>

      {lastClientMessage ? (
        <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Latest from client</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-[14px] text-ink-soft">
            {lastClientMessage.length > 240 ? `${lastClientMessage.slice(0, 240)}...` : lastClientMessage}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-ink-soft">
          There is no client message saved yet. Paste one below to give the draft context.
        </p>
      )}

      <form action={draftAction} className="mt-3">
        <input name="thread_id" type="hidden" value={threadId} />

        <div>
          <label className="label" htmlFor="incoming">
            Newest client message (optional)
          </label>
          <textarea
            className="field"
            id="incoming"
            name="incoming"
            onChange={(event) => setIncoming(event.target.value)}
            placeholder="Paste a new client message. Leave blank to use the saved conversation."
            rows={2}
            value={incoming}
          />
          <p className="mt-1 text-[12px] text-ink-faint">
            A new message is saved to this thread before I draft. Leave it blank to use the latest saved message.
          </p>
        </div>

        <details className="disclosure mt-3 rounded-xl border border-line">
          <summary>Adjust platform, tone, or instructions</summary>
          <div className="grid grid-cols-1 gap-3 border-t border-line p-3 min-[390px]:grid-cols-2">
            <div>
              <label className="label" htmlFor="channel">Platform</label>
              <select
                className="field"
                id="channel"
                name="channel"
                onChange={(event) => setChannel(event.target.value)}
                value={channel}
              >
                {CHANNELS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="tone">Their tone</label>
              <select
                className="field"
                id="tone"
                name="tone"
                onChange={(event) => {
                  toneTouched.current = true;
                  setTone(event.target.value);
                }}
                value={tone}
              >
                {TONES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {detectedTone && detectedTone !== 'unknown' && (
                <p className="mt-1 text-[12px] text-ink-faint" aria-live="polite">
                  {toneTouched.current ? `Detected ${detectedTone}. You selected ${tone}.` : `Detected ${detectedTone}.`}
                </p>
              )}
            </div>
            <div className="min-[390px]:col-span-2">
              <label className="label" htmlFor="instruction">Extra guidance (optional)</label>
              <input
                className="field"
                id="instruction"
                name="instruction"
                placeholder="For example, mention the deadline"
                type="text"
              />
            </div>
          </div>
        </details>

        <button
          className={`btn btn-primary mt-3 w-full ${drafting ? 'btn-busy' : ''}`}
          disabled={drafting}
          type="submit"
        >
          {drafting && (
            <svg aria-hidden="true" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
            </svg>
          )}
          {drafting
            ? slowDraft
              ? 'Still working...'
              : retrying
                ? 'Retrying your draft...'
                : 'Writing your draft...'
            : 'Draft the reply'}
        </button>
        <p id="draft-help" className="mt-2 text-[13px] text-ink-faint" role="status" aria-live="polite" aria-atomic="true">
          {drafting
            ? slowDraft
              ? 'Taking longer than usual. No reply is sent automatically.'
              : 'Reading the thread and writing your reply.'
            : 'Usually takes 6 to 18 seconds. Each draft is saved here; you choose whether to send it.'}
        </p>
      </form>

      {draftState.error && !drafting && (
        <div className="alert alert-warn mt-3" role="alert">
          {draftState.error}
        </div>
      )}

      {draftState.draft && !drafting && (
        <div className="mt-4 border-t border-line pt-4">
          {draftState.draftSaved ? (
            <p className="mb-3 text-[13px] text-brand-ink" role="status">
              Saved to the thread as an assistant draft. Nothing has been sent.
            </p>
          ) : (
            <div className="alert alert-warn mb-3" role="alert">
              {draftState.draftSaveError ?? 'The draft is ready, but it is not saved yet. Copy it before you leave.'}
            </div>
          )}
          {draftState.fixed && draftState.ok && (
            <p className="mb-2 text-[13px] text-ink-faint">
              I adjusted the first draft to meet the reply checks. Review this version before sending.
            </p>
          )}
          {!draftState.ok && draftState.problems.length > 0 && (
            <div className="alert alert-warn mb-3" role="alert">
              <p className="font-semibold">Review these points before sending</p>
              <ul className="mt-1 list-disc pl-5 text-[13px]">
                {draftState.problems.map((problem) => <li key={problem}>{problem}</li>)}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <label className="label mb-0" htmlFor="sent">Draft reply</label>
            <CopyButton text={text} />
          </div>
          <textarea
            className="field mt-2"
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
            <input name="sent" type="hidden" value={text} />
            <button
              className="btn btn-primary w-full"
              disabled={saving || text.trim().length < 2}
              type="submit"
            >
              {saving ? 'Saving...' : 'I sent this, save it as sent'}
            </button>
            <p className="mt-2 text-[12px] text-ink-faint">
              After you send it on the selected platform, save the exact wording here. It will be marked as sent and used as context next time.
            </p>
          </form>

          {saveState.error && <div className="alert alert-warn mt-2" role="alert">{saveState.error}</div>}
          {saveState.saved && (
            <p className="mt-2 text-[13px] text-brand-ink" role="status">
              Saved as your sent reply. The next draft will use it as context.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
