import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { readConversationScreenshots } from '@/lib/ai/vision';
import type { Tone } from '@/lib/ai/voice';
import {
  MAX_CHAT_BATCH_BYTES,
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_SCREENSHOTS,
  mergeOverlappingMessages,
  type ChatScreenshotUpload,
} from '@/lib/chat/capture-core';
import { dedupeKey, normaliseClientName, pickThread } from '@/lib/chat/threads';
import { CHANNEL_LABELS, type Channel } from '@/lib/domain';
import { createClient } from '@/lib/supabase/server';

export type ChatCaptureResult = {
  ok: boolean;
  error?: string;
  /** The screenshots had no visible name. The UI asks once, then retries. */
  needsName?: boolean;
  platform?: string;
  clientName?: string | null;
  clientId?: string;
  threadId?: string;
  createdClient?: boolean;
  addedMessages?: number;
  threadTitle?: string;
  /** True once the screenshots are linked to saved thread messages. */
  conversationSaved?: boolean;
  /** Signals the client to start a separate reply request after capture returns. */
  draftPending?: boolean;
  /** Unique key so repeated captures in the same thread each draft once. */
  draftRunId?: string;
  tone?: Tone;
  uploads?: ChatScreenshotUpload[];
  extracted?: { role: string; text: string }[];
};

const TONES: Tone[] = ['casual', 'formal', 'short', 'detailed', 'warm', 'direct', 'unknown'];
const SUPPORTED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function asTone(value: string | null): Tone {
  if (!value) return 'unknown';
  const lowered = value.toLowerCase();
  return (TONES as string[]).includes(lowered) ? (lowered as Tone) : 'unknown';
}

type LoadedScreenshot = {
  upload: ChatScreenshotUpload;
  bytes: Buffer;
  mime: string;
};

/**
 * An ordered screenshot set in, a saved conversation out.
 *
 * This request downloads private uploads, reads them as one conversation,
 * matches or creates the client, keeps one thread per platform, saves messages,
 * and links each image to the messages it shows. Reply generation runs in a
 * separate request with its own serverless time budget, so a slow free model
 * cannot turn a successful conversation save into a failed capture or require
 * the screenshots to be processed again for a retry.
 */
type CaptureProgress = {
  conversationSaved: boolean;
  clientId?: string;
  clientName?: string;
  createdClient?: boolean;
  platform?: string;
  threadId?: string;
  threadTitle?: string;
  addedMessages?: number;
};

