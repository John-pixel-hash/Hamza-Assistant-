import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * These tests are about what the model is told, not about what it says.
 *
 * If the prompt is wrong, no amount of guard after the fact fixes it, so the
 * assembled text is asserted directly. No model calls happen here.
 */

test('the voice prompt carries every rule the owner set', async () => {
  const { buildVoicePrompt } = await import('../lib/ai/voice.ts');
  const prompt = buildVoicePrompt({ channel: 'instagram', tone: 'casual', stage: 'quoted' });

  // The rules that must survive any edit to this file.
  assert.match(prompt, /Never use an em dash/);
  assert.match(prompt, /Never write bullet points in a chat message/);
  assert.match(prompt, /One question per message/);
  assert.match(prompt, /Never invent a fact/);
  assert.match(prompt, /No chase phrasing/);
  assert.match(prompt, /use research rather than guessing/);
  assert.match(prompt, /Never spam/);

  // The Instagram rule, because Instagram is the channel in play.
  assert.match(prompt, /Instagram direct message/);
  assert.ok(!prompt.includes('breaches Fiverr terms'), 'another platform rule must not leak in');
});

test('a Fiverr-sourced client keeps Fiverr rules wherever the chat happens', async () => {
  const { buildVoicePrompt } = await import('../lib/ai/voice.ts');

  const onFiverr = buildVoicePrompt({ channel: 'fiverr', source: 'fiverr' });
  assert.match(onFiverr, /Stay on Fiverr/);

  // Moved the chat to Instagram, which is the risk worth naming out loud.
  const offPlatform = buildVoicePrompt({ channel: 'instagram', source: 'fiverr' });
  assert.match(offPlatform, /came from Fiverr/);
  assert.match(offPlatform, /do not encourage it and do not quote or take payment elsewhere/);

  // Someone met on Instagram has no Fiverr restriction at all.
  const instagramLead = buildVoicePrompt({ channel: 'instagram', source: 'instagram' });
  assert.ok(!instagramLead.includes('came from Fiverr'));
});

test('the catalogue and its prices are in the prompt, and nothing outside it is offered', async () => {
  const { buildVoicePrompt } = await import('../lib/ai/voice.ts');
  const prompt = buildVoicePrompt({ channel: 'instagram' });

  assert.match(prompt, /the complete list of what he sells/);
  assert.match(prompt, /Full Shopify store build: \$80/);
  assert.match(prompt, /Product research, 3 to 5 vetted products with supplier links: \$20/);
  assert.match(prompt, /logo, two concepts with revisions: \$30/);
  assert.match(prompt, /WordPress site: quote after discovery/);
  assert.match(prompt, /never a number up front/);
  assert.match(prompt, /Never drop a price to close/);
  assert.match(prompt, /50% upfront/);
});

test('the Fiverr rule keeps payments on the platform', async () => {
  const { buildVoicePrompt } = await import('../lib/ai/voice.ts');
  const fiverr = buildVoicePrompt({ channel: 'fiverr' });
  assert.match(fiverr, /breaches Fiverr terms/);
  assert.match(fiverr, /Stay on Fiverr/);
});

test('the gold examples are shown but explicitly marked as not reusable', async () => {
  const { buildVoicePrompt, voiceExamples } = await import('../lib/ai/voice.ts');
  const prompt = buildVoicePrompt();

  assert.ok(voiceExamples().examples.length > 10, 'the approved set should be loaded');
  assert.match(prompt, /Do not reuse these words/);
  assert.match(prompt, /Copying an example/);

  // Real examples must actually appear, or the reference set is decorative.
  const first = voiceExamples().examples[0];
  assert.ok(first, 'the reference set is empty, which means the build is wrong');
  assert.ok(prompt.includes(first.text.slice(0, 40)), 'an example should be in the prompt');
});

test('the chasing the owner wants removed is shown as banned, not as an example', async () => {
  const { buildVoicePrompt, voiceExamples } = await import('../lib/ai/voice.ts');
  const prompt = buildVoicePrompt();
  const banned = voiceExamples().never_use;

  assert.ok(banned.length > 0, 'the archive has real chase lines to name');
  assert.match(prompt, /What he never wants sent again/);
  for (const line of banned) {
    assert.ok(prompt.includes(line), 'the banned line should be named in the prompt');
  }
});

test('every shipped example passes the guard itself', async () => {
  const { voiceExamples } = await import('../lib/ai/voice.ts');
  const { enforceStyle, findChasePhrases } = await import('../lib/ai/style-guard.ts');

  for (const example of voiceExamples().examples) {
    assert.equal(
      findChasePhrases(example.text).length,
      0,
      'a chase slipped into the reference set: ' + example.text.slice(0, 60),
    );
    const result = enforceStyle(example.text, { channel: 'instagram' });
    assert.equal(result.actions.dashesReplaced, 0, 'a dash slipped in: ' + example.text.slice(0, 60));
    assert.equal(
      result.actions.hasListMarkers,
      false,
      'a list slipped in: ' + example.text.slice(0, 60),
    );
  }
});

test('the archive statistics reach the prompt as numbers', async () => {
  const { buildVoicePrompt, voiceExamples } = await import('../lib/ai/voice.ts');
  const prompt = buildVoicePrompt();
  const stats = voiceExamples().stats;

  assert.ok(prompt.includes(String(stats.median_words_in_engaged_threads)));
  assert.match(prompt, /ask exactly one question/);
});

