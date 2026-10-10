/**
 * One-shot backfill for message embeddings.
 *
 * Run after migration 0005 has been applied in the Supabase SQL editor:
 *   node --env-file=.env.local scripts/backfill-embeddings.mjs
 *
 * Safe to run again: it only touches messages whose embedding is still null,
 * and it uses the service key so it works outside the app.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY;
const MODEL = 'gemini-embedding-001';
const DIMS = 768;
const BATCH = 40;
const SLEEP_MS = 26000; // free tier allows 100 embed requests per minute

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function embedBatch(texts) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await embedOnce(texts);
    } catch (error) {
      if (!String(error.message).includes('429') || attempt === 5) throw error;
      console.log('rate limited, waiting 25s');
      await sleep(25000);
    }
  }
  throw new Error('unreachable');
}

async function embedOnce(texts) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GOOGLE_GENERATIVE_AI_API_KEY },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text: text.slice(0, 4000) || ' ' }] },
          outputDimensionality: DIMS,
        })),
      }),
    },
  );
  if (!response.ok) throw new Error(`embed http ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const values = payload.embeddings.map((entry) => entry.values);
  if (values.some((v) => !Array.isArray(v) || v.length !== DIMS)) throw new Error('bad embedding shape');
  return values;
}

let offset = 0;
let total = 0;
for (;;) {
  const listResponse = await fetch(
    `${URL}/rest/v1/messages?select=id,content&embedding=is.null&order=created_at.asc&limit=${BATCH}&offset=${offset}`,
    { headers: { ...headers, Prefer: 'count=exact' } },
  );
  if (!listResponse.ok) {
    console.error(`list failed http ${listResponse.status}: ${await listResponse.text()}`);
    console.error('If this says the embedding column is missing, apply supabase/migrations/0005_vector_search.sql first.');
    process.exit(1);
  }
  const rows = await listResponse.json();
  if (rows.length === 0) break;

  const vectors = await embedBatch(rows.map((row) => row.content));
  for (let i = 0; i < rows.length; i++) {
    const updateResponse = await fetch(`${URL}/rest/v1/messages?id=eq.${rows[i].id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ embedding: vectors[i] }),
    });
    if (!updateResponse.ok) throw new Error(`update failed http ${updateResponse.status}`);
  }
  total += rows.length;
  console.log(`embedded ${total} messages`);
  await sleep(SLEEP_MS);
  // Every updated row now leaves the filter, so offset stays at 0.
  if (rows.length < BATCH) break;
}
console.log(`done, ${total} messages embedded`);
