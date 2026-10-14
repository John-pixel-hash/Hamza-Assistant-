import { generateText } from 'ai';

import { MAX_CHAT_SCREENSHOTS } from '../chat/capture-core';
import { getModelFor, modelFor } from './provider';
import { modelChain, sleepMs } from './routing';
import { logRun } from './telemetry';

import { buildVisionPrompt, parseVisionJson } from './vision-core';
export const VISION_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

// Vision and drafting share the 60 second serverless window. This gives the
// combined read an explicit budget and leaves time for saving and drafting.
const VISION_BUDGET_MS = 26000;
const VISION_ATTEMPT_TIMEOUT_MS = 12000;
const VISION_BACKOFF_MS = 1500;

export { parseVisionJson } from './vision-core';
export type { VisionExtraction, VisionMessage, VisionResult } from './vision-core';
import type { VisionExtraction, VisionResult } from './vision-core';

type ScreenshotImage = { bytes: Uint8Array; mime: string };

function isRetryableVisionError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false;
  const e = error as Record<string, unknown>;
  if ([408, 425, 429, 500, 502, 503, 504].includes(Number(e.statusCode))) return true;
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  if (
    typeof e.message === 'string' &&
    /RESOURCE_EXHAUSTED|QuotaFailure|UNAVAILABLE|high demand|timeout|timed out|network|fetch failed/i.test(e.message)
  ) {
    return true;
  }
  const nested = Array.isArray(e.errors) ? e.errors : [e.cause, e.error].filter(Boolean);
  return (nested as unknown[]).some((n) => isRetryableVisionError(n, depth + 1));
}

/**
 * Reads an ordered batch of screenshots into one structured conversation.
 * Never throws: a failed read is a result the UI can explain, not a crash.
 */
export async function readConversationScreenshots(images: ScreenshotImage[]): Promise<VisionResult> {
  if (images.length === 0 || images.length > MAX_CHAT_SCREENSHOTS) {
    return { extraction: null, modelId: null, reason: 'unreadable' };
  }

  const started = Date.now();
  const { model, resolved } = await getModelFor('vision');

  // The routed model first, then every other free tier model: quota is per
  // model id, so a spike on one rarely touches the rest. A short pause
  // between refusals gives a recovering bucket time to open.
  const candidates = modelChain(resolved.modelId).map((modelId) => ({
    handle: modelId === resolved.modelId ? model : modelFor({ ...resolved, modelId }),
    modelId,
  }));
  const content = [
    ...images.map(({ bytes, mime }) => ({ type: 'image' as const, image: bytes, mediaType: mime })),
    { type: 'text' as const, text: buildVisionPrompt(images.length) },
  ];

  let lastError: unknown = null;
  for (const [index, candidate] of candidates.entries()) {
    if (
      index > 0 &&
      Date.now() - started + VISION_BACKOFF_MS + VISION_ATTEMPT_TIMEOUT_MS > VISION_BUDGET_MS
    ) {
      break;
    }
    if (index > 0) await sleepMs(VISION_BACKOFF_MS);
    try {
      const answer = await generateText({
        model: candidate.handle,
        messages: [{ role: 'user', content }],
        maxOutputTokens: Math.min(4096, 1200 * images.length),
        // Our own candidate loop owns retries. SDK retries would burn seconds
        // inside a server action that has a hard 60 second budget.
        abortSignal: AbortSignal.timeout(VISION_ATTEMPT_TIMEOUT_MS),
      });
      const extraction = parseVisionJson(answer.text, images.length);
      await logRun({
        task: 'vision',
        resolved: { ...resolved, modelId: candidate.modelId },
        inputTokens: answer.usage?.inputTokens ?? null,
        outputTokens: answer.usage?.outputTokens ?? null,
        latencyMs: Date.now() - started,
        status: extraction ? 'ok' : 'blocked',
        guardrailActions: extraction
          ? { messages: extraction.messages.length, images: images.length }
          : { reason: 'unreadable', images: images.length },
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
    guardrailActions: { reason: 'model failed', images: images.length },
  });
  return { extraction: null, modelId: null, reason: 'model failed' };
}

/** Backwards-compatible single-image entry point. */
export async function readConversationScreenshot(image: ScreenshotImage): Promise<VisionResult> {
  return readConversationScreenshots([image]);
}
