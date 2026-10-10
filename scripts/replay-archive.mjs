/**
 * Step 3.5: replay ten real conversations through the drafting pipeline and
 * put its draft next to the reply that was actually sent.
 *
 * Run: node --env-file=.env.local --import tsx scripts/replay-archive.mjs
 *
 * For each chosen conversation it finds the turn where a client message (or a
 * run of them) was answered by a real reply, hands everything before that turn
 * to the pipeline as history, the client block as the incoming message, and
 * records the draft. The real reply is kept as the ground truth. Both texts
 * then go through the same style guard, so the comparison is measured, not
 * vibes.
 */
import { generateText } from 'ai';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGoogleModel, DEFAULT_ROUTING } from '../lib/ai/routing.ts';
import { draftReplyWith } from '../lib/ai/draft-core.ts';
import {
  countQuestions,
  countWords,
  findBannedOpeners,
  findChasePhrases,
  hasListMarkers,
  stripDashes,
} from '../lib/ai/style-guard.ts';

const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!key) {
  console.error('GOOGLE_GENERATIVE_AI_API_KEY is missing.');
  process.exit(1);
}

const PRIMARY = DEFAULT_ROUTING.reply_draft.modelId;
const LITE = 'gemini-3.1-flash-lite';
let currentModel = PRIMARY;

function quotaIn(error, depth = 0) {
  if (!error || typeof error !== 'object' || depth > 4) return false;
  if (error.statusCode === 429) return true;
  if (typeof error.message === 'string' && /RESOURCE_EXHAUSTED|QuotaFailure/i.test(error.message)) return true;
  const nested = Array.isArray(error.errors) ? error.errors : [error.cause, error.error].filter(Boolean);
  return nested.some((n) => quotaIn(n, depth + 1));
}

const generateWith = (model) => async ({ system, prompt, maxOutputTokens }) => {
  const result = await generateText({ model, system, prompt, maxOutputTokens });
  return {
    text: result.text,
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
  };
};

const models = {
  [PRIMARY]: buildGoogleModel(key, PRIMARY),
  [LITE]: buildGoogleModel(key, LITE),
};

// Same rule as the live app: primary first, and when its free daily quota is
// spent the lite model writes the rest. The doc records which one wrote what.
const generate = async (args) => {
  try {
    return await generateWith(models[currentModel])(args);
  } catch (error) {
    if (quotaIn(error) && currentModel !== LITE) {
      console.log(`  quota spent on ${currentModel}, switching to ${LITE}`);
      currentModel = LITE;
      return await generateWith(models[currentModel])(args);
    }
    throw error;
  }
};

const dir = '/home/user/ig_parsed/threads';

/** Ten conversations covering the range of his work, named by handle. */
const WANTED = [
  'invictus',
  'joelgill_13',
  'fahadkhan',
  'nycastore',
  'drop_in_pak',
  'onaolapoistijabah',
  'kendall57684',
  'veloura',
  'jozy_ember',
  'ram',
];

const byHandle = new Map();
for (const file of readdirSync(dir)) {
  if (!file.endsWith('.json')) continue;
  const thread = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  byHandle.set(thread.handle, thread);
}

function pickTurn(messages) {
  // The turn whose real reply is the longest: the most substantive exchange.
  let best = null;
  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].is_me) continue;
    if (i > 0 && !messages[i - 1].is_me) continue; // only at the start of a run
    let j = i;
    while (j + 1 < messages.length && !messages[j + 1].is_me) j++;
    if (j + 1 >= messages.length || !messages[j + 1].is_me) continue;
    const incoming = messages
      .slice(i, j + 1)
      .map((m) => m.text ?? '')
      .join(' ')
      .trim();
    const actual = (messages[j + 1].text ?? '').trim();
    if (incoming.length < 20 || actual.length < 40) continue;
    if (!best || actual.length > best.actual.length) {
      best = { start: i, end: j, incoming, actual };
    }
  }
  return best;
}