async function captureChatScreenshotsInner(
  uploads: ChatScreenshotUpload[],
  clientNameOverride: string | null | undefined,
  progress: CaptureProgress,
): Promise<ChatCaptureResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You are signed out. Sign in and try again.' };

  if (uploads.length === 0 || uploads.length > MAX_CHAT_SCREENSHOTS) {
    return { ok: false, error: `Choose between 1 and ${MAX_CHAT_SCREENSHOTS} screenshots.` };
  }
  if (uploads.some(({ path }) => !path.startsWith(`${user.id}/chat/`))) {
    return { ok: false, error: 'That upload does not belong to this chat.' };
  }

  const loaded: LoadedScreenshot[] = [];
  let totalBytes = 0;
  for (const upload of uploads) {
    const download = await supabase.storage.from('attachments').download(upload.path);
    if (download.error || !download.data) {
      return {
        ok: false,
        error: 'I could not open one of those screenshots. Check the image type and upload it again.',
      };
    }

    const mime = (download.data.type || 'image/png').split(';')[0]?.toLowerCase() ?? 'image/png';
    if (!SUPPORTED_IMAGE_MIMES.has(mime) || download.data.size === 0 || download.data.size > MAX_CHAT_IMAGE_BYTES) {
      return {
        ok: false,
        error: 'I could not open one of those screenshots. Check the image type and upload it again.',
      };
    }
    if (totalBytes + download.data.size > MAX_CHAT_BATCH_BYTES) {
      return { ok: false, error: 'Those screenshots are too large together. Select a smaller set.' };
    }

    const bytes = Buffer.from(await download.data.arrayBuffer());
    loaded.push({ upload, bytes, mime });
    totalBytes += bytes.length;
  }

  const vision = await readConversationScreenshots(
    loaded.map(({ bytes, mime }) => ({ bytes, mime })),
  );
  if (!vision.extraction) {
    return {
      ok: false,
      error:
        vision.reason === 'unreadable'
          ? 'I could not read a conversation in those screenshots. Try clearer captures of the chat.'
          : 'I could not read those screenshots just now. Your selection is still here. Try again in a moment.',
    };
  }
  const extraction = {
    ...vision.extraction,
    messages: mergeOverlappingMessages(vision.extraction.messages),
  };

  const platform: Channel = extraction.platform === 'unknown' ? 'other' : extraction.platform;
  const clientName = (clientNameOverride ?? extraction.clientName)?.trim() ?? null;
  const uploadList = loaded.map(({ upload }) => upload);
  if (!clientName) {
    return {
      ok: false,
      needsName: true,
      platform,
      clientName: null,
      uploads: uploadList,
      extracted: extraction.messages.map((message) => ({ role: message.role, text: message.text })),
    };
  }

  if (extraction.messages.length === 0) {
    return { ok: false, error: 'I read the screenshots but found no messages in the conversation.' };
  }

  // Match an existing client before creating anything new.
  const wanted = normaliseClientName(clientName);
  const { data: clients } = await supabase.from('clients').select('id, name, channel');
  const all = (clients ?? []) as { id: string; name: string; channel: string | null }[];
  let client = all.find((candidate) => normaliseClientName(candidate.name) === wanted) ?? null;
  if (!client) {
    const partialMatches = all.filter((candidate) => {
      const name = normaliseClientName(candidate.name);
      return wanted.length >= 4 && (name.includes(wanted) || wanted.includes(name));
    });
    if (partialMatches.length === 1) client = partialMatches[0] ?? null;
    if (partialMatches.length > 1) {
      return {
        ok: false,
        error: 'I found more than one client with a similar name. Open the right client and continue its existing thread so the messages do not go to the wrong person.',
        uploads: uploadList,
        extracted: extraction.messages.map((message) => ({ role: message.role, text: message.text })),
      };
    }
  }

  let clientId: string;
  let createdClient = false;
  if (client) {
    clientId = client.id;
    if (!client.channel) {
      await supabase.from('clients').update({ channel: platform }).eq('id', clientId);
    }
  } else {
    const { data: created, error } = await supabase
      .from('clients')
      .insert({
        user_id: user.id,
        name: clientName,
        channel: platform,
        source: platform,
        stage: 'lead',
      })
      .select('id')
      .single();
    if (error || !created) {
      return { ok: false, error: 'I could not create the client record. Try again.' };
    }
    clientId = created.id;
    createdClient = true;
  }

  // Continue the freshest thread on this platform. This keeps the conversation
  // whole and preserves the existing one-thread-per-platform guard.
  const { data: threadRows } = await supabase
    .from('threads')
    .select('id, title, updated_at')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false });
  const threadIds = ((threadRows ?? []) as { id: string }[]).map((row) => row.id);

  const channelByThread = new Map<string, string>();
  if (threadIds.length > 0) {
    const { data: channelRows } = await supabase
      .from('messages')
      .select('thread_id, channel')
      .in('thread_id', threadIds)
      .not('channel', 'is', null)
      .order('sent_at', { ascending: false });
    for (const row of (channelRows ?? []) as { thread_id: string; channel: string }[]) {
      if (!channelByThread.has(row.thread_id)) channelByThread.set(row.thread_id, row.channel);
    }
  }
  const infos = ((threadRows ?? []) as { id: string; title: string }[]).map((row) => ({
    id: row.id,
    title: row.title,
    channel: channelByThread.get(row.id) ?? null,
  }));

  const picked = pickThread(infos, platform);
  let threadId: string | undefined = picked?.id;
  const threadTitle = picked?.title ?? `${CHANNEL_LABELS[platform]} chat`;
  if (!threadId) {
    const { data: createdThread, error } = await supabase
      .from('threads')
      .insert({ user_id: user.id, client_id: clientId, title: threadTitle, mode: 'client_reply' })
      .select('id')
      .single();
    if (error || !createdThread) {
      return { ok: false, error: 'I could not open a conversation thread. Try again.' };
    }
    threadId = createdThread.id;
  }
  if (!threadId) {
    return { ok: false, error: 'I could not open a conversation thread. Try again.' };
  }

  // Keep existing duplicates, then add only genuinely new bubbles. Lists of
  // ids preserve repeated text when the conversation intentionally contains
  // the same short reply more than once.
  const { data: existingRows, error: existingMessagesError } = await supabase
    .from('messages')
    .select('id, role, content, sent_at, created_at')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })
    .order('created_at', { ascending: true });
  if (existingMessagesError) {
    return { ok: false, error: 'I could not check the saved conversation. Try again.' };
  }

  const messageIdsByKey = new Map<string, string[]>();
  for (const row of (existingRows ?? []) as { id: string; role: string; content: string }[]) {
    const key = dedupeKey(row.role, row.content);
    messageIdsByKey.set(key, [...(messageIdsByKey.get(key) ?? []), row.id]);
  }

  const fresh = extraction.messages.filter(
    (message) => !messageIdsByKey.has(dedupeKey(message.role, message.text)),
  );
  if (fresh.length > 0) {
    const baseTime = Date.now();
    const { data: insertedMessages, error } = await supabase
      .from('messages')
      .insert(fresh.map((message, index) => ({
        user_id: user.id,
        thread_id: threadId,
        role: message.role,
        content: message.text,
        channel: platform,
        sent_at: new Date(baseTime + index).toISOString(),
      })))
      .select('id, role, content, sent_at');
    if (error || !insertedMessages || insertedMessages.length !== fresh.length) {
      return { ok: false, error: 'I could not save the conversation. Try again.' };
    }
    const chronologicalInsertions = (insertedMessages as {
      id: string;
      role: string;
      content: string;
      sent_at: string;
    }[]).sort((a, b) => a.sent_at.localeCompare(b.sent_at));
    for (const row of chronologicalInsertions) {
      const key = dedupeKey(row.role, row.content);
      messageIdsByKey.set(key, [...(messageIdsByKey.get(key) ?? []), row.id]);
    }
  }

  const occurrenceByKey = new Map<string, number>();
  const messageIdsByExtractionIndex = extraction.messages.map((message) => {
    const key = dedupeKey(message.role, message.text);
    const occurrence = occurrenceByKey.get(key) ?? 0;
    occurrenceByKey.set(key, occurrence + 1);
    const ids = messageIdsByKey.get(key) ?? [];
    return ids.length > 0 ? ids[Math.min(occurrence, ids.length - 1)] ?? null : null;
  });

  progress.clientId = clientId;
  progress.clientName = clientName;
  progress.createdClient = createdClient;
  progress.platform = platform;
  progress.threadId = threadId;
  progress.threadTitle = threadTitle;
  progress.addedMessages = fresh.length;

  const attachmentRows: {
    user_id: string;
    message_id: string;
    client_id: string;
    storage_path: string;
    original_name: string;
    size_bytes: number;
    kind: 'image';
  }[] = [];
  const attachmentMessageIds = [...new Set(
    messageIdsByExtractionIndex.filter((id): id is string => Boolean(id)),
  )];
  const linked = new Set<string>();
  if (attachmentMessageIds.length > 0) {
    const { data: existingAttachments, error } = await supabase
      .from('attachments')
      .select('message_id, storage_path')
      .in('message_id', attachmentMessageIds)
      .in('storage_path', loaded.map((image) => image.upload.path));
    if (error) {
      console.error('[chat] attachment lookup failed', error.message);
      return {
        ok: false,
        error: 'I saved the conversation, but could not check its screenshot links. Try again to finish.',
        ...progress,
        uploads: uploadList,
        extracted: extraction.messages.map((message) => ({ role: message.role, text: message.text })),
      };
    }
    for (const row of existingAttachments ?? []) {
      if (row.message_id && row.storage_path) {
        linked.add(`${row.message_id}:${row.storage_path}`);
      }
    }
  }
  for (const [messageIndex, message] of extraction.messages.entries()) {
    const messageId = messageIdsByExtractionIndex[messageIndex];
    if (!messageId) continue;
    const indices = message.screenshotIndices.filter((index) => index >= 0 && index < loaded.length);
    for (const index of indices) {
      const image = loaded[index];
      if (!image) continue;
      const key = `${messageId}:${image.upload.path}`;
      if (linked.has(key)) continue;
      linked.add(key);
      attachmentRows.push({
        user_id: user.id,
        message_id: messageId,
        client_id: clientId,
        storage_path: image.upload.path,
        original_name: image.upload.name,
        size_bytes: image.bytes.length,
        kind: 'image',
      });
    }
  }

  if (attachmentRows.length > 0) {
    // If the storage write succeeds but the response is interrupted, protect
    // the uploaded files from being deleted by a later selection edit.
    progress.conversationSaved = true;
    const { error } = await supabase.from('attachments').insert(attachmentRows);
    if (error) {
      progress.conversationSaved = false;
      console.error('[chat] attachment links failed', error.message);
      return {
        ok: false,
        error: 'I saved the conversation, but could not link its screenshots. Try again to finish.',
        ...progress,
        uploads: uploadList,
        extracted: extraction.messages.map((message) => ({ role: message.role, text: message.text })),
      };
    }
  }
  progress.conversationSaved = true;

  const addedMessages = fresh.length;
  const tone = asTone(extraction.tone);
  const savedResult = {
    platform,
    tone,
    clientName,
    clientId,
    threadId,
    threadTitle,
    createdClient,
    addedMessages,
    conversationSaved: true,
    uploads: uploadList,
    extracted: extraction.messages.map((message) => ({ role: message.role, text: message.text })),
  };
  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/threads/${threadId}`);

  // The client starts drafting only after this save action returns. A retry then
  // uses the saved thread and does not re-run screenshot reading or insert rows.
  return {
    ok: true,
    ...savedResult,
    draftPending: true,
    draftRunId: randomUUID(),
  };
}

/** Convert unexpected network or provider failures into a recoverable form state. */
export async function captureChatScreenshots(
  uploads: ChatScreenshotUpload[],
  clientNameOverride?: string | null,
): Promise<ChatCaptureResult> {
  const progress: CaptureProgress = { conversationSaved: false };
  try {
    return await captureChatScreenshotsInner(uploads, clientNameOverride, progress);
  } catch (error) {
    console.error('[chat] capture failed', error instanceof Error ? error.message : error);
    return {
      ok: false,
      error: progress.conversationSaved
        ? 'The conversation and screenshots were saved, but capture did not finish. Open the saved thread to continue.'
        : 'I could not finish this capture. Your screenshots are still selected. Try again.',
      conversationSaved: progress.conversationSaved,
      clientId: progress.clientId,
      clientName: progress.clientName,
      createdClient: progress.createdClient,
      platform: progress.platform,
      threadId: progress.threadId,
      threadTitle: progress.threadTitle,
      addedMessages: progress.addedMessages,
      uploads,
    };
  }
}

/** Backwards-compatible wrapper for older single-image callers. */
export async function captureChatScreenshot(
  storagePath: string,
  originalName: string,
  clientNameOverride?: string | null,
): Promise<ChatCaptureResult> {
  return captureChatScreenshots([{ path: storagePath, name: originalName }], clientNameOverride);
}
