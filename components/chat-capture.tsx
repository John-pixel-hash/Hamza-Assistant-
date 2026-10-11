'use client';

import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';

import { chatCaptureAction, EMPTY_CHAT_STATE } from '@/app/actions/chat';
import { CHANNEL_LABELS, type Channel } from '@/lib/domain';
import { createClient } from '@/lib/supabase/client';

type UploadState = { uploading: boolean; path: string | null; name: string | null; error: string | null };

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

  const platformLabel =
    state.platform && state.platform !== 'unknown'
      ? CHANNEL_LABELS[state.platform as Channel] ?? state.platform
      : 'Unknown platform';

  return (
    <div>
      <form
        action={async (formData: FormData) => {
          setCopied(false);
          await formAction(formData);
        }}
        className="card p-4"
      >
        {state.error && !state.needsName && (
          <div className="alert alert-error mb-3" role="alert">
            {state.error}
          </div>
        )}

        {state.needsName && (
          <div className="alert alert-error mb-3" role="alert">
            I read the conversation but the person's name is not visible in the screenshot. Type it
            once and I will take it from there.
          </div>
        )}

        <label className="mb-1 block text-[13px] font-semibold" htmlFor="chat-screenshot">
          Screenshot of the conversation
        </label>
        <input
          id="chat-screenshot"
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => handleFiles(event.target.files)}
          className="mb-2 block w-full text-[13px]"
        />
        {upload.uploading && <p className="mb-2 text-[13px] text-ink-faint">Uploading...</p>}
        {upload.error && (
          <div className="alert alert-error mb-3" role="alert">
            {upload.error}
          </div>
        )}
        {upload.path && !upload.uploading && (
          <p className="mb-3 text-[13px] text-ink-faint">Attached: {upload.name}</p>
        )}

        {state.needsName && (
          <label className="mb-2 block text-[13px] font-semibold" htmlFor="chat-client-name">
            Client name
            <input
              id="chat-client-name"
              name="client_name"
              type="text"
              required
              className="input mt-1"
              placeholder="Who is this?"
            />
          </label>
        )}

        <input type="hidden" name="storage_path" value={upload.path ?? state.path ?? ''} />
        <input type="hidden" name="original_name" value={upload.name ?? 'screenshot'} />

        <button
          className="btn btn-primary w-full"
          type="submit"
          disabled={pending || upload.uploading || !(upload.path || state.path)}
        >
          {pending ? 'Reading and writing...' : 'Read it and write my reply'}
        </button>
      </form>

      {state.ok && state.reply && (
        <div className="card mt-4 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
            <span className="font-semibold uppercase tracking-wide">{platformLabel}</span>
            <span>·</span>
            <span>{state.clientName}</span>
            {state.createdClient && (
              <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-semibold">New client</span>
            )}
          </div>

          <p className="whitespace-pre-wrap text-[14px]">{state.reply}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-primary" type="button" onClick={copyReply}>
              {copied ? 'Copied' : 'Copy reply'}
            </button>
            {state.clientId && (
              <Link className="btn btn-quiet" href={`/clients/${state.clientId}`}>
                Open client
              </Link>
            )}
            <button
              className="btn btn-quiet"
              type="button"
              onClick={() => {
                setUpload({ uploading: false, path: null, name: null, error: null });
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              New screenshot
            </button>
          </div>

          {state.extracted && state.extracted.length > 0 && (
            <details className="mt-4 text-[13px] text-ink-faint">
              <summary className="cursor-pointer font-semibold">What I read from the screenshot</summary>
              <ul className="mt-2 space-y-1">
                {state.extracted.map((line, index) => (
                  <li key={index}>
                    <span className="font-semibold">{line.role === 'me' ? 'You' : 'Client'}:</span> {line.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
