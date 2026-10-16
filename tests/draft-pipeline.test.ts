import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * The drafting loop, driven by a fake model.
 *
 * This is where the guard stops being a checker and starts changing behaviour,
 * so the tests are about the loop rather than the wording: does a chase get
 * caught, is the repair attempt actually a second call, and does a second
 * failure surface rather than disappear into the UI looking fine.
 */

const baseRequest = {
  context: {
    client: { id: 'c1', name: 'Simon', stage: 'quoted' },
    thread: { id: 't1', title: 'Simon' },
    messages: [
      { role: 'me' as const, content: 'Store build is $199.99.', sent_at: '2026-10-01T10:00:00Z' },
      { role: 'client' as const, content: 'Can you do $150?', sent_at: '2026-10-02T10:00:00Z' },
    ],
  },
  channel: 'instagram',
};

test('a clean draft is returned untouched with no second call', async () => {
  const { draftReplyWith } = await import('../lib/ai/draft-core.ts');

  let calls = 0;
  const outcome = await draftReplyWith(
    async () => {
      calls += 1;
      return { text: 'Fair enough on the price. That number covers the store, the product research and launch. What is the part you want me to trim?', inputTokens: 100, outputTokens: 50 };
    },
    baseRequest,
  );

  assert.equal(calls, 1, 'a passing draft must not be regenerated');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.fixed, false);
  assert.equal(outcome.attempts, 1);
  assert.deepEqual(outcome.problems, []);
});

test('a reply without one natural question at the end is repaired', async () => {
  const { draftReplyWith } = await import('../lib/ai/draft-core.ts');
  const seen: string[] = [];
  const outcome = await draftReplyWith(
    async ({ prompt }) => {
      seen.push(prompt);
      return seen.length === 1
        ? { text: 'That is a promising start. The cards are bringing people in.', inputTokens: 10, outputTokens: 10 }
        : { text: 'That is a promising start after one month. Are the cards bringing in more enquiries now?', inputTokens: 10, outputTokens: 10 };
    },
    baseRequest,
  );

  assert.equal(outcome.attempts, 2);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.actions.missingClosingQuestion, false);
  assert.match(seen[1] ?? '', /end with a short, direct question/i);
});

test('non-reply tasks are not forced into the closing-question shape', async () => {
  const { draftReplyWith } = await import('../lib/ai/draft-core.ts');
  let calls = 0;
  const outcome = await draftReplyWith(
    async () => {
      calls += 1;
      return { text: 'Confirm the product list before building the store.', inputTokens: 10, outputTokens: 10 };
    },
    { ...baseRequest, purpose: 'next_step' },
  );
  assert.equal(calls, 1);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.actions.missingClosingQuestion, false);
});

test('a chase is caught and repaired, and the repair is a fresh call', async () => {
  const { draftReplyWith } = await import('../lib/ai/draft-core.ts');

  const seen: string[] = [];
  const outcome = await draftReplyWith(
    async ({ prompt }) => {
      seen.push(prompt);
      if (seen.length === 1) {
        return { text: 'Hey, just checking in, did you see my last message?', inputTokens: 100, outputTokens: 20 };
      }
      return { text: 'The $199.99 covers the store build, research and launch. What part of it feels too high?', inputTokens: 120, outputTokens: 40 };
    },
    baseRequest,
  );

  assert.equal(seen.length, 2, 'a chase must trigger exactly one repair');
  assert.equal(outcome.fixed, true);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.attempts, 2);
  assert.match(outcome.text, /199.99/);

  // The repair prompt must quote the actual failure, not just say "try again".
  const repair = seen[1] ?? '';
  assert.match(repair, /chase phrasing/i);
  assert.match(repair, /just checking in/);
  assert.match(repair, /Write it again from scratch/);
});

test('two questions are caught, and the count is in the repair instruction', async () => {
  const { draftReplyWith } = await import('../lib/ai/draft-core.ts');

  const seen: string[] = [];
  const outcome = await draftReplyWith(
    async ({ prompt }) => {
      seen.push(prompt);
      return seen.length === 1
        ? { text: 'Is it the price? Or the timeline?', inputTokens: 10, outputTokens: 10 }
        : { text: 'Is it the price or the timeline that is the problem?', inputTokens: 10, outputTokens: 10 };
    },
    baseRequest,
  );

  assert.equal(outcome.attempts, 2);
  assert.ok(outcome.ok);
  assert.match(seen[1] ?? '', /asked 2 questions/);
  assert.match(seen[1] ?? '', /limit is one/);
});

