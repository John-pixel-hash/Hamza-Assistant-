import { revalidatePath } from 'next/cache';

import { draftReply } from '@/lib/ai/draft';
import { readConversationScreenshot } from '@/lib/ai/vision';
import type { Tone } from '@/lib/ai/voice';
import { getClientDetail, getClientFacts } from '@/lib/data/clients';
import { getClientProjectContext } from '@/lib/data/projects';
import { getThread } from '@/lib/data/threads';
import { dedupeKey, pickThread } from '@/lib/chat/threads';
import { CHANNEL_LABELS, type Channel } from '@/lib/domain';
import { createClient } from '@/lib/supabase/server';

export type ChatCaptureResult = {
  ok: boolean;
  error?: string;
  /** The screenshot had no visible name. The UI asks once, then retries. */
  needsName?: boolean;
  platform?: string;
  clientName?: string | null;
  reply?: string;
  clientId?: string;
  threadId?: string;
  createdClient?: boolean;
  addedMessages?: number;
  threadTitle?: string;
  extracted?: { role: string; text: string }[];
};

const TONES: Tone[] = ['casual', 'formal', 'short', 'detailed', 'warm', 'direct', 'unknown'];

function asTone(value: string | null): Tone {
  if (!value) return 'unknown';
  const lowered = value.toLowerCase();
  return (TONES as string[]).includes(lowered) ? (lowered as Tone) : 'unknown';
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * One screenshot in, one ready-to-copy reply out.
 *
 * The whole chain: download the upload, read it with vision, match or create
 * the client, keep one thread per platform, save the client's messages with
 * the screenshot attached, run the memory pass, and draft the reply with the
 * same pipeline the reply panel uses.
 */
export async function captureChatScreenshot(
  storagePath: string,
  originalName: string,
  clientNameOverride?: string | null,
): Promise<ChatCaptureResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You are signed out. Sign in and try again.' };

  if (!storagePath.startsWith(`${user.id}/`)) {
    return { ok: false, error: 'That upload does not belong to this account.' };
  }

  const download = await supabase.storage.from('attachments').download(storagePath);
  if (download.error || !download.data) {
    return { ok: false, error: 'I could not open that screenshot. Upload it again.' };
  }
  const buffer = Buffer.from(await download.data.arrayBuffer());
  const mime = download.data.type || 'image/png';

  const vision = await readConversationScreenshot({ bytes: buffer, mime });
  if (!vision.extraction) {
    return {
      ok: false,
      error:
        vision.reason === 'unreadable'
          ? 'I could not read a conversation in that screenshot. Try a clearer capture of the chat.'
          : 'The vision model is busy right now. Wait a moment and try again.',
    };
  }
  const extraction = vision.extraction;

  const platform: Channel =
    extraction.platform === 'unknown' ? 'other' : extraction.platform;

  const clientName = (clientNameOverride ?? extraction.clientName)?.trim() ?? null;
  if (!clientName) {
    return {
      ok: false,
      needsName: true,
      platform,
      clientName: null,
      extracted: extraction.messages.map((m) => ({ role: m.role, text: m.text })),
    };
  }

  if (extraction.messages.length === 0) {
    return { ok: false, error: 'I read the screenshot but found no client messages in it.' };
  }

  // Match an existing client before creating anything new.
  const wanted = normalise(clientName);
  const { data: clients } = await supabase.from('clients').select('id, name, channel');
  const all = (clients ?? []) as { id: string; name: string; channel: string | null }[];
  let client = all.find((c) => normalise(c.name) === wanted) ?? null;
  if (!client) {
    client =
      all.find((c) => {
        const n = normalise(c.name);
        return n.includes(wanted) || wanted.includes(n);
      }) ?? null;
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

  // Land on the conversation this screenshot continues: the freshest thread on
  // the same platform. A second thread for one platform would split the story,
  // so a new one is only created when none exists for that platform.
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

  // The screenshot usually repeats the last saved lines. Skip anything the
  // thread already contains so history never doubles, then save the new lines
  // in order, screenshot attached to the first of them.
  const { data: existingRows } = await supabase
    .from('messages')
    .select('role, content')
    .eq('thread_id', threadId);
  const seen = new Set(
    ((existingRows ?? []) as { role: string; content: string }[]).map((row) =>
      dedupeKey(row.role, row.content),
    ),
  );
  const fresh = extraction.messages.filter(
    (message) => !seen.has(dedupeKey(message.role, message.text)),
  );

  let attachmentSaved = false;
  for (const message of fresh) {
    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        user_id: user.id,
        thread_id: threadId,
        role: message.role,
        content: message.text,
        channel: platform,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error || !inserted) {
      return { ok: false, error: 'I could not save the conversation. Try again.' };
    }
    if (!attachmentSaved) {
      await supabase.from('attachments').insert({
        user_id: user.id,
        message_id: inserted.id,
        client_id: clientId,
        storage_path: storagePath,
        original_name: originalName,
        size_bytes: buffer.length,
        kind: 'image',
      });
      attachmentSaved = true;
    }
  }
  const addedMessages = fresh.length;

  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);

  const detail = await getThread(threadId);
  if (!detail) return { ok: false, error: 'The thread disappeared while I was working.' };
  const [clientResult, facts, projects] = await Promise.all([
    getClientDetail(clientId),
    getClientFacts(clientId),
    getClientProjectContext(clientId),
  ]);
  const clientRow = clientResult.client;

  const tone = asTone(extraction.tone);

  // The reply is written from the message itself plus what was already known.
  // The memory pass deliberately does NOT run here: it has its own route that
  // the browser fires right after the reply lands, so the action stays inside
  // the 60 second serverless budget.
  let draft;
  try {
    draft = await draftReply({
        fast: true,
    channel: platform,
    tone,
    purpose: 'reply',
    instruction: null,
    context: {
      client: {
        id: clientRow?.id ?? clientId,
        name: clientRow?.name ?? clientName,
        company: clientRow?.company ?? null,
        country: clientRow?.country ?? null,
        stage: clientRow?.stage ?? 'lead',
        source: clientRow?.source ?? null,
        channel: clientRow?.channel ?? platform,
        currency: clientRow?.currency ?? null,
        deal_value_estimate: clientRow?.deal_value_estimate ?? null,
        summary: clientRow?.summary ?? null,
        notes: clientRow?.notes ?? null,
      },
      thread: { id: detail.thread.id, title: detail.thread.title, mode: detail.thread.mode },
      messages: detail.messages.map((message) => ({
        role: message.role,
        content: message.content,
        sent_at: message.sent_at ?? message.created_at,
        channel: message.channel,
      })),
      facts: facts.map((fact) => ({ key: fact.key, value: fact.value, confidence: fact.confidence })),
      projects,
      incoming: null,
      channel: platform,
    },
    });
  } catch (error) {
    console.error('[chat] draft failed', error instanceof Error ? error.message : error);
    return {
      ok: false,
      error:
        'I saved the conversation, but the model is busy right now. Open the client and use the reply panel in a minute.',
    };
  }

  const reply = draft.text.trim();
  if (!reply) {
    return { ok: false, error: 'I saved the conversation but the reply came back empty. Open the thread and use the reply panel.' };
  }

  return {
    ok: true,
    platform,
    clientName,
    reply,
    clientId,
    threadId,
    threadTitle,
    createdClient,
    addedMessages,
    extracted: extraction.messages.map((m) => ({ role: m.role, text: m.text })),
  };
}
