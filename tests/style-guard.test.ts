/**
 * Tests for the guardrail that runs on every draft in Phase 3.
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  countWords,
  enforceStyle,
  enforceStyleWithTelemetry,
  findFiller,
  stripDashes,
  stripFillerOpening,
} from '../lib/ai/style-guard.ts';

const EM = '\u2014';
const EN = '\u2013';

test('a dash becomes a sentence break or a comma, never a dash', () => {
  const sentence = stripDashes(`The build is ready ${EM} I need the deposit to start.`);
  assert.equal(sentence.replaced, 1);
  assert.equal(sentence.text, 'The build is ready. I need the deposit to start.');
  assert.ok(!sentence.text.includes(EM));

  const clause = stripDashes(`Two options ${EM} both work for you.`);
  assert.ok(!clause.text.includes(EM));
  assert.equal(clause.text, 'Two options, both work for you.');

  // The same judgement applies when the dash was pasted with no spaces at all.
  const jammed = stripDashes(`The build is ready${EM}I need the deposit to start.`);
  assert.equal(jammed.text, 'The build is ready. I need the deposit to start.');
});

test('ranges keep a plain hyphen, which is what they should have been', () => {
  assert.equal(stripDashes(`Delivery in 10${EN}12 days.`).text, 'Delivery in 10-12 days.');
  assert.equal(stripDashes(`2020${EM}2024`).text, '2020-2024');
});

test('a jammed dash between words is still removed', () => {
  const result = stripDashes(`Ready${EM}tomorrow morning.`);
  assert.equal(result.text, 'Ready, tomorrow morning.');
  assert.equal(result.replaced, 1);
});

test('every kind of dash is caught, including the ones people paste by accident', () => {
  const nasty = `a ${EM} b, c ${EN} d, e \u2015 f, g \u2212 h`;
  const result = stripDashes(nasty);
  assert.ok(!/[\u2013\u2014\u2015\u2212]/.test(result.text), result.text);
  assert.ok(result.replaced >= 4);
});

test('punctuation left behind by a removal is tidied up', () => {
  const result = stripDashes(`Thanks for the update ${EM} , I will start Monday.`);
  assert.equal(result.text, 'Thanks for the update, I will start Monday.');
  assert.ok(!result.text.includes('  '), 'no double spaces');
  assert.ok(!/\s[.,!?]/.test(result.text), 'no space left before punctuation');
});

test('filler openings are removed and the sentence is still correct', () => {
  const result = stripFillerOpening('I hope this email finds you well. Your store is ready.');
  assert.equal(result.removed, 1);
  assert.equal(result.text, 'Your store is ready.');
});

test('a filler phrase in the middle is reported but not butchered', () => {
  const text = 'The plan is to circle back with the client once tracking is live.';
  assert.deepEqual(findFiller(text), ['circle back']);
  // Only openings are removed automatically. Mid sentence edits need judgement.
  assert.equal(stripFillerOpening(text).text, text);
});

test('corporate padding is detected', () => {
  assert.deepEqual(findFiller('We can leverage the existing audience.'), ['leverage the']);
  assert.deepEqual(findFiller('The store loads fast.'), []);
});

test('length budgets flag a message that is too long for its channel', () => {
  const short = enforceStyle('Your store is live. I will send the login now.', { channel: 'whatsapp' });
  assert.equal(short.actions.lengthOk, true);
  assert.equal(short.actions.overBudgetBy, 0);

  const long = enforceStyle('word '.repeat(300), { channel: 'whatsapp' });
  assert.equal(long.actions.lengthOk, false);
  assert.ok(long.actions.overBudgetBy > 0);
});

test('the full pass cleans a realistic generated draft', () => {
  const draft =
    `Thanks for reaching out! I reviewed your store ${EM} and the checkout flow has two problems. ` +
    `I hope this email finds you well. We can fix both in 3${EN}4 days.`;

  const result = enforceStyleWithTelemetry(draft, { channel: 'email' });

  assert.ok(!/[\u2013\u2014]/.test(result.text), result.text);
  assert.ok(!/thanks for reaching out/i.test(result.text));
  assert.ok(result.actions.dashesReplaced >= 2, 'telemetry counts what was caught');
  assert.ok(result.actions.words > 0);
  assert.ok(result.actions.lengthOk);
});

test('telemetry counts dashes even when the surrounding text is removed', () => {
  const result = enforceStyleWithTelemetry(`I hope this finds you well ${EM} here is the plan.`);
  assert.equal(result.actions.dashesReplaced, 1);
});

test('clean text passes through untouched', () => {
  const clean = 'The store is ready for testing. Send me the product photos and I will publish it today.';
  const result = enforceStyle(clean, { channel: 'fiverr' });
  assert.equal(result.text, clean);
  assert.equal(result.actions.dashesReplaced, 0);
  assert.equal(result.actions.fillerRemoved, 0);
});

test('word counting is stable on edge cases', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
  assert.equal(countWords('one two three'), 3);
  assert.equal(countWords('line one\nline two'), 4);
});

// ------------------------------------------ chase, questions, lists -------

test('chase messages are caught, since they measurably underperform', async () => {
  const { enforceStyle, findChasePhrases } = await import('../lib/ai/style-guard.ts');

  // In the user's real archive these got a 5% reply rate against 10% overall.
  const chase = 'Hey, just checking in, did you get a chance to look at my last message?';
  assert.ok(findChasePhrases(chase).length > 0);

  const result = enforceStyle(chase, { channel: 'instagram' });
  assert.ok(
    result.actions.chasePhrases.length > 0,
    'a chase must be reported so the draft can be rewritten',
  );

  // A follow up that carries something new is not a chase and must pass.
  const useful =
    'Saw your store still has no reviews showing. That is usually the first thing a new buyer looks for.';
  assert.deepEqual(enforceStyle(useful, { channel: 'instagram' }).actions.chasePhrases, []);
});

test('the one question rule is enforced', async () => {
  const { countQuestions, enforceStyle } = await import('../lib/ai/style-guard.ts');

  assert.equal(countQuestions('How is it going?'), 1);
  assert.equal(countQuestions('No question here.'), 0);
  assert.equal(countQuestions('Are you running ads? Or organic?'), 2);

  // The user's guide allows exactly one follow up question per reply.
  const two = enforceStyle('Are you running ads? Or organic only?', { channel: 'instagram' });
  assert.equal(two.actions.questions, 2);
  assert.equal(two.actions.overQuestioned, true);

  const one = enforceStyle('Are you running ads or organic?', { channel: 'instagram' });
  assert.equal(one.actions.overQuestioned, false);
});

test('lists are rejected in chat messages but a price line is not a list', async () => {
  const { hasListMarkers, enforceStyle } = await import('../lib/ai/style-guard.ts');

  assert.equal(hasListMarkers('- Store build\n- Product research'), true);
  assert.equal(hasListMarkers('1. Store build\n2. Product research'), true);
  assert.equal(hasListMarkers('Here is the price. 1. $80 total.'), false);
  assert.equal(hasListMarkers('The store is $80 all in and that includes everything.'), false);

  const draft = enforceStyle('What you get:\n- store\n- research\n- ads', { channel: 'fiverr' });
  assert.equal(draft.actions.hasListMarkers, true);
});

test('a clean message passes every new check', async () => {
  const { enforceStyle } = await import('../lib/ai/style-guard.ts');

  const good =
    'The store looks solid on the surface, but there are no reviews showing anywhere. ' +
    'That is usually the first thing a new buyer checks before they trust a brand. ' +
    'Want me to list what else stood out?';

  const result = enforceStyle(good, { channel: 'instagram' });
  assert.deepEqual(result.actions.chasePhrases, []);
  assert.deepEqual(result.actions.bannedOpeners, []);
  assert.equal(result.actions.hasListMarkers, false);
  assert.equal(result.actions.overQuestioned, false);
});
