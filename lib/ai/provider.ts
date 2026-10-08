import 'server-only';

import type { LanguageModel } from 'ai';

import { firstFilled } from '../env';
import { createClient } from '../supabase/server';
import { buildGoogleModel, resolveTask, type AiTask, type ResolvedModel } from './routing';

/**
 * The server half of model routing: the API key, the database row, and the
 * handle the AI SDK needs. The rules themselves live in routing.ts so they can
 * be tested without a network.
 */

export {
  ALLOWED_MODELS,
  buildGoogleModel,
  AI_TASKS,
  DEFAULT_ROUTING,
  billingEnabled,
  estimateCostUsd,
  isAllowed,
  resolveTask,
} from './routing';
export type { AiTask, ResolvedModel } from './routing';

/** Turns a resolved id into something the AI SDK can call. */
export function modelFor(resolved: ResolvedModel): LanguageModel {
  if (resolved.provider !== 'google') {
    throw new Error(
      `Provider "${resolved.provider}" has no adapter installed. Only google is wired up so far.`,
    );
  }
  const apiKey = firstFilled(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GOOGLE_API_KEY,
  );
  if (!apiKey) {
    throw new Error(
      'GOOGLE_GENERATIVE_AI_API_KEY is not set. Add it to .env.local locally, ' +
        'or to the Vercel project environment variables, then redeploy.',
    );
  }
  return buildGoogleModel(apiKey, resolved.modelId);
}

/** Reads routing rows for the signed-in user. Empty on any failure, so seeds. */
export async function loadRouting(): Promise<
  { task: string; provider: string; model_id: string }[]
> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from('task_routing').select('task, provider, model_id');
    return (data ?? []) as unknown as { task: string; provider: string; model_id: string }[];
  } catch {
    return [];
  }
}

export async function getModelFor(
  task: AiTask,
): Promise<{ model: LanguageModel; resolved: ResolvedModel }> {
  const resolved = resolveTask(task, await loadRouting());
  return { model: modelFor(resolved), resolved };
}
