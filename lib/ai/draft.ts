import 'server-only';

import { generateText, type LanguageModel } from 'ai';

import { buildKnowledgeBlock } from './knowledge';
import { getActivePlaybooks } from '../data/knowledge';
import { getModelFor, modelFor } from './provider';
import { classifyDraftError, isRetryableDraftError } from './draft-errors';
import { DRAFT_FALLBACK_MODEL, modelChain, sleepMs } from './routing';

// Drafts share the 60 second serverless window with everything else the
// action does. The capture flow can request a shorter budget to leave time for
// screenshot reading and saving; no caller can extend this hard limit.
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
 * A normal draft uses one call, with a repair call only when the first text
 * breaks a style rule. Transient provider failures may switch to another free
 * model, within the explicit 40 second budget and never to a paid model.
 */

export {
  DRAFT_MAX_OUTPUT_TOKENS,
  buildRepairInstruction,
  describeProblems,
  draftReplyWith,
} from './draft-core';
export type { DraftOutcome, DraftRequest, GenerateFn } from './draft-core';

export async function draftReply(
  request: DraftRequest,
): Promise<DraftOutcome & { modelId: string }> {
  const { model, resolved } = await getModelFor('reply_draft');

  // Operating knowledge rides along when a playbook matches the request.
  // Failures here must never cost the draft: empty block means no knowledge.
  let knowledge = '';
  try {
    const playbooks = await getActivePlaybooks();
    const lastClient = [...request.context.messages]
      .reverse()
      .find((message) => message.role === 'client')?.content;
    knowledge = buildKnowledgeBlock(
      [request.context.incoming ?? '', lastClient ?? '', request.context.thread.title ?? ''].join(' '),
      playbooks,
    );
  } catch (error) {
    console.error('[draft] knowledge load failed', error instanceof Error ? error.message : error);
  }
  request = { ...request, knowledge };

  // The capture flow lives inside a 60 second serverless window, so it starts
  // on the fast model. The reply panel keeps the primary voice.
  const startFast = request.fast === true && resolved.modelId !== DRAFT_FALLBACK_MODEL;
  const firstModelId = startFast ? DRAFT_FALLBACK_MODEL : resolved.modelId;
  let usedModel = startFast ? modelFor({ ...resolved, modelId: firstModelId }) : model;
  let usedResolved = startFast
    ? { ...resolved, modelId: firstModelId, reason: 'capture fast path' }
    : resolved;
  let fallbackUsed = false;

  // Try the routed model first, then the other free-tier models on quota,
  // timeout, or transient provider errors. Do not spend extra attempts on a
  // permanent error such as an invalid request.
  const requestedBudgetMs = typeof request.budgetMs === 'number' && Number.isFinite(request.budgetMs)
    ? request.budgetMs
    : DRAFT_BUDGET_MS;
  const budgetMs = Math.max(1000, Math.min(DRAFT_BUDGET_MS, requestedBudgetMs));
  const requestedAttemptTimeoutMs = typeof request.attemptTimeoutMs === 'number' && Number.isFinite(request.attemptTimeoutMs)
    ? request.attemptTimeoutMs
    : DRAFT_ATTEMPT_TIMEOUT_MS;
  const attemptTimeoutMs = Math.max(1000, Math.min(DRAFT_ATTEMPT_TIMEOUT_MS, requestedAttemptTimeoutMs));
  const started = Date.now();
  let outcome: DraftOutcome | null = null;
  let lastError: unknown = null;
  const triedModels: string[] = [];

  for (const [index, modelId] of modelChain(firstModelId).entries()) {
    if (index > 0) {
      if (Date.now() - started + DRAFT_BACKOFF_MS >= budgetMs) break;
      await sleepMs(DRAFT_BACKOFF_MS);
      if (Date.now() - started >= budgetMs) break;
      usedModel = modelFor({ ...resolved, modelId });
      usedResolved = {
        ...resolved,
        modelId,
        fellBack: true,
        reason: 'transient provider failure fallback',
      };
      fallbackUsed = true;
    }
    triedModels.push(modelId);
    try {
      const generator: GenerateFn = async (input) => {
        const remainingMs = budgetMs - (Date.now() - started);
        if (remainingMs <= 0) {
          const error = new Error('Draft provider time budget expired.');
          error.name = 'TimeoutError';
          throw error;
        }
        const timeoutMs = Math.max(1, Math.min(attemptTimeoutMs, Math.floor(remainingMs)));
        return aiSdkGenerator(usedModel, timeoutMs)(input);
      };
      outcome = await draftReplyWith(generator, request);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!isRetryableDraftError(error)) break;
    }
  }

  if (!outcome) {
    const failureKind = classifyDraftError(lastError);
    await logRun({
      task: 'reply_draft',
      resolved: usedResolved,
      threadId: request.context.thread.id,
      latencyMs: Date.now() - started,
      status: 'error',
      guardrailActions: { modelFallback: fallbackUsed, triedModels, failureKind },
      errorMessage: `provider failure: ${failureKind}`,
    });
    throw lastError ?? new Error('All free-tier draft models failed.');
  }

  await logRun({
    task: 'reply_draft',
    resolved: usedResolved,
    threadId: request.context.thread.id,
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    latencyMs: outcome.latencyMs,
    status: fallbackUsed
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
      modelFallback: fallbackUsed,
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
      // One shot per model, hard capped. The explicit free-model fallback
      // owns retries, because SDK backoff can eat the 60 second serverless budget.
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    return {
      text: result.text,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
    };
  };
}
