'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';
import { getClientDetail, getClientFacts } from '@/lib/data/clients';
import { getClientProjectContext } from '@/lib/data/projects';
import { getThread } from '@/lib/data/threads';
import { draftReply } from '@/lib/ai/draft';
import { draftFailureMessage } from '@/lib/ai/draft-errors';
import { runMemoryPass } from '@/lib/ai/memory-live';
import type { Tone } from '@/lib/ai/voice';

/**
 * The two things the reply panel does: produce a draft, and record what was
 * actually sent.
 *
 * Recording the sent version is the whole learning loop. The difference between
 * the draft and what he sends is the only honest signal about where the
 * assistant still sounds like an assistant, and it only exists if this is saved
 * every time.
 */

import { EMPTY_DRAFT_STATE } from '@/lib/ai/draft-state';
import type { DraftState, SaveSentState } from '@/lib/ai/draft-state';

const TONES: Tone[] = ['casual', 'formal', 'short', 'detailed', 'warm', 'direct', 'unknown'];

function asTone(value: string): Tone {
  return (TONES as string[]).includes(value) ? (value as Tone) : 'unknown';
}

/** Everything the model is allowed to know about this conversation. */
export async function loadConversation(threadId: string) {
  const detail = await getThread(threadId);
  if (!detail) return null;

  const clientId = detail.client?.id ?? null;
  const [clientResult, facts, projects] = await Promise.all([
    clientId ? getClientDetail(clientId) : Promise.resolve({ client: null, ready: true }),
    clientId ? getClientFacts(clientId) : Promise.resolve([]),
    clientId ? getClientProjectContext(clientId) : Promise.resolve([]),
  ]);

  // The project query is filtered by client id in SQL, so another client's work
  // cannot reach the prompt.
  return { detail, client: clientResult.client, facts, projects };
}

export async function draftReplyAction(
  _prev: DraftState,
  formData: FormData,
): Promise<DraftState> {
  const threadId = String(formData.get('thread_id') ?? '');
  const incoming = String(formData.get('incoming') ?? '').trim();
  const channel = String(formData.get('channel') ?? 'instagram');
  const tone = asTone(String(formData.get('tone') ?? 'unknown'));
  const instruction = String(formData.get('instruction') ?? '').trim();
  const base = { ...EMPTY_DRAFT_STATE, incoming, channel };

  if (!SUPABASE_CONFIGURED) {
    return { ...base, error: 'Supabase is not connected, so there is nothing to draft from yet.' };
  }
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) {
    return { ...base, error: 'That thread could not be found.' };
  }

  let stage = 'loading the thread';
  try {
    const loaded = await loadConversation(threadId);
    if (!loaded) return { ...base, error: 'That thread could not be found.' };

    const { detail, client, facts, projects } = loaded;
    stage = 'writing the draft';
    const outcome = await draftReply({
      channel,
      tone,
      purpose: 'reply',
      instruction: instruction || null,
      context: {
        client: {
          id: client?.id ?? threadId,
          name: client?.name ?? detail.thread.title,
          company: client?.company ?? null,
          country: client?.country ?? null,
          stage: client?.stage ?? 'lead',
          source: client?.source ?? null,
          channel: client?.channel ?? channel,
          currency: client?.currency ?? null,
          deal_value_estimate: client?.deal_value_estimate ?? null,
          summary: client?.summary ?? null,
          notes: client?.notes ?? null,
        },
        thread: { id: detail.thread.id, title: detail.thread.title, mode: detail.thread.mode },
        messages: detail.messages.map((message) => ({
          role: message.role,
          content: message.content,
          sent_at: message.sent_at ?? message.created_at,
          channel: message.channel,
        })),
        facts: facts.map((fact) => ({
          key: fact.key,
          value: fact.value,
          confidence: fact.confidence,
        })),
        projects,
        incoming: incoming || null,
        channel,
      },
    });

    if (outcome.text.trim() === '') {
      return { ...base, error: 'The model returned nothing. Try again.' };
    }

    return {
      error: null,
      draft: outcome.text.trim(),
      problems: outcome.problems,
      ok: outcome.ok,
      fixed: outcome.fixed,
      attempts: outcome.attempts,
      latencyMs: outcome.latencyMs,
      modelId: outcome.modelId,
      incoming,
      channel,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const name = error instanceof Error ? error.name : 'UnknownError';
    console.error(`[drafts] ${stage} failed`, { name, message });
    return {
      ...base,
      error: /GOOGLE_(?:GENERATIVE_AI_)?API_KEY/.test(message)
        ? 'The Google key is missing, so no draft can be written. Add it and redeploy.'
        : draftFailureMessage(error),
    };
  }
}

/**
 * Records what was sent, and the client message it was answering.
 *
 * Both are saved as ordinary messages on the thread, so the conversation stays
 * complete and the next draft has the full history to work from.
 */
export async function saveSentAction(
  _prev: SaveSentState,
  formData: FormData,
): Promise<SaveSentState> {
  if (!SUPABASE_CONFIGURED) {
    return { error: 'Supabase is not connected, so nothing can be saved yet.', saved: false };
  }

  const threadId = String(formData.get('thread_id') ?? '');
  const sent = String(formData.get('sent') ?? '').trim();
  const incoming = String(formData.get('incoming') ?? '').trim();
  const channel = String(formData.get('channel') ?? 'instagram');

  if (!/^[0-9a-f-]{36}$/i.test(threadId)) {
    return { error: 'That thread could not be found.', saved: false };
  }
  if (sent.length < 2) return { error: 'Nothing to save.', saved: false };
  if (sent.length > 6000) return { error: 'That message is too long to store.', saved: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.', saved: false };

  const now = new Date().toISOString();
  const rows = [];
  if (incoming) {
    rows.push({
      user_id: user.id,
      thread_id: threadId,
      role: 'client',
      content: incoming.slice(0, 6000),
      channel,
      sent_at: now,
    });
  }
  rows.push({
    user_id: user.id,
    thread_id: threadId,
    role: 'me',
    content: sent.slice(0, 6000),
    channel,
    sent_at: now,
  });

  const { error } = await supabase.from('messages').insert(rows);
  if (error) {
    console.error('[drafts] save failed', error.message);
    return { error: 'Could not save that. Nothing was recorded.', saved: false };
  }

  // The save is the learning loop: what was sent teaches the memory engine,
  // so the next draft knows what this one did. It never blocks or breaks the
  // save itself.
  await runMemoryPass(threadId);

  revalidatePath(`/threads/${threadId}`);
  return { error: null, saved: true };
}
