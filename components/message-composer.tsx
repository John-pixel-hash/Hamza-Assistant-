'use client';

import { useActionState, useRef, useState } from 'react';
import { postMessageAction, type ThreadFormState } from '@/app/actions/threads';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_LABELS, MESSAGE_ROLES, ROLE_LABELS } from '@/lib/domain';

const initialState: ThreadFormState = { error: null };

type Uploaded = { path: string; name: string; size: number; kind: string };

type UploadState = { uploading: boolean; uploaded: Uploaded[]; error: string | null };

function guessKind(file: File): string {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('text/')) return 'text';
  return 'other';
}

const PLACEHOLDERS: Record<string, string> = {
  client: 'Paste what the client sent you. A screenshot works too.',
  me: 'What you actually sent them.',
  note: 'Private note. Never shown to the client.',
};

/**
 * The composer bar for a saved thread, matching the chat screen: one bar at
 * the bottom with attach, text and send, and small role chips above it.
 * Everything it submits is unchanged from the old card form, so the server
 * action and the data it writes are exactly the same.
 */
export function MessageComposer({
  threadId,
  clientId,
  defaultRole = 'client',
  compact = false,
}: {
  threadId: string;
  clientId: string | null;
  defaultRole?: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(postMessageAction, initialState);
  const [role, setRole] = useState(defaultRole);
  const [upload, setUpload] = useState<UploadState>({ uploading: false, uploaded: [], error: null });
  const [hasText, setHasText] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setUpload({ uploading: true, uploaded: [], error: null });

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUpload({ uploading: false, uploaded: [], error: 'You are signed out. Sign in and try again.' });
      return;
    }

    const results: Uploaded[] = [];
    for (const file of Array.from(files).slice(0, 10)) {
      const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
      const path = `${user.id}/${clientId ?? 'general'}/${crypto.randomUUID()}.${extension}`;

      const { error } = await supabase.storage.from('attachments').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

      if (error) {
        setUpload({
          uploading: false,
          uploaded: results,
          error:
            'Upload failed. Check that the attachments storage bucket exists and that you are online.',
        });
        return;
      }

      results.push({ path, name: file.name, size: file.size, kind: guessKind(file) });
    }

    setUpload({ uploading: false, uploaded: results, error: null });
  }

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        formData.set('attachments', JSON.stringify(upload.uploaded));
        await formAction(formData);
        setUpload({ uploading: false, uploaded: [], error: null });
        setHasText(false);
      }}
      className="card mt-5 rounded-2xl p-3"
      aria-label="Add a message to this thread"
    >
      {state.error && (
        <div className="alert alert-error mb-2" role="alert">
          {state.error}
        </div>
      )}
      {upload.error && (
        <div className="alert alert-warn mb-2" role="status">
          {upload.error}
        </div>
      )}

      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="role" value={role} />

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {MESSAGE_ROLES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setRole(option)}
            aria-pressed={role === option}
            className={`btn btn-small ${role === option ? 'btn-primary' : 'btn-quiet'}`}
          >
            {ROLE_LABELS[option]}
          </button>
        ))}
        {role !== 'note' && (
          <select
            aria-label="Channel"
            className="field h-8 min-h-0 w-auto py-0 text-[12px]"
            name="channel"
            defaultValue="fiverr"
          >
            {CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {CHANNEL_LABELS[channel]}
              </option>
            ))}
          </select>
        )}
      </div>

      {upload.uploaded.length > 0 && (
        <ul className="mb-2 space-y-1 text-[13px] text-ink-soft">
          {upload.uploaded.map((file) => (
            <li key={file.path} className="flex items-center gap-2">
              <span className="text-brand" aria-hidden>
                &#10003;
              </span>
              {file.name}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <label
          htmlFor="thread-attachment"
          className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong text-ink-faint"
          title="Attach a file"
          aria-label="Attach a file to this message"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
          </svg>
          <input
            id="thread-attachment"
            aria-label="Attach a file to this message"
            type="file"
            className="sr-only"
            multiple
            accept="image/*,application/pdf,text/plain,text/csv"
            onChange={(event) => handleFiles(event.target.files)}
          />
        </label>

        <textarea
          className="field min-h-[42px] flex-1 resize-none py-2.5"
          name="content"
          placeholder={PLACEHOLDERS[role] ?? PLACEHOLDERS.client}
          rows={compact ? 1 : 2}
          required
          onChange={(event) => setHasText(event.target.value.trim().length > 0)}
        />

        <button
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"
          type="submit"
          disabled={pending || upload.uploading || !hasText}
          title={pending ? 'Saving...' : 'Save to history'}
          aria-label={pending ? 'Saving message to history' : 'Save message to history'}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M12 4l6 6h-4v10h-4V10H8z" />
          </svg>
        </button>
      </div>

      <p className="mt-2 text-[12px] text-ink-faint">
        {pending
          ? 'Saving...'
          : 'Nothing is sent to the client from here. This only records what happened.'}
      </p>
    </form>
  );
}
