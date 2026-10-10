import assert from 'node:assert/strict';
import test from 'node:test';

import { EMBEDDING_DIMENSIONS, embedTexts, parseEmbeddingResponse } from '../lib/ai/embed.ts';
import { mergeHits, type SearchHit } from '../lib/data/search.ts';

function vector(fill = 0.1): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => fill);
}

function hit(id: string, rank: number): SearchHit {
  return {
    message_id: id,
    thread_id: 't1',
    thread_title: 'Thread',
    client_id: null,
    client_name: 'Client',
    role: 'client',
    channel: null,
    content: 'x',
    snippet: 'x',
    sent_at: '2026-10-01T00:00:00Z',
    rank,
  };
}

test('parseEmbeddingResponse accepts a well formed payload', () => {
  const parsed = parseEmbeddingResponse({ embeddings: [{ values: vector() }, { values: vector(0.2) }] }, 2);
  assert.ok(parsed);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.length, EMBEDDING_DIMENSIONS);
});

test('parseEmbeddingResponse rejects wrong shape and wrong dimensions', () => {
  assert.equal(parseEmbeddingResponse(null, 1), null);
  assert.equal(parseEmbeddingResponse({ embeddings: [] }, 1), null);
  assert.equal(parseEmbeddingResponse({ embeddings: [{ values: [1, 2, 3] }] }, 1), null);
  assert.equal(parseEmbeddingResponse({ embeddings: [{ values: vector() }, { values: vector() }] }, 1), null);
});

test('embedTexts maps a live shaped response through the parser', async () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  const result = await embedTexts(['hello there'], {
    fetchImpl: (async () =>
      new Response(JSON.stringify({ embeddings: [{ values: vector() }] }), { status: 200 })) as unknown as typeof fetch,
  });
  assert.ok(result.embeddings);
  assert.equal(result.embeddings.length, 1);
});

test('embedTexts fails soft on api errors', async () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  const result = await embedTexts(['hello there'], {
    fetchImpl: (async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch,
  });
  assert.equal(result.embeddings, null);
  assert.equal(result.reason, 'http 429');
});

test('mergeHits puts exact text matches first, dedupes, and caps', () => {
  const textHits = [hit('a', 0.9), hit('b', 0.8)];
  const semanticHits = [hit('b', 0.95), hit('c', 0.9), hit('d', 0.8)];
  const merged = mergeHits(textHits, semanticHits, 3);
  assert.deepEqual(merged.map((h) => h.message_id), ['a', 'b', 'c']);
});

test('mergeHits works with no semantic layer at all', () => {
  const merged = mergeHits([hit('a', 0.9)], null, 10);
  assert.deepEqual(merged.map((h) => h.message_id), ['a']);
});
