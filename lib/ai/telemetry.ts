import 'server-only';

import { createClient } from '../supabase/server';
import { estimateCostUsd, type AiTask, type ResolvedModel } from './routing';

/**
 * Records what the AI actually did.
 *
 * Every call lands in ai_runs, including the guardrail flags, because the
 * question "does the model keep trying to chase" should have a number behind it
 * rather than an impression. It also makes the free tier visible: rows today,
 * with their model ids, is how the daily quota gets understood from use.
 */

export type RunStatus = 'ok' | 'error' | 'fallback' | 'blocked';

export type RunInput = {
  task: AiTask;
  resolved: ResolvedModel;
  threadId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  researchUsed?: boolean;
  guardrailActions?: Record<string, unknown>;
  status?: RunStatus;
  errorMessage?: string | null;
};

/** Writes one row. Never throws, because telemetry must not break a draft. */
export async function logRun(input: RunInput): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('ai_runs').insert({
      user_id: user.id,
      thread_id: input.threadId ?? null,
      task: input.task,
      provider: input.resolved.provider,
      model_id: input.resolved.modelId,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      cost_usd: estimateCostUsd(
        input.resolved.provider,
        input.resolved.modelId,
        input.inputTokens,
        input.outputTokens,
      ),
      latency_ms: input.latencyMs ?? null,
      research_used: input.researchUsed ?? false,
      guardrail_actions: input.guardrailActions ?? {},
      status: input.status ?? 'ok',
      error_message: input.errorMessage ?? null,
    });
  } catch {
    // Deliberately silent. A telemetry failure must never lose a draft.
  }
}

export type TodayUsage = {
  date: string;
  calls: number;
  byModel: { modelId: string; calls: number }[];
  guardrailHits: number;
};

/** Today's call count, shown on the settings page. */
export async function todayUsage(): Promise<TodayUsage> {
  const date = new Date().toISOString().slice(0, 10);
  const empty: TodayUsage = { date, calls: 0, byModel: [], guardrailHits: 0 };
  try {
    const supabase = await createClient();
    const startOfDay = `${date}T00:00:00.000Z`;
    const { data } = await supabase
      .from('ai_runs')
      .select('model_id, guardrail_actions')
      .gte('created_at', startOfDay);

    const rows = (data ?? []) as unknown as {
      model_id: string;
      guardrail_actions: Record<string, unknown> | null;
    }[];
    const counts = new Map<string, number>();
    let guardrailHits = 0;
    for (const row of rows) {
      counts.set(row.model_id, (counts.get(row.model_id) ?? 0) + 1);
      const actions = row.guardrail_actions ?? {};
      if (
        Number(actions.chasePhrases && (actions.chasePhrases as string[]).length) > 0 ||
        actions.overQuestioned === true ||
        actions.hasListMarkers === true
      ) {
        guardrailHits += 1;
      }
    }
    return {
      date,
      calls: rows.length,
      byModel: [...counts.entries()]
        .map(([modelId, calls]) => ({ modelId, calls }))
        .sort((a, b) => b.calls - a.calls),
      guardrailHits,
    };
  } catch {
    return empty;
  }
}
