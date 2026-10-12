'use client';

import { useActionState, useRef, useState } from 'react';

import { draftProjectUpdateAction, type ProjectUpdateState } from '@/app/actions/projects';

const initialState: ProjectUpdateState = { error: null, text: null };

/**
 * The client update, written from the tracker and nothing else. Editable
 * before copying, because an update he cannot adjust is an update he will
 * not send.
 */
export function ProjectUpdateDraft({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(draftProjectUpdateAction, initialState);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const shown = state.text ?? '';
  const [loaded, setLoaded] = useState('');
  if (shown !== '' && shown !== loaded) {
    setLoaded(shown);
    setText(shown);
  }
  const boxRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="card p-4">
      <h2 className="h2">Client update</h2>
      <p className="mt-1 text-[13px] muted">
        Written from the tracker only: what is done, what is in flight, what is blocked, and the
        one thing they need to do next.
      </p>

      <form action={formAction} className="mt-3">
        <input type="hidden" name="project_id" value={projectId} />
        <input
          className="field"
          name="extra"
          placeholder="Add one thing to mention, optional"
          type="text"
        />
        <button className="btn btn-primary mt-2 w-full" type="submit" disabled={pending}>
          {pending ? 'Writing the update...' : 'Draft the update'}
        </button>
      </form>

      {state.error && (
        <div className="alert alert-warn mt-3" role="alert">
          {state.error}
        </div>
      )}

      {state.text && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <label className="label" htmlFor="update-text">
              The update, ready to edit
            </label>
            <button
              className="btn btn-quiet btn-small"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(boxRef.current?.value ?? text);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            className="field mt-1"
            id="update-text"
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
            ref={boxRef}
          />
        </div>
      )}
    </div>
  );
}
