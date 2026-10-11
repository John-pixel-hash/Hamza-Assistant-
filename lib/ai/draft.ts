import 'server-only';

import { generateText, type LanguageModel } from 'ai';

import { getModelFor, modelFor } from './provider';
import { DRAFT_FALLBACK_MODEL } from './routing';
import { logRun } from './telemetry';
import {
  draftReplyWith,
  type DraftOutcome,
  type DraftRequest,
  type GenerateFn,
} from './draft-core';

/**
 * The server entry point for drafting.
 *
 * This file only wires things together: it picks the model, runs the loop from
 * draft-core, and records what happened. All the logic that decides whether a
 * draft is acceptable lives in draft-core so it can be tested without a
 * network, a database, or a Next.js runtime.
 *
 * The owner is on the free tier, so a draft uses one call normally and two at
 * most. Anything more would burn the daily allowance on a single message.
 */

export {
  DRAFT_MAX_OUTPUT_TOKENS,
  buildRepairInstruction,
  describeProblems,
  draftReplyWith,
} from './draft-core';
export type { DraftOutcome, DraftRequest, GenerateFn } from './draft-core';

/** Walks the AI SDK's nested error shapes looking for a refusal that the lite
 * model can take over: quota 429s, and 503 demand spikes on the primary. */
function isQuotaError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false;
  const e = error as Record<string, unknown>;
  if (e.statusCode === 429 || e.statusCode === 503) return true;
  if (
    typeof e.message === 'string' &&
    /RESOURCE_EXHAUSTED|QuotaFailure|UNAVAILABLE|high demand/i.test(e.message)
  ) {
    return true;
  }
  const nested = Array.isArray(e.errors)
    ? (e.errors as unknown[])
    : [e.cause, e.error].filter(Boolean);
  return nested.some((n) => isQuotaError(n, depth + 1));
}

export async function draftReply(
  request: DraftRequest,
): Promise<DraftOutcome & { modelId: string }> {
  const { model, resolved } = await getModelFor('reply_draft');

  let usedModel = model;
  let usedResolved = resolved;
  let quotaFallback = false;
  let outcome: DraftOutcome;

  try {
    outcome = await draftReplyWith(aiSdkGenerator(model), request);
  } catch (error) {
    if (!isQuotaError(error) || resolved.modelId === DRAFT_FALLBACK_MODEL) throw error;
    // The primary model's free daily allowance is spent. The lite model has
    // its own, so the draft still gets written, and the telemetry row says
    // fallback so the switch is visible on the settings page.
    usedModel = modelFor({ ...resolved, modelId: DRAFT_FALLBACK_MODEL });
    usedResolved = {
      ...resolved,
      modelId: DRAFT_FALLBACK_MODEL,
      fellBack: true,
      reason: 'primary model quota exhausted',
    };
    quotaFallback = true;
    outcome = await draftReplyWith(aiSdkGenerator(usedModel), request);
  }

  await logRun({
    task: 'reply_draft',
    resolved: usedResolved,
    threadId: request.context.thread.id,
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    latencyMs: outcome.latencyMs,
    status: quotaFallback
      ? 'fallback'
      : outcome.ok
        ? outcome.fixed
          ? 'fallback'
          : 'ok'
        : 'blocked',
    guardrailActions: {
      ...outcome.actions,
      attempts: outcome.attempts,
      fixed: outcome.fixed,
      problems: outcome.problems,
      quotaFallback,
    },
    errorMessage: outcome.ok ? null : outcome.problems.join(' '),
  });

  return { ...outcome, modelId: usedResolved.modelId };
}

/** The real generator, using whichever model the task routes to. */
export function aiSdkGenerator(model: LanguageModel): GenerateFn {
  return async ({ system, prompt, maxOutputTokens }) => {
    const result = await generateText({ model, system, prompt, maxOutputTokens });
    return {
      text: result.text,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
    };
  };
}
