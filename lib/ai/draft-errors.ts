export type DraftErrorKind = 'quota' | 'timeout' | 'temporary' | 'unknown';

const QUOTA_MESSAGE = /RESOURCE_EXHAUSTED|QuotaFailure|quota.*(?:exceeded|exhausted)|high demand|too many requests/i;
const TIMEOUT_MESSAGE = /timed?\s*out|timeout|deadline exceeded|aborted due to timeout/i;
const TEMPORARY_MESSAGE = /UNAVAILABLE|temporarily unavailable|service unavailable|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up/i;
const TRANSIENT_STATUSES = new Set([408, 425, 500, 502, 503, 504]);

/**
 * Classifies the provider errors that are safe to retry on another free model.
 * SDK errors often wrap the useful status or cause several levels deep.
 */
export function classifyDraftError(error: unknown, depth = 0): DraftErrorKind {
  if (!error || typeof error !== 'object' || depth > 5) return 'unknown';

  const current = error as Record<string, unknown>;
  const message = typeof current.message === 'string' ? current.message : '';
  const name = typeof current.name === 'string' ? current.name : '';
  const rawStatus = current.statusCode ?? current.status;
  const status = typeof rawStatus === 'number' || typeof rawStatus === 'string'
    ? Number(rawStatus)
    : NaN;

  if (status === 429 || QUOTA_MESSAGE.test(message)) return 'quota';
  if (name === 'TimeoutError' || name === 'AbortError' || TIMEOUT_MESSAGE.test(message)) return 'timeout';
  if (TRANSIENT_STATUSES.has(status) || TEMPORARY_MESSAGE.test(message)) return 'temporary';

  const nested = [
    ...(Array.isArray(current.errors) ? current.errors : []),
    current.cause,
    current.error,
  ].filter(Boolean);
  for (const candidate of nested) {
    const kind = classifyDraftError(candidate, depth + 1);
    if (kind !== 'unknown') return kind;
  }

  return 'unknown';
}

export function isRetryableDraftError(error: unknown): boolean {
  return classifyDraftError(error) !== 'unknown';
}

/** Short, safe copy for the owner. Provider internals stay in server logs. */
export function draftFailureMessage(error: unknown): string {
  switch (classifyDraftError(error)) {
    case 'quota':
      return 'The free AI models are busy right now. Nothing was saved. Try again shortly.';
    case 'timeout':
      return 'The draft took too long to finish. Nothing was saved. Please try again.';
    case 'temporary':
      return 'The AI service is temporarily unavailable. Nothing was saved. Try again shortly.';
    default:
      return 'The draft could not be completed. Nothing was saved. Please try again.';
  }
}
