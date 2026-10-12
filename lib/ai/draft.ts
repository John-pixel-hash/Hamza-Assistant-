import 'server-only';

import { generateText, type LanguageModel } from 'ai';

import { getModelFor, modelFor } from './provider';
import { DRAFT_FALLBACK_MODEL, modelChain, sleepMs } from './routing';

// Drafts share the 60 second serverless window with everything else the
// action does. New fallback attempts stop once 40 seconds are gone, and each
// attempt is capped, so the repair pass still fits after a bad spike.
const DRAFT_BUDGET_MS = 40000;
const DRAFT_ATTEMPT_TIMEOUT_MS = 14000;
const DRAFT_BACKOFF_MS = 1500;
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

  // The capture flow lives inside a 60 second serverless window, so it starts
  // on the fast model. The reply panel keeps the primary voice.
  const startFast = request.fast === true && resolved.modelId !== DRAFT_FALLBACK_MODEL;
  const firstModelId = startFast ? DRAFT_FALLBACK_MODEL : resolved.modelId;
  let usedModel = startFast ? modelFor({ ...resolved, modelId: firstModelId }) : model;
  let usedResolved = startFast
    ? { ...resolved, modelId: firstModelId, reason: 'capture fast path' }
    : resolved;
  let quotaFallback = false;

  // The routed model first, then every other free tier model. Quota is per
  // model id, so a spike that locks one leaves the others with allowance.
  // A refusal moves the draft on after a short pause; any other error
  // rethrows, because retrying a refusal of a different kind wastes seconds.
  const started = Date.now();
  let outcome: DraftOutcome | null = null;
  let lastError: unknown = null;

  for (const [index, modelId] of modelChain(firstModelId).entries()) {
    if (index > 0) {
      if (Date.now() - started > DRAFT_BUDGET_MS) break;
      await sleepMs(DRAFT_BACKOFF_MS);
      usedModel = modelFor({ ...resolved, modelId });
      usedResolved = {
        ...resolved,
        modelId,
        fellBack: true,
        reason: 'quota spike fallback',
      };
      quotaFallback = true;
    }
    try {
      outcome = await draftReplyWith(aiSdkGenerator(usedModel, DRAFT_ATTEMPT_TIMEOUT_MS), request);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!isQuotaError(error)) throw error;
    }
  }

  if (!outcome) throw lastError;

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
export function aiSdkGenerator(model: LanguageModel, timeoutMs = 25000): GenerateFn {
  return async ({ system, prompt, maxOutputTokens }) => {
    const result = await generateText({
      model,
      system,
      prompt,
      maxOutputTokens,
      // One shot per model, hard capped. The quota/spike fallback owns
      // retries, because SDK backoff can eat the 60 second serverless budget.
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    return {
      text: result.text,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
    };
  };
}
