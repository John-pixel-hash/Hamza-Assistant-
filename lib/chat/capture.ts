import { revalidatePath } from 'next/cache';

import { draftReply } from '@/lib/ai/draft';
import { runMemoryPass } from '@/lib/ai/memory-live';
import { readConversationScreenshot } from '@/lib/ai/vision';
import type { Tone } from '@/lib/ai/voice';
import { getClientDetail, getClientFacts } from '@/lib/data/clients';
import { getClientProjectContext } from '@/lib/data/projects';
import { getThread } from '@/lib/data/threads';
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

  // One thread per platform keeps histories separate, matching the house rule.
  const threadTitle = `${CHANNEL_LABELS[platform]} chat`;
  const { data: threads } = await supabase
    .from('threads')
    .select('id')
    .eq('client_id', clientId)
    .eq('title', threadTitle)
    .limit(1);
  let threadId = (threads ?? [])[0]?.id as string | undefined;
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

  // Save the client's messages, newest last, with the screenshot on the first.
  let attachmentSaved = false;
  for (const message of extraction.messages) {
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

  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);

  // Teach the memory engine before drafting, so the reply already uses it.
  await runMemoryPass(threadId);

  const detail = await getThread(threadId);
  if (!detail) return { ok: false, error: 'The thread disappeared while I was working.' };
  const [clientResult, facts, projects] = await Promise.all([
    getClientDetail(clientId),
    getClientFacts(clientId),
    getClientProjectContext(clientId),
  ]);
  const clientRow = clientResult.client;

  const tone = asTone(extraction.tone);
  let draft;
  try {
    draft = await draftReply({
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
    createdClient,
    extracted: extraction.messages.map((m) => ({ role: m.role, text: m.text })),
  };
}
