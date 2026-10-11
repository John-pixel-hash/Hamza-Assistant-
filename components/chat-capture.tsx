'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';

import { chatCaptureAction } from '@/app/actions/chat';
import { EMPTY_CHAT_STATE } from '@/lib/chat/state';
import { CHANNEL_LABELS, type Channel } from '@/lib/domain';
import { createClient } from '@/lib/supabase/client';

type UploadState = { uploading: boolean; path: string | null; name: string | null; error: string | null };

/**
 * A chat shaped screen, the way the big assistants do it: the conversation as
 * bubbles, the reply as your bubble, and one composer bar at the bottom.
 */
export function ChatCapture() {
  const [state, formAction, pending] = useActionState(chatCaptureAction, EMPTY_CHAT_STATE);
  const [upload, setUpload] = useState<UploadState>({
    uploading: false,
    path: null,
    name: null,
    error: null,
  });
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setUpload({ uploading: false, path: null, name: null, error: null });
    setUpload({ uploading: true, path: null, name: null, error: null });

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUpload({ uploading: false, path: null, name: null, error: 'You are signed out. Sign in and try again.' });
      return;
    }

    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'png';
    const path = `${user.id}/chat/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('attachments').upload(path, file, {
      contentType: file.type || 'image/png',
      upsert: false,
    });
    if (error) {
      setUpload({ uploading: false, path: null, name: null, error: 'Upload failed. Check you are online and try again.' });
      return;
    }
    setUpload({ uploading: false, path, name: file.name, error: null });
  }

  async function copyReply() {
    if (!state.reply) return;
    try {
      await navigator.clipboard.writeText(state.reply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  // Remember second: the pass runs in its own request, outside the capture's
  // serverless time box. Fire and forget; the reply never waits for it.
  useEffect(() => {
    if (!state.ok || !state.threadId) return;
    fetch('/api/chat-memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: state.threadId }),
    }).catch(() => undefined);
  }, [state.ok, state.threadId]);

  const platformLabel =
    state.platform && state.platform !== 'unknown'
      ? CHANNEL_LABELS[state.platform as Channel] ?? state.platform
      : 'Unknown platform';

  const clientBubbles = state.extracted?.filter((line) => line.role === 'client') ?? [];
  const myBubbles = state.extracted?.filter((line) => line.role === 'me') ?? [];
  const hasConversation = state.ok || clientBubbles.length > 0 || Boolean(state.needsName);

  return (
    <div className="flex min-h-[62vh] flex-col justify-end">
      {!hasConversation && (
        <p className="mb-4 text-center text-[13px] text-ink-faint">
          Tap the plus, pick a screenshot of the chat, and send. I read it and
          answer as a message you can copy.
        </p>
      )}

      {hasConversation && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
          <span className="font-semibold uppercase tracking-wide">{platformLabel}</span>
          {state.clientName && (
            <>
              <span>·</span>
              <span>{state.clientName}</span>
            </>
          )}
          {state.createdClient && (
            <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-semibold">New client</span>
          )}
        </div>
      )}

      <div className="space-y-3">
        {clientBubbles.map((line, index) => (
          <div key={`c${index}`} className="flex justify-start">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-line px-4 py-2.5 text-[14px]">
              {line.text}
            </p>
          </div>
        ))}
        {myBubbles.map((line, index) => (
          <div key={`m${index}`} className="flex justify-end">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[14px] text-white">
              {line.text}
            </p>
          </div>
        ))}

        {pending && (
          <div className="flex justify-end">
            <p className="rounded-2xl rounded-br-md bg-brand/10 px-4 py-2.5 text-[13px] text-ink-faint">
              Reading and writing...
            </p>
          </div>
        )}

        {state.ok && state.reply && (
          <div className="flex flex-col items-end">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[14px] text-white">
              {state.reply}
            </p>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button className="btn btn-quiet btn-small" type="button" onClick={copyReply}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              {state.clientId && (
                <Link className="btn btn-quiet btn-small" href={`/clients/${state.clientId}`}>
                  Open client
                </Link>
              )}
              <button
                className="btn btn-quiet btn-small"
                type="button"
                onClick={() => {
                  setUpload({ uploading: false, path: null, name: null, error: null });
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                New chat
              </button>
            </div>
          </div>
        )}
      </div>

      <form
        action={async (formData: FormData) => {
          setCopied(false);
          await formAction(formData);
        }}
        className="card mt-4 rounded-3xl p-3"
      >
        {state.error && !state.needsName && (
          <div className="alert alert-error mb-2" role="alert">
            {state.error}
          </div>
        )}
        {upload.error && (
          <div className="alert alert-error mb-2" role="alert">
            {upload.error}
          </div>
        )}
        {state.needsName && (
          <label className="mb-2 block text-[13px] font-semibold" htmlFor="chat-client-name">
            I read the chat but the name is not visible. Who is this?
            <input
              id="chat-client-name"
              name="client_name"
              type="text"
              required
              className="input mt-1"
              placeholder="Client name"
            />
          </label>
        )}

        <div className="flex items-center gap-2">
          <label
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong text-ink-faint"
            htmlFor="chat-screenshot"
            title="Attach a screenshot"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
            </svg>
          </label>
          <input
            id="chat-screenshot"
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => handleFiles(event.target.files)}
            className="sr-only"
          />
          <p className="min-w-0 flex-1 truncate text-[13px] text-ink-faint">
            {upload.uploading
              ? 'Uploading...'
              : upload.path
                ? upload.name
                : 'Attach a screenshot of the conversation'}
          </p>
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"
            type="submit"
            disabled={pending || upload.uploading || !(upload.path || state.path)}
            title="Send"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 4l6 6h-4v10h-4V10H8z" />
            </svg>
          </button>
        </div>

        <input type="hidden" name="storage_path" value={upload.path ?? state.path ?? ''} />
        <input type="hidden" name="original_name" value={upload.name ?? 'screenshot'} />
      </form>
    </div>
  );
}
