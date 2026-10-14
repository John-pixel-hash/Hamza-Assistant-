import type { SupabaseClient } from '@supabase/supabase-js';

import type { DraftOutcome } from '@/lib/ai/draft-core';
import { isChannel } from '@/lib/domain';

export type SavedDraftOutcome = DraftOutcome & { modelId: string };
export type AssistantDraftSource = 'thread_reply' | 'screenshot_capture';

export type AssistantDraftInput = {
  userId: string;
  threadId: string;
  content: string;
  channel: string;
  source: AssistantDraftSource;
  outcome: SavedDraftOutcome;
  createdAt?: string;
};

export function buildAssistantDraftRow(input: AssistantDraftInput) {
  return {
    user_id: input.userId,
    thread_id: input.threadId,
    role: 'assistant',
    content: input.content.trim(),
    channel: isChannel(input.channel) ? input.channel : null,
    sent_at: input.createdAt ?? new Date().toISOString(),
    provider: 'google',
    model_id: input.outcome.modelId,
    input_tokens: input.outcome.usage.inputTokens,
    output_tokens: input.outcome.usage.outputTokens,
    latency_ms: input.outcome.latencyMs,
    guardrail_flags: {
      ...input.outcome.actions,
      ok: input.outcome.ok,
      fixed: input.outcome.fixed,
      attempts: input.outcome.attempts,
      problems: input.outcome.problems,
    },
    meta: {
      kind: 'assistant_draft',
      source: input.source,
      sent: false,
    },
  };
}

export async function saveAssistantDraft(
  supabase: SupabaseClient,
  input: AssistantDraftInput,
): Promise<{ id: string | null; error: string | null }> {
  const content = input.content.trim();
  if (!content) return { id: null, error: 'The draft was empty.' };
  if (content.length > 6000) return { id: null, error: 'The draft is too long to save.' };

  const { data, error } = await supabase
    .from('messages')
    .insert(buildAssistantDraftRow({ ...input, content }))
    .select('id')
    .single();

  if (error || !data) {
    return { id: null, error: error?.message ?? 'No saved message was returned.' };
  }

  return { id: data.id as string, error: null };
}
