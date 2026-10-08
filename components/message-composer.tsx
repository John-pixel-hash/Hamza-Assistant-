'use client';

import { useActionState, useRef, useState } from 'react';
import { postMessageAction, type ThreadFormState } from '@/app/actions/threads';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_LABELS, MESSAGE_ROLES, ROLE_LABELS } from '@/lib/domain';

const initialState: ThreadFormState = { error: null };

const ROLE_HINT: Record<string, string> = {
  client: 'Paste what the client sent you.',
  me: 'What you actually sent them.',
  note: 'Only for you. Never shown to the client.',
};

type Uploaded = { path: string; name: string; size: number; kind: string };

type UploadState = { uploading: boolean; uploaded: Uploaded[]; error: string | null };

function guessKind(file: File): string {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('text/')) return 'text';
  return 'other';
}

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
      }}
      className="card p-4"
    >
      {state.error && (
        <div className="alert alert-error mb-3" role="alert">
          {state.error}
        </div>
      )}

      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="role" value={role} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
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
        <span className="text-[12px] text-ink-faint">{ROLE_HINT[role]}</span>
      </div>

      <textarea
        className="field"
        name="content"
        placeholder={
          role === 'client'
            ? 'Paste the client message here. A screenshot below works too.'
            : role === 'me'
              ? 'What you sent them, so the history is complete.'
              : 'Your own note. Budget signals, promises, anything to remember.'
        }
        rows={compact ? 3 : 5}
        required
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {role !== 'note' && (
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            Channel
            <select className="field h-[38px] min-h-0 w-auto py-0" name="channel" defaultValue="fiverr">
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {CHANNEL_LABELS[channel]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="btn btn-quiet btn-small cursor-pointer">
          <input
            type="file"
            className="hidden"
            multiple
            accept="image/*,application/pdf,text/plain,text/csv"
            onChange={(event) => handleFiles(event.target.files)}
          />
          {upload.uploading ? 'Uploading...' : 'Attach screenshot'}
        </label>
      </div>

      {upload.error && (
        <div className="alert alert-warn mt-3" role="status">
          {upload.error}
        </div>
      )}

      {upload.uploaded.length > 0 && (
        <ul className="mt-3 space-y-1 text-[13px] text-ink-soft">
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

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[12px] text-ink-faint">
          Nothing is sent to the client from here. This only records what happened.
        </p>
        <button className="btn btn-primary" type="submit" disabled={pending || upload.uploading}>
          {pending ? 'Saving...' : 'Save to history'}
        </button>
      </div>
    </form>
  );
}
