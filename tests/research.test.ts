import assert from 'node:assert/strict';
import test from 'node:test';

import { parseGroundingResponse, parseTavilyResponse, researchQuestion } from '../lib/ai/research.ts';

test('parseGroundingResponse pulls text and deduped sources', () => {
  const { text, sources } = parseGroundingResponse({
    candidates: [
      {
        content: { parts: [{ text: 'Shopify takes 2% on the basic plan.' }] },
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://a.example', title: 'A' } },
            { web: { uri: 'https://a.example', title: 'A again' } },
            { web: { uri: 'https://b.example', title: 'B' } },
            { web: {} },
          ],
        },
      },
    ],
  });
  assert.equal(text, 'Shopify takes 2% on the basic plan.');
  assert.deepEqual(sources, [
    { title: 'A', url: 'https://a.example' },
    { title: 'B', url: 'https://b.example' },
  ]);
});

test('parseGroundingResponse tolerates an empty payload', () => {
  assert.deepEqual(parseGroundingResponse(null), { text: null, sources: [] });
  assert.deepEqual(parseGroundingResponse({ candidates: [] }), { text: null, sources: [] });
});

test('researchQuestion fails soft without a key', async () => {
  const saved = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const result = await researchQuestion('anything');
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = saved;
  assert.equal(result.answer, null);
  assert.equal(result.reason, 'no search provider');
});

test('parseTavilyResponse keeps only real urls and caps at six', () => {
  const sources = parseTavilyResponse({
    results: [
      { title: 'A', url: 'https://a.example', content: 'x'.repeat(2000) },
      { title: '', url: 'not-a-url' },
      { title: 'B', url: 'https://b.example' },
    ],
  });
  assert.equal(sources.length, 2);
  assert.equal(sources[0]?.snippet?.length, 1500);
  assert.equal(sources[1]?.title, 'B');
});

test('researchQuestion with a Tavily key searches then synthesises', async () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  process.env.TAVILY_API_KEY = 'tvly-test';
  const seen: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url.includes('tavily') ? 'tavily' : 'synth');
    if (url.includes('tavily')) {
      return new Response(
        JSON.stringify({ results: [{ title: 'A', url: 'https://a.example', content: 'facts' }] }),
        { status: 200 },
      );
    }
    const synthPayload = {
      candidates: [{ content: { parts: [{ text: 'Synthesised [1].' }] } }],
    };
    return new Response(JSON.stringify(synthPayload), { status: 200 });
  }) as unknown as typeof fetch;

  const result = await researchQuestion('anything', { fetchImpl });
  assert.deepEqual(seen, ['tavily', 'synth']);
  assert.equal(result.answer, 'Synthesised [1].');
  assert.equal(result.sources.length, 1);
  delete process.env.TAVILY_API_KEY;
});

test('researchQuestion falls back to grounding when no Tavily key is set', async () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  delete process.env.TAVILY_API_KEY;
  let calls = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calls += 1;
    if (String(input).includes('gemini-3.5-flash')) {
      return new Response('busy', { status: 503 });
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: 'An answer.' }] },
            groundingMetadata: { groundingChunks: [{ web: { uri: 'https://s.example', title: 'S' } }] },
          },
        ],
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const result = await researchQuestion('anything', { fetchImpl });
  assert.equal(calls, 3); // flash grounding, lite grounding, lite synth
  assert.equal(result.modelId, 'gemini-3.1-flash-lite');
  assert.equal(result.answer, 'An answer.');
  assert.equal(result.sources.length, 1);
});
