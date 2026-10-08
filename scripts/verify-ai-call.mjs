/**
 * Proves the model routing works against the real Google key, without Next.
 *
 * Run: node --env-file=.env.local scripts/verify-ai-call.mjs
 *
 * It makes one small call per task group, reports the model, latency and token
 * counts, and prints what the guard thinks of the answer. One real call, real
 * evidence, no guessing about whether the key or the model id is right.
 */
import { buildGoogleModel, DEFAULT_ROUTING } from '../lib/ai/routing.ts';
import { generateText } from 'ai';
import { enforceStyleWithTelemetry } from '../lib/ai/style-guard.ts';

const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!key) {
  console.error('GOOGLE_GENERATIVE_AI_API_KEY is missing. Nothing to verify.');
  process.exit(1);
}

const targets = [
  { task: 'reply_draft', prompt: 'Reply to a client who asked what your Shopify store build includes. One short message, one question at most.' },
  { task: 'tone_score', prompt: 'Rate the tone of this message as one word, casual or formal: "yo bro is the store done yet"' },
];

let failures = 0;
for (const { task, prompt } of targets) {
  const route = DEFAULT_ROUTING[task];
  const started = Date.now();
  try {
    const model = buildGoogleModel(key, route.modelId);
    const result = await generateText({ model, prompt, maxOutputTokens: 400 });
    const ms = Date.now() - started;
    const guard = enforceStyleWithTelemetry(result.text, { channel: 'instagram' });
    console.log(`\n${task} -> ${route.provider}:${route.modelId}`);
    console.log(`  ok in ${ms} ms`);
    console.log(`  tokens in/out: ${result.usage?.inputTokens ?? '?'} / ${result.usage?.outputTokens ?? '?'}`);
    console.log(`  text: ${result.text.trim().slice(0, 200)}`);
    console.log(`  guard: ${guard.actions.words} words, ${guard.actions.questions} question(s), ` +
      `chase=${guard.actions.chasePhrases.length}, list=${guard.actions.hasListMarkers}, ` +
      `dashes=${guard.actions.dashesReplaced}`);
  } catch (error) {
    failures += 1;
    console.error(`\n${task} -> ${route.provider}:${route.modelId}`);
    console.error(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(failures === 0 ? '\nAll calls succeeded.' : `\n${failures} call(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