function stats(text) {
  return {
    words: countWords(text),
    questions: countQuestions(text),
    chase: findChasePhrases(text).length,
    lists: hasListMarkers(text),
    dashes: stripDashes(text).replaced,
    openers: findBannedOpeners(text).length,
  };
}

function statLine(s) {
  return `${s.words} words, ${s.questions} question${s.questions === 1 ? '' : 's'}, ` +
    `${s.chase} chase, ${s.dashes} dash${s.dashes === 1 ? '' : 'es'}, ` +
    `${s.lists ? 'lists' : 'no lists'}, ${s.openers} banned opener${s.openers === 1 ? '' : 's'}`;
}

const results = [];

for (const handle of WANTED) {
  const thread = byHandle.get(handle);
  if (!thread) {
    console.error(`missing thread for ${handle}`);
    continue;
  }
  const turn = pickTurn(thread.messages);
  if (!turn) {
    console.error(`no suitable turn in ${handle}`);
    continue;
  }

  const history = thread.messages.slice(0, turn.start).map((m) => ({
    role: m.is_me ? 'me' : 'client',
    content: m.text ?? '',
    sent_at: m.sent_at,
  }));

  console.log(`drafting for ${handle}...`);
  const modelBefore = currentModel;
  const outcome = await draftReplyWith(generate, {
    context: {
      client: { id: thread.folder, name: thread.handle, stage: 'lead' },
      thread: { id: thread.folder, title: thread.handle },
      messages: history,
      incoming: turn.incoming,
    },
    channel: 'instagram',
    tone: 'unknown',
  });

  results.push({
    handle,
    folder: thread.folder,
    myCount: thread.my_count,
    theirCount: thread.their_count,
    incoming: turn.incoming,
    draft: outcome.text.trim(),
    draftOk: outcome.ok,
    attempts: outcome.attempts,
    latencyMs: outcome.latencyMs,
    problems: outcome.problems,
    actual: turn.actual,
    model: currentModel !== modelBefore ? currentModel : modelBefore,
  });
  console.log(`  ${handle}: ${outcome.attempts} attempt(s), ${outcome.latencyMs} ms, ok=${outcome.ok}`);
}

const today = new Date().toISOString().slice(0, 10);
const md = [];
md.push('# Replay: the pipeline against what was actually sent');
md.push('');
md.push(`Run on ${today}, model ${DEFAULT_ROUTING.reply_draft.modelId}, tone left to the`);
md.push('model to read from the thread, exactly as the panel does by default.');
md.push('');
md.push('Each case shows the client\'s last message, the draft the pipeline wrote');
md.push('today, and the reply that was actually sent back then. Both texts go through');
md.push('the same style guard, so the numbers are comparable. The real replies are');
md.push('history, so their dashes and chase lines appear as sent, on purpose.');
md.push('');

for (const r of results) {
  md.push(`## ${r.handle} (${r.myCount} from him, ${r.theirCount} from them)`);
  md.push('');
  md.push('**They said:**');
  md.push('');
  md.push('> ' + r.incoming.replace(/\n+/g, ' '));
  md.push('');
  md.push(`**The pipeline wrote today** on ${r.model} (${r.attempts} attempt${r.attempts === 1 ? '' : 's'}, ` +
    `${(r.latencyMs / 1000).toFixed(1)}s${r.draftOk ? '' : ', still flagged'}):`);
  md.push('');
  md.push('> ' + r.draft.replace(/\n+/g, ' '));
  md.push('');
  md.push(`Guard: ${statLine(stats(r.draft))}`);
  if (r.problems.length > 0) md.push(`Flagged: ${r.problems.join('; ')}`);
  md.push('');
  md.push('**What was actually sent back then:**');
  md.push('');
  md.push('> ' + r.actual.replace(/\n+/g, ' '));
  md.push('');
  md.push(`Guard: ${statLine(stats(r.actual))}`);
  md.push('');
}

writeFileSync('/home/user/hamza-assistant/docs/13-REPLAY-RESULTS.md', md.join('\n'));
console.log(`\nwrote docs/13-REPLAY-RESULTS.md with ${results.length} cases`);
