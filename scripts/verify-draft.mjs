/**
 * Runs the real drafting pipeline against real conversations from the archive.
 *
 * Run: node --env-file=.env.local --import tsx scripts/verify-draft.mjs
 *
 * This is the honest check before any UI exists: take conversations where the
 * client actually replied, hand the pipeline the history up to a real client
 * message, and see what it produces and what the guard says about it.
 */
import { generateText } from 'ai';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildGoogleModel, DEFAULT_ROUTING } from '../lib/ai/routing.ts';
import { draftReplyWith } from '../lib/ai/draft-core.ts';

const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!key) {
  console.error('GOOGLE_GENERATIVE_AI_API_KEY is missing.');
  process.exit(1);
}

const model = buildGoogleModel(key, DEFAULT_ROUTING.reply_draft.modelId);
const generate = async ({ system, prompt, maxOutputTokens }) => {
  const result = await generateText({ model, system, prompt, maxOutputTokens });
  return {
    text: result.text,
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
  };
};

const dir = '/home/user/ig_parsed/threads';
const threads = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .filter((t) => t.their_count > 0 && t.messages.some((m) => m.is_me))
  .sort((a, b) => b.message_count - a.message_count);

const wanted = Number(process.argv[2] ?? 3);
let checked = 0;

for (const thread of threads) {
  if (checked >= wanted) break;

  // The last client message with at least one earlier message for context.
  const messages = thread.messages;
  const lastClientIndex = messages.map((m) => m.is_me).lastIndexOf(false);
  if (lastClientIndex < 1) continue;

  const history = messages.slice(0, lastClientIndex).map((m) => ({
    role: m.is_me ? 'me' : 'client',
    content: m.text ?? '',
    sent_at: m.sent_at,
  }));
  const incoming = messages[lastClientIndex].text ?? '';
  if (!incoming.trim()) continue;

  console.log('\n' + '='.repeat(72));
  console.log(`THREAD ${thread.folder}  (${thread.my_count} mine / ${thread.their_count} theirs)`);
  console.log('='.repeat(72));
  console.log('LAST CLIENT MESSAGE:');
  console.log('  ' + incoming.replace(/\s+/g, ' ').slice(0, 300));

  const outcome = await draftReplyWith(generate, {
    context: {
      client: { id: thread.folder, name: thread.handle, stage: 'lead' },
      thread: { id: thread.folder, title: thread.handle },
      messages: history,
      incoming,
    },
    channel: 'instagram',
    tone: 'casual',
  });

  console.log(`\nDRAFT (${outcome.attempts} attempt${outcome.attempts === 1 ? '' : 's'}, ${outcome.latencyMs} ms, ok=${outcome.ok}):`);
  console.log('  ' + outcome.text.replace(/\n/g, '\n  '));
  console.log(
    `\nGUARD: ${outcome.actions.words} words, ${outcome.actions.questions} question(s), ` +
      `chase=${outcome.actions.chasePhrases.length}, list=${outcome.actions.hasListMarkers}, ` +
      `dashes=${outcome.actions.dashesReplaced}`,
  );
  if (outcome.fixed) console.log('  a repair was needed and made');
  if (outcome.problems.length) console.log('  STILL WRONG: ' + outcome.problems.join(' '));
  checked += 1;
}

console.log(`\nChecked ${checked} conversation(s).`);
