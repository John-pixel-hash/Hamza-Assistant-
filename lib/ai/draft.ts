import 'server-only';

import { generateText, type LanguageModel } from 'ai';

import { getModelFor } from './provider';
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

export async function draftReply(request: DraftRequest): Promise<DraftOutcome> {
  const { model, resolved } = await getModelFor('reply_draft');

  const outcome = await draftReplyWith(aiSdkGenerator(model), request);

  await logRun({
    task: 'reply_draft',
    resolved,
    threadId: request.context.thread.id,
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    latencyMs: outcome.latencyMs,
    status: outcome.ok ? (outcome.fixed ? 'fallback' : 'ok') : 'blocked',
    guardrailActions: {
      ...outcome.actions,
      attempts: outcome.attempts,
      fixed: outcome.fixed,
      problems: outcome.problems,
    },
    errorMessage: outcome.ok ? null : outcome.problems.join(' '),
  });

  return outcome;
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