test('the context is keyed on the thread, so two clients cannot mix', async () => {
  const { assembleContext } = await import('../lib/ai/context.ts');

  const simon = assembleContext({
    client: { id: 'c1', name: 'Simon', stage: 'quoted' },
    thread: { id: 'thread-simon', title: 'Simon, Instagram' },
    messages: [
      { role: 'me', content: 'Store build is $199.99 all in.', sent_at: '2026-10-01T10:00:00Z' },
      { role: 'client', content: 'Can you do $150?', sent_at: '2026-10-02T10:00:00Z' },
    ],
  });

  assert.equal(simon.threadId, 'thread-simon');
  assert.ok(simon.text.includes('Can you do $150?'));
  assert.ok(!simon.text.includes('Michael'), 'another client must not appear');
  assert.equal(simon.awaitingMyReply, true);

  // Michael's thread, same shape, entirely separate content.
  const michael = assembleContext({
    client: { id: 'c2', name: 'Michael', stage: 'active' },
    thread: { id: 'thread-michael', title: 'Michael, Fiverr' },
    messages: [{ role: 'me', content: 'The logo files are uploaded.', sent_at: '2026-10-03T10:00:00Z' }],
  });

  assert.equal(michael.threadId, 'thread-michael');
  assert.ok(!michael.text.includes('$150'), 'Simon must not appear in Michael\'s prompt');
  assert.equal(michael.awaitingMyReply, false, 'the last message is Hamza\'s');
  assert.match(michael.text, /Do not chase/);
});

test('saved assistant drafts are excluded from conversation context and reply state', async () => {
  const { assembleContext } = await import('../lib/ai/context.ts');

  const context = assembleContext({
    client: { id: 'c1', name: 'Simon', stage: 'negotiating' },
    thread: { id: 't1' },
    messages: [
      { role: 'client', content: 'Can you do 150?', sent_at: '2026-10-02T10:00:00Z' },
      { role: 'assistant', content: 'I can reduce the price to 170.', sent_at: '2026-10-02T10:01:00Z' },
    ],
  });

  assert.match(context.text, /Can you do 150/);
  assert.doesNotMatch(context.text, /I can reduce the price to 170/);
  assert.equal(context.includedMessages, 1);
  assert.equal(context.awaitingMyReply, true, 'an unsent draft does not count as a sent reply');
});

test('history is trimmed from the oldest end, and the recent flow is kept in order', async () => {
  const { assembleContext } = await import('../lib/ai/context.ts');

  // Strictly increasing timestamps, so the test measures the ordering logic
  // rather than the fixture's own date wrapping.
  const messages = Array.from({ length: 30 }, (_, index) => ({
    role: index % 2 === 0 ? 'me' : 'client',
    content: `message ${index + 1}`,
    sent_at: new Date(Date.UTC(2026, 8, 1, 9, index)).toISOString(),
  }));

  const context = assembleContext({
    client: { id: 'c1', name: 'Simon' },
    thread: { id: 't1' },
    messages,
    historyLimit: 6,
  });

  assert.equal(context.includedMessages, 6);
  assert.equal(context.droppedMessages, 24);
  assert.match(context.text, /24 older messages left out for length/);

  // Oldest first, so the newest message sits closest to the instruction.
  const kept = ['message 25', 'message 26', 'message 27', 'message 28', 'message 29', 'message 30'];
  const positions: number[] = kept.map((label) => context.text.indexOf(label));
  assert.ok(
    positions.every((position) => position > -1),
    'the newest messages must be present. Got: ' + JSON.stringify(positions),
  );
  for (let i = 1; i < positions.length; i += 1) {
    const previous = positions[i - 1] ?? -1;
    const current = positions[i] ?? -1;
    assert.ok(current > previous, 'messages must read oldest to newest');
  }
  assert.ok(!context.text.includes('message 24'), 'the oldest messages are the ones dropped');
});

test('a pasted client message becomes the thing being replied to', async () => {
  const { assembleContext } = await import('../lib/ai/context.ts');

  const context = assembleContext({
    client: { id: 'c1', name: 'Simon', stage: 'negotiating', deal_value_estimate: 199.99, currency: 'USD' },
    thread: { id: 't1' },
    messages: [{ role: 'me', content: 'Here is the price.', sent_at: '2026-10-01T10:00:00Z' }],
    incoming: 'that is too expensive for me right now',
    channel: 'whatsapp',
  });

  assert.match(context.text, /What they just sent/);
  assert.match(context.text, /too expensive/);
  assert.match(context.text, /USD 199.99/, 'the deal value should be visible');
  assert.match(context.text, /Reply on: WhatsApp/);
});

test('client facts and projects are included when they exist', async () => {
  const { assembleContext } = await import('../lib/ai/context.ts');

  const context = assembleContext({
    client: { id: 'c1', name: 'Simon', stage: 'active' },
    thread: { id: 't1' },
    messages: [],
    facts: [{ key: 'budget', value: 'around $250', confidence: 'low' }],
    projects: [{ title: 'Shopify rebuild', status: 'active', next_step: 'send homepage draft' }],
  });

  assert.match(context.text, /budget: around \$250 \(uncertain\)/);
  assert.match(context.text, /Shopify rebuild/);
  assert.match(context.text, /next step: send homepage draft/);
  assert.match(context.text, /No messages stored yet/, 'an empty thread says so plainly');
});
