import { generateText } from 'ai';

import { getModelFor, modelFor } from './provider';
import { logRun } from './telemetry';

import { VISION_PROMPT, parseVisionJson } from './vision-core';
export const VISION_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

export { parseVisionJson } from './vision-core';
export type { VisionExtraction, VisionMessage, VisionResult } from './vision-core';
import type { VisionExtraction, VisionResult } from './vision-core';

function isRetryableVisionError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false;
  const e = error as Record<string, unknown>;
  if (e.statusCode === 429 || e.statusCode === 503) return true;
  if (typeof e.message === 'string' && /RESOURCE_EXHAUSTED|QuotaFailure|UNAVAILABLE|high demand/i.test(e.message)) {
    return true;
  }
  const nested = Array.isArray(e.errors) ? e.errors : [e.cause, e.error].filter(Boolean);
  return (nested as unknown[]).some((n) => isRetryableVisionError(n, depth + 1));
}

/**
 * Reads one screenshot into structured conversation data. Never throws: a
 * failed read is a result the UI can explain, not a crash.
 */
export async function readConversationScreenshot(image: {
  bytes: Uint8Array;
  mime: string;
}): Promise<VisionResult> {
  const started = Date.now();
  const { model, resolved } = await getModelFor('vision');

  const candidates = [
    { handle: model, modelId: resolved.modelId },
    ...(resolved.modelId === VISION_FALLBACK_MODEL
      ? []
      : [{ handle: modelFor({ ...resolved, modelId: VISION_FALLBACK_MODEL }), modelId: VISION_FALLBACK_MODEL }]),
  ];

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const answer = await generateText({
        model: candidate.handle,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', image: image.bytes, mediaType: image.mime },
              { type: 'text', text: VISION_PROMPT },
            ],
          },
        ],
        maxOutputTokens: 1200,
      });
      const extraction = parseVisionJson(answer.text);
      await logRun({
        task: 'vision',
        resolved: { ...resolved, modelId: candidate.modelId },
        latencyMs: Date.now() - started,
        status: extraction ? 'ok' : 'blocked',
        guardrailActions: extraction
          ? { messages: extraction.messages.length }
          : { reason: 'unreadable' },
      });
      if (extraction) return { extraction, modelId: candidate.modelId };
      return { extraction: null, modelId: candidate.modelId, reason: 'unreadable' };
    } catch (error) {
      lastError = error;
      if (!isRetryableVisionError(error)) break;
    }
  }

  console.error('[vision] failed', lastError instanceof Error ? lastError.message : lastError);
  await logRun({
    task: 'vision',
    resolved,
    latencyMs: Date.now() - started,
    status: 'error',
    guardrailActions: { reason: 'model failed' },
  });
  return { extraction: null, modelId: null, reason: 'model failed' };
}
