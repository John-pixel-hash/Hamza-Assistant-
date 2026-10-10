import 'server-only';

import { generateText } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '../supabase/server';
import { getModelFor } from './provider';
import { logRun } from './telemetry';
import { buildMemoryPrompt, parseFacts, planFactWrites } from './memory';
import type { ExistingFact } from './memory';

/**
 * One memory pass over a thread: read the last slice of the conversation,
 * extract stated facts with the lite model, and merge them into client_facts.
 *
 * It is called from the two save paths, right after a message lands, so the
 * next draft already knows what this one taught the system. It never throws:
 * a failed memory pass must not fail a save.
 *
 * The client and generator are injectable so the verification script runs this
 * exact code with an admin client, rather than a re-implementation of it.
 */
export type MemoryPassResult = {
  ran: boolean;
  inserted: number;
  updated: number;
  reason?: string;
};

export async function runMemoryPass(
  threadId: string,
  overrides?: {
    client?: SupabaseClient;
    generate?: (args: { system?: string; prompt: string; maxOutputTokens?: number }) => Promise<{ text: string }>;
    userId?: string;
  },
): Promise<MemoryPassResult> {
  const none: MemoryPassResult = { ran: false, inserted: 0, updated: 0 };
  try {
    const supabase = overrides?.client ?? (await createClient());

    let userId = overrides?.userId ?? null;
    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { ...none, reason: 'no session' };
      userId = user.id;
    }

    const { data: thread } = await supabase
      .from('threads')
      .select('id, client_id')
      .eq('id', threadId)
      .maybeSingle();
    if (!thread?.client_id) return { ...none, reason: 'no client on thread' };
    const clientId = thread.client_id as string;

    const { data: rows } = await supabase
      .from('messages')
      .select('role, content')
      .eq('thread_id', threadId)
      .order('sent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(12);
    const messages = (rows ?? []).reverse() as { role: string; content: string }[];
    const chars = messages.reduce((total, m) => total + (m.content ?? '').length, 0);
    if (messages.length < 2 || chars < 40) return { ...none, reason: 'slice too small' };

    // The resolved row is read even when a script injects its own generator,
    // so telemetry always names the model the app would have used.
    const { model, resolved } = await getModelFor('extract_facts');
    const generate =
      overrides?.generate ??
      (async ({ prompt, maxOutputTokens }: { prompt: string; maxOutputTokens?: number }) => {
        const result = await generateText({ model, prompt, maxOutputTokens });
        return { text: result.text };
      });

    const started = Date.now();
    const answer = await generate({
      prompt: buildMemoryPrompt(messages),
      maxOutputTokens: 600,
    });
    const facts = parseFacts(answer.text);

    const { data: current } = await supabase
      .from('client_facts')
      .select('id, key, value, confidence, is_pinned')
      .eq('client_id', clientId);
    const plan = planFactWrites((current ?? []) as ExistingFact[], facts);

    for (const row of plan.inserts) {
      await supabase.from('client_facts').insert({
        user_id: userId,
        client_id: clientId,
        key: row.key,
        value: row.value,
        confidence: row.confidence,
      });
    }
    for (const row of plan.updates) {
      await supabase
        .from('client_facts')
        .update({ value: row.value, confidence: row.confidence })
        .eq('id', row.id);
    }

    await logRun({
      task: 'extract_facts',
      resolved,
      threadId,
      latencyMs: Date.now() - started,
      status: 'ok',
      guardrailActions: { extracted: facts.length, inserted: plan.inserts.length, updated: plan.updates.length },
    });

    return { ran: true, inserted: plan.inserts.length, updated: plan.updates.length };
  } catch (error) {
    // Memory is a courtesy layer. Log quietly, never break the save.
    console.error('[memory] pass failed', error instanceof Error ? error.message : error);
    return { ...none, reason: 'error' };
  }
}
