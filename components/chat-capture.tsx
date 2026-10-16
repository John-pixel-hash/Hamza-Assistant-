'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';

import { chatCaptureAction } from '@/app/actions/chat';
import { EMPTY_CHAT_STATE } from '@/lib/chat/state';
import {
  MAX_CHAT_BATCH_BYTES,
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_SCREENSHOTS,
  moveScreenshotAt,
  type ChatScreenshotUpload,
} from '@/lib/chat/capture-core';
import { CHANNEL_LABELS, type Channel } from '@/lib/domain';
import { createClient } from '@/lib/supabase/client';

type UploadedScreenshot = ChatScreenshotUpload & {
  size: number;
  previewUrl: string | null;
  saved: boolean;
};

type UploadState = {
  uploading: boolean;
  uploadingCount: number;
  uploaded: UploadedScreenshot[];
  touched: boolean;
  error: string | null;
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * A chat shaped screen, the way the big assistants do it: the conversation as
 * bubbles, the reply as your bubble, and one composer bar at the bottom.
 */
export function ChatCapture() {
  const [state, formAction, pending] = useActionState(chatCaptureAction, EMPTY_CHAT_STATE);
  const [upload, setUpload] = useState<UploadState>({
    uploading: false,
    uploadingCount: 0,
    uploaded: [],
    touched: false,
    error: null,
  });
  const [copied, setCopied] = useState(false);
  const [selectionChanged, setSelectionChanged] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());

  const selectedUploads: UploadedScreenshot[] = upload.touched
    ? upload.uploaded
    : (state.uploads ?? []).map((item) => ({
        ...item,
        size: 0,
        previewUrl: null,
        saved: state.conversationSaved === true,
      }));

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
  }, []);

  // Once the server confirms the screenshot links are saved, never remove those
  // private files just because the user edits the unsent selection.
  useEffect(() => {
    if (!state.conversationSaved) return;
    setUpload((previous) => {
      const items = previous.touched
        ? previous.uploaded
        : (state.uploads ?? []).map((item) => ({
            ...item,
            size: 0,
            previewUrl: null,
            saved: false,
          }));
      if (items.length === 0) return previous;
      return {
        ...previous,
        touched: true,
        uploaded: items.map((item) => ({ ...item, saved: true })),
      };
    });
  }, [state.conversationSaved, state.uploads]);

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setSelectionChanged(true);

    const existing = selectedUploads;
    const availableSlots = MAX_CHAT_SCREENSHOTS - existing.length;
    if (files.length > availableSlots) {
      setUpload((previous) => ({
        ...previous,
        error: `You can select up to ${MAX_CHAT_SCREENSHOTS} screenshots in one capture. Remove one before adding more.`,
      }));
      return;
    }

    if (files.some((file) => !IMAGE_EXTENSIONS[file.type])) {
      setUpload((previous) => ({
        ...previous,
        error: 'Choose PNG, JPEG, or WebP screenshots.',
      }));
      return;
    }
    if (files.some((file) => file.size === 0 || file.size > MAX_CHAT_IMAGE_BYTES)) {
      setUpload((previous) => ({
        ...previous,
        error: 'Each screenshot must be 8 MB or less.',
      }));
      return;
    }
    const currentBytes = existing.reduce((sum, item) => sum + item.size, 0);
    const newBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (currentBytes + newBytes > MAX_CHAT_BATCH_BYTES) {
      setUpload((previous) => ({
        ...previous,
        error: 'Keep the screenshots under 12 MB in total.',
      }));
      return;
    }

    const preserved = existing.map((item) => ({ ...item }));
    setUpload((previous) => ({
      ...previous,
      uploading: true,
      uploadingCount: files.length,
      uploaded: preserved,
      touched: true,
      error: null,
    }));

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUpload((previous) => ({
          ...previous,
          uploading: false,
          uploadingCount: 0,
          error: 'You are signed out. Sign in and try again.',
        }));
        return;
      }

      const results = await Promise.all(files.map(async (file) => {
        const extension = IMAGE_EXTENSIONS[file.type] ?? 'png';
        const path = `${user.id}/chat/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from('attachments').upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        return { file, path, error };
      }));

      if (results.some((result) => result.error)) {
        const successfulPaths = results.filter((result) => !result.error).map((result) => result.path);
        if (successfulPaths.length > 0) {
          await supabase.storage.from('attachments').remove(successfulPaths);
        }
        setUpload((previous) => ({
          ...previous,
          uploading: false,
          uploadingCount: 0,
          error: 'One or more screenshots failed to upload. Nothing new was added. Try again.',
        }));
        return;
      }

      const additions = results.map(({ file, path }) => {
        const previewUrl = URL.createObjectURL(file);
        previewUrls.current.add(previewUrl);
        return {
          path,
          name: file.name,
          size: file.size,
          previewUrl,
          saved: false,
        };
      });
      setUpload((previous) => ({
        ...previous,
        uploading: false,
        uploadingCount: 0,
        uploaded: [...previous.uploaded, ...additions],
        touched: true,
        error: null,
      }));
    } catch {
      setUpload((previous) => ({
        ...previous,
        uploading: false,
        uploadingCount: 0,
        error: 'Upload failed. Check you are online and try again.',
      }));
    }
  }

  function moveScreenshot(index: number, direction: -1 | 1) {
    setSelectionChanged(true);
    const target = index + direction;
    if (target < 0 || target >= selectedUploads.length) return;
    const reordered = moveScreenshotAt(selectedUploads, index, direction);
    setUpload((previous) => ({
      ...previous,
      uploaded: reordered,
      touched: true,
      error: null,
    }));
  }

  async function removeScreenshot(index: number) {
    setSelectionChanged(true);
    const item = selectedUploads[index];
    if (!item) return;
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      previewUrls.current.delete(item.previewUrl);
    }
    const remaining = selectedUploads.filter((_, itemIndex) => itemIndex !== index);
    setUpload((previous) => ({
      ...previous,
      uploaded: remaining,
      touched: true,
      error: null,
    }));

    if (!item.saved) {
      try {
        const supabase = createClient();
        const { error } = await supabase.storage.from('attachments').remove([item.path]);
        if (error) {
          setUpload((previous) => ({
            ...previous,
            error: 'Screenshot removed from the selection, but its private upload could not be deleted.',
          }));
        }
      } catch {
        setUpload((previous) => ({
          ...previous,
          error: 'Screenshot removed from the selection, but its private upload could not be deleted.',
        }));
      }
    }
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
  const hasConversation = state.ok || Boolean(state.extracted?.length) || Boolean(state.needsName);

  return (
    <div className="chat-capture-workspace flex flex-col justify-end">
      {!hasConversation && (
        <p className="mb-4 text-center text-[13px] text-ink-faint">
          Choose up to 10 screenshots in conversation order. Reorder or remove them before sending. I will continue the matching client thread, add only new messages, and save one unsent reply draft.
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
          {state.threadTitle && (
            <>
              <span>·</span>
              <span>{state.threadTitle}</span>
            </>
          )}
          {typeof state.addedMessages === 'number' && (
            <>
              <span>·</span>
              <span>
                {state.addedMessages === 0
                  ? 'nothing new to add, drafted from history'
                  : state.addedMessages === 1
                    ? '1 new message added'
                    : `${state.addedMessages} new messages added`}
              </span>
            </>
          )}
        </div>
      )}

      <div className="space-y-3">
        {state.extracted?.map((line, index) => (
          <div key={`message-${index}`} className={`flex ${line.role === 'client' ? 'justify-start' : 'justify-end'}`}>
            <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[14px] ${
              line.role === 'client'
                ? 'rounded-bl-md bg-line'
                : 'rounded-br-md bg-brand text-white'
            }`}>
              {line.text}
            </p>
          </div>
        ))}

        {pending && (
          <div className="flex justify-end">
            <p className="rounded-2xl rounded-br-md bg-brand/10 px-4 py-2.5 text-[13px] text-ink-faint" role="status">
              {selectedUploads.length > 0
                ? `Reading ${selectedUploads.length} screenshot${selectedUploads.length === 1 ? '' : 's'} and writing...`
                : 'Reading the conversation and writing...'}
            </p>
          </div>
        )}

        {state.ok && state.reply && (
          <div className="flex flex-col items-end">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[14px] text-white">
              {state.reply}
            </p>
            {state.draftSaved ? (
              <p className="mt-2 text-[12px] text-brand-ink" role="status">
                Draft saved to the thread. Nothing has been sent.
              </p>
            ) : (
              <div className="alert alert-warn mt-2 max-w-[85%]" role="alert">
                {state.draftSaveError ?? 'The reply is ready, but it is not saved to the thread yet. Copy it before you leave.'}
              </div>
            )}
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button className="btn btn-quiet btn-small" type="button" onClick={copyReply}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              {state.threadId && (
                <Link className="btn btn-quiet btn-small" href={`/threads/${state.threadId}`}>
                  Open thread
                </Link>
              )}
              {state.clientId && (
                <Link className="btn btn-quiet btn-small" href={`/clients/${state.clientId}`}>
                  Open client
                </Link>
              )}
              <button
                className="btn btn-quiet btn-small"
                type="button"
                onClick={() => window.location.reload()}
              >
                New chat
              </button>
            </div>
          </div>
        )}
      </div>

      {!state.ok && (
        <form
          action={async (formData: FormData) => {
            setCopied(false);
            setSelectionChanged(false);
            await formAction(formData);
          }}
          className="card mt-4 rounded-2xl p-3"
        >
          {state.error && !state.needsName && !pending && !selectionChanged && (
            <div className="alert alert-error mb-2" role="alert">
              {state.error}
            </div>
          )}
          {!state.ok && state.threadId && !pending && (
            <div className="mb-2 flex flex-wrap gap-2">
              <Link className="btn btn-quiet btn-small" href={`/threads/${state.threadId}`}>
                Open conversation
              </Link>
              {state.clientId && (
                <Link className="btn btn-quiet btn-small" href={`/clients/${state.clientId}`}>
                  Open client
                </Link>
              )}
            </div>
          )}
          {upload.error && !pending && (
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
                className="field mt-1"
                placeholder="Client name"
              />
            </label>
          )}

          {selectedUploads.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium text-ink-soft">
                  {selectedUploads.length} of {MAX_CHAT_SCREENSHOTS} screenshots
                </p>
                <p className="text-[11px] text-ink-faint">Reorder or remove</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Selected screenshots">
                {selectedUploads.map((item, index) => (
                  <div key={item.path} className="w-36 shrink-0 rounded-xl border border-line bg-surface p-2">
                    {item.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.previewUrl}
                        alt={`Screenshot ${index + 1}`}
                        className="h-20 w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-20 items-center justify-center rounded-lg bg-line text-[12px] text-ink-faint">
                        Image {index + 1}
                      </div>
                    )}
                    <p className="mt-1 truncate text-[12px] text-ink-faint" title={item.name}>
                      {index + 1}. {item.name}
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => moveScreenshot(index, -1)}
                        disabled={index === 0 || pending || upload.uploading}
                        aria-label={`Move screenshot ${index + 1} earlier`}
                        title="Move earlier"
                        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft disabled:opacity-30"
                      >
                        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                          <path d="m12 5-7 7 1.4 1.4 4.6-4.6V20h2V8.8l4.6 4.6L19 12z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeScreenshot(index)}
                        disabled={pending || upload.uploading}
                        aria-label={`Remove screenshot ${index + 1}`}
                        title="Remove screenshot"
                        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft disabled:opacity-30"
                      >
                        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                          <path d="M7 6 5.6 7.4 10.2 12l-4.6 4.6L7 18l5-5 5 5 1.4-1.4L13.8 12l4.6-4.6L17 6l-5 5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveScreenshot(index, 1)}
                        disabled={index === selectedUploads.length - 1 || pending || upload.uploading}
                        aria-label={`Move screenshot ${index + 1} later`}
                        title="Move later"
                        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft disabled:opacity-30"
                      >
                        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 rotate-180" fill="currentColor">
                          <path d="m12 5-7 7 1.4 1.4 4.6-4.6V20h2V8.8l4.6 4.6L19 12z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink-faint ${
                upload.uploading || pending || selectedUploads.length >= MAX_CHAT_SCREENSHOTS
                  ? 'cursor-not-allowed opacity-40'
                  : 'cursor-pointer'
              }`}
              htmlFor="chat-screenshots"
              title="Add screenshots"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
              </svg>
            </label>
            <input
              id="chat-screenshots"
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Add screenshots"
              multiple
              disabled={upload.uploading || pending || selectedUploads.length >= MAX_CHAT_SCREENSHOTS}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                void handleFiles(files);
              }}
              className="sr-only"
            />
            <p className="min-w-0 flex-1 truncate text-[13px] text-ink-faint" role="status">
              {upload.uploading
                ? `Uploading ${upload.uploadingCount} screenshot${upload.uploadingCount === 1 ? '' : 's'}...`
                : selectedUploads.length > 0
                  ? `${selectedUploads.length} selected. Choose their conversation order.`
                  : 'Add screenshots of the conversation'}
            </p>
            <button
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"
              type="submit"
              disabled={pending || upload.uploading || selectedUploads.length === 0}
              title="Send"
              aria-label="Read screenshots and write a reply"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="m2 21 21-9L2 3v7l15 2-15 2z" />
              </svg>
            </button>
          </div>

          <input
            type="hidden"
            name="screenshots"
            value={JSON.stringify(selectedUploads.map(({ path, name }) => ({ path, name })))}
          />
        </form>
      )}
    </div>
  );
}