test('a list is rejected in a chat message', async () => {
  const { draftReplyWith } = await import('../lib/ai/draft-core.ts');

  const seen: string[] = [];
  const outcome = await draftReplyWith(
    async ({ prompt }) => {
      seen.push(prompt);
      return seen.length === 1
        ? { text: 'What you get:\n- store build\n- product research\n- ads setup', inputTokens: 10, outputTokens: 10 }
        : { text: 'The price covers the store build, product research and ads setup. Would you like me to break down the scope?', inputTokens: 10, outputTokens: 10 };
    },
    baseRequest,
  );

  assert.equal(outcome.attempts, 2);
  assert.match(seen[1] ?? '', /laid out as a list/);
  assert.equal(outcome.actions.hasListMarkers, false);
});

test('two failures in a row are surfaced, never passed off as good', async () => {
  const { draftReplyWith } = await import('../lib/ai/draft-core.ts');

  let calls = 0;
  const outcome = await draftReplyWith(
    async () => {
      calls += 1;
      return { text: 'Hey mate, just checking in, any update?', inputTokens: 10, outputTokens: 10 };
    },
    baseRequest,
  );

  assert.equal(calls, 2, 'exactly one repair, not endless retries');
  assert.equal(outcome.fixed, true);
  assert.equal(outcome.ok, false, 'a still-broken draft must not report success');
  assert.ok(outcome.problems.length > 0);
  assert.match(outcome.problems.join(' '), /chase phrasing/i);
});

test('an over long draft is reported, not silently truncated', async () => {
  const { draftReplyWith } = await import('../lib/ai/draft-core.ts');

  const long = 'This is a long sentence about the store build and the research and the ads and the launch. '.repeat(8);
  let calls = 0;

  const outcome = await draftReplyWith(
    async () => {
      calls += 1;
      return { text: calls === 1 ? long : 'The number covers the store build, research and launch. What feels too high?', inputTokens: 10, outputTokens: 10 };
    },
    baseRequest,
  );

  assert.equal(outcome.attempts, 2);
  assert.ok(outcome.ok, 'the second draft is inside the budget');
  assert.ok(outcome.actions.words <= 120);
});

test('the em dash ban is repaired by the guard itself, without a second call', async () => {
  const { draftReplyWith } = await import('../lib/ai/draft-core.ts');

  let calls = 0;
  const outcome = await draftReplyWith(
    async () => {
      calls += 1;
      return { text: 'The build takes two weeks \u2014 then your store goes live. Want me to start?', inputTokens: 10, outputTokens: 10 };
    },
    baseRequest,
  );

  assert.equal(calls, 1, 'a dash is fixable in place, so no regeneration is needed');
  assert.ok(outcome.ok);
  assert.ok(!outcome.text.includes('\u2014'));
  assert.ok(outcome.actions.dashesReplaced > 0, 'telemetry should still record the dash');
});

test('the prompt the model sees contains the conversation and the rules', async () => {
  const { draftReplyWith } = await import('../lib/ai/draft-core.ts');

  let system = '';
  let prompt = '';
  await draftReplyWith(
    async (input) => {
      system = input.system;
      prompt = input.prompt;
      return { text: 'Understood. What feels too high about it?', inputTokens: 10, outputTokens: 10 };
    },
    { ...baseRequest, instruction: 'he is sensitive about price' },
  );

  assert.match(system, /You write as Hamza/);
  assert.match(prompt, /Can you do \$150\?/, 'the client message must be in the prompt');
  assert.match(prompt, /He is sensitive about price|he is sensitive about price/);
  assert.match(prompt, /Write one message, ready to send/);
});

test('an empty response is a failure, not an empty draft shown as ready', async () => {
  const { draftReplyWith } = await import('../lib/ai/draft-core.ts');

  let calls = 0;
  const outcome = await draftReplyWith(
    async () => {
      calls += 1;
      return { text: '   ', inputTokens: 10, outputTokens: 0 };
    },
    baseRequest,
  );

  assert.equal(calls, 2, 'an empty reply must be retried once');
  assert.equal(outcome.ok, false, 'an empty response is never a usable draft');
  assert.match(outcome.problems.join(' '), /came back empty/i);
});
