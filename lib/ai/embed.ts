/**
 * Embeddings for semantic recall.
 *
 * gemini-embedding-001 at 768 dimensions, which matches the pgvector column in
 * migration 0005 and is well inside the free tier. Like every AI helper here,
 * this never throws: callers degrade to full text search when embeddings are
 * unavailable.
 */

export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_BATCH_LIMIT = 100;

export type EmbeddingResult = {
  embeddings: number[][] | null;
  reason?: string;
};

/** Validates the raw API payload. Exported for tests. */
export function parseEmbeddingResponse(
  payload: unknown,
  expectedCount: number,
): number[][] | null {
  const embeddings = (payload as { embeddings?: unknown[] } | null)?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== expectedCount) return null;
  const values = embeddings.map((entry) => (entry as { values?: number[] } | null)?.values);
  const valid = values.every(
    (vector) =>
      Array.isArray(vector) &&
      vector.length === EMBEDDING_DIMENSIONS &&
      vector.every((n) => typeof n === 'number' && Number.isFinite(n)),
  );
  return valid ? (values as number[][]) : null;
}

export async function embedTexts(
  texts: string[],
  overrides?: { fetchImpl?: typeof fetch },
): Promise<EmbeddingResult> {
  const clean = texts.map((text) => text.trim().slice(0, 4000)).filter((text) => text.length > 0);
  if (clean.length === 0) return { embeddings: null, reason: 'nothing to embed' };

  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return { embeddings: null, reason: 'no key' };

  try {
    const doFetch = overrides?.fetchImpl ?? fetch;
    const response = await doFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          requests: clean.map((text) => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: EMBEDDING_DIMENSIONS,
          })),
        }),
      },
    );
    if (!response.ok) return { embeddings: null, reason: `http ${response.status}` };
    const embeddings = parseEmbeddingResponse(await response.json(), clean.length);
    if (!embeddings) return { embeddings: null, reason: 'bad response' };
    return { embeddings };
  } catch (error) {
    console.error('[embed] failed', error instanceof Error ? error.message : error);
    return { embeddings: null, reason: 'error' };
  }
}
