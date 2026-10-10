import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

import { isEnabledFlag } from '../env';

/**
 * Which model runs which job, and the rules that stop that going wrong.
 *
 * This file is deliberately free of server-only imports, network calls and
 * database access, so the routing rules can be tested directly. The parts that
 * touch the API key and the database live in provider.ts.
 */

export type AiTask =
  | 'reply_draft'
  | 'plan'
  | 'research_synth'
  | 'vision'
  | 'summarize'
  | 'classify'
  | 'extract_facts'
  | 'tone_score'
  | 'embed';

export type ResolvedModel = {
  provider: string;
  modelId: string;
  /** True when the row asked for this model but the provider cannot serve it. */
  fellBack: boolean;
  reason: string;
};

export const AI_TASKS: AiTask[] = [
  'reply_draft',
  'plan',
  'research_synth',
  'vision',
  'summarize',
  'classify',
  'extract_facts',
  'tone_score',
  'embed',
];

/**
 * The only models this app is allowed to call on the free tier.
 *
 * The 2.5 series returns NOT_FOUND for accounts created now, and the pro models
 * are excluded deliberately, because they need billing and the owner chose to
 * stay free. A model that is not on this list cannot be routed to, however the
 * database is edited, which makes an accidental bill impossible rather than
 * unlikely.
 */
export const ALLOWED_MODELS: Record<string, string[]> = {
  google: [
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-embedding-001',
    'gemini-embedding-2',
  ],
};

/** When the primary draft model exhausts its free daily quota, drafts go
 * here. The lite model has its own allowance, so the button keeps working. */
export const DRAFT_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

export const DEFAULT_ROUTING: Record<AiTask, { provider: string; modelId: string }> = {
  reply_draft: { provider: 'google', modelId: 'gemini-3.5-flash' },
  plan: { provider: 'google', modelId: 'gemini-3.5-flash' },
  research_synth: { provider: 'google', modelId: 'gemini-3.5-flash' },
  vision: { provider: 'google', modelId: 'gemini-3.5-flash' },
  summarize: { provider: 'google', modelId: 'gemini-3.5-flash' },
  classify: { provider: 'google', modelId: 'gemini-3.1-flash-lite' },
  extract_facts: { provider: 'google', modelId: 'gemini-3.1-flash-lite' },
  tone_score: { provider: 'google', modelId: 'gemini-3.1-flash-lite' },
  embed: { provider: 'google', modelId: 'gemini-embedding-001' },
};

export function isAllowed(provider: string, modelId: string): boolean {
  return (ALLOWED_MODELS[provider] ?? []).includes(modelId);
}

/**
 * Picks the model for a task: the user's own row if there is one, the seed
 * default otherwise, with a guard so a bad row cannot route to a paid model.
 */
export function resolveTask(
  task: AiTask,
  rows: { task: string; provider: string; model_id: string }[],
): ResolvedModel {
  const fallback = DEFAULT_ROUTING[task];
  const row = rows.find((r) => r.task === task);

  if (!row) {
    return { ...fallback, fellBack: false, reason: 'seed default' };
  }
  if (!isAllowed(row.provider, row.model_id)) {
    return {
      ...fallback,
      fellBack: true,
      reason: `"${row.provider}:${row.model_id}" is not on the free tier allow list`,
    };
  }
  return {
    provider: row.provider,
    modelId: row.model_id,
    fellBack: false,
    reason: 'task_routing',
  };
}

/**
 * Whether the app is allowed to spend money on AI.
 *
 * Separate and explicit, because the free tier is a decision, not a default.
 * Nothing here turns billing on, it only refuses to pretend otherwise.
 */
export function billingEnabled(): boolean {
  return isEnabledFlag(process.env.ENABLE_AI_BILLING);
}

/**
 * Cost is recorded as zero unless a price is known.
 *
 * Guessing a price would corrupt the one number that tells the owner whether he
 * has drifted off the free tier, so an unknown price stays unknown. The table is
 * empty on purpose until real prices are confirmed and entered.
 */
export const MODEL_PRICES: Record<string, { in: number; out: number }> = {};

export function estimateCostUsd(
  provider: string,
  modelId: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | null {
  const price = MODEL_PRICES[`${provider}:${modelId}`];
  if (!price) return null;
  return ((inputTokens ?? 0) / 1_000_000) * price.in + ((outputTokens ?? 0) / 1_000_000) * price.out;
}

/**
 * Builds a callable model from an explicit key.
 *
 * Kept here, next to the allow list, so the key-resolution rules and the model
 * name rules sit together, and so a script can make a real call without pulling
 * in the Next.js server runtime.
 */
export function buildGoogleModel(apiKey: string, modelId: string): LanguageModel {
  if (!isAllowed('google', modelId)) {
    throw new Error(`Model "${modelId}" is not on the free tier allow list.`);
  }
  return createGoogleGenerativeAI({ apiKey })(modelId);
}
