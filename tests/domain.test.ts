/**
 * Tests for the pure logic behind the client hub.
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normaliseTags, parseDealValue, validateClientForm, validateMessageForm } from '../lib/validation/client.ts';
import { formatMoney, humaniseInterval, preview, splitHighlights } from '../lib/text/snippet.ts';

// ---------------------------------------------------------------- money -----

test('deal values are read the way people actually type them', () => {
  assert.equal(parseDealValue('1500'), 150_000);
  assert.equal(parseDealValue('1,500'), 150_000);
  assert.equal(parseDealValue('$1,500'), 150_000);
  assert.equal(parseDealValue('1500 usd'), 150_000);
  assert.equal(parseDealValue('1.5k'), 150_000);
  assert.equal(parseDealValue('12k'), 1_200_000);
  assert.equal(parseDealValue('2.5m'), 250_000_000);
  assert.equal(parseDealValue('999.99'), 99_999);
});

test('blank deal values are allowed, nonsense is refused', () => {
  assert.equal(parseDealValue(''), null);
  assert.equal(parseDealValue('   '), null);
  assert.equal(parseDealValue(null), null);
  assert.ok(Number.isNaN(parseDealValue('about five hundred')));
  assert.ok(Number.isNaN(parseDealValue('-200')));
  assert.ok(Number.isNaN(parseDealValue('15k extra')));
});

test('money is stored in minor units and shown back cleanly', () => {
  // en-GB renders the US dollar with its country prefix, which avoids confusion
  // when a client quotes a different dollar.
  assert.equal(formatMoney(150_000, 'USD'), 'US$1,500');
  assert.equal(formatMoney(99_999, 'USD'), 'US$999.99');
  assert.equal(formatMoney(null, 'USD'), null);
  assert.match(formatMoney(150_000, 'NGN') ?? '', /1,500/);
});

// ----------------------------------------------------------------- tags -----

test('tags are cleaned, deduplicated and bounded', () => {
  assert.deepEqual(normaliseTags('Shopify, urgent , shopify'), ['shopify', 'urgent']);
  assert.deepEqual(normaliseTags(''), []);
  assert.deepEqual(normaliseTags(null), []);
  assert.equal(normaliseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(',')).length, 20);
});

// ------------------------------------------------------------- client form --

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

test('a client needs a real name', () => {
  const missing = validateClientForm(form({ name: '' }));
  assert.equal(missing.ok, false);

  const tooShort = validateClientForm(form({ name: 'a' }));
  assert.equal(tooShort.ok, false);

  const good = validateClientForm(form({ name: 'Bakare Interiors' }));
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.values.name, 'Bakare Interiors');
    assert.equal(good.values.stage, 'lead');
    assert.equal(good.values.currency, 'USD');
  }
});

test('unknown stages are refused rather than silently stored', () => {
  const result = validateClientForm(form({ name: 'Tunde', stage: 'almost_won' }));
  assert.equal(result.ok, false);
});

test('a full client form round trips', () => {
  const result = validateClientForm(
    form({
      name: 'Tunde Bakare',
      company: 'Bakare Interiors',
      stage: 'negotiating',
      source: 'fiverr',
      channel: 'whatsapp',
      country: 'Lagos',
      deal_value: '1.5k',
      currency: 'usd',
      tags: 'shopify, urgent',
      notes: 'Wants delivery before December.',
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.values.dealValueMinor, 150_000);
  assert.equal(result.values.currency, 'USD');
  assert.deepEqual(result.values.tags, ['shopify', 'urgent']);
  assert.equal(result.values.notes, 'Wants delivery before December.');
  assert.equal(result.values.company, 'Bakare Interiors');
});

test('empty optional fields become null, not empty strings', () => {
  const result = validateClientForm(form({ name: 'Tunde Bakare', company: '   ', notes: '' }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.values.company, null);
    assert.equal(result.values.notes, null);
  }
});

// ------------------------------------------------------------ message form --

test('a message needs content and a known type', () => {
  assert.equal(validateMessageForm(form({ content: '' })).ok, false);
  assert.equal(validateMessageForm(form({ content: 'Hello', role: 'robot' })).ok, false);

  const good = validateMessageForm(form({ content: 'Can you do 800?', role: 'client', channel: 'fiverr' }));
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.values.role, 'client');
    assert.equal(good.values.channel, 'fiverr');
  }
});

test('a note does not need a channel and defaults to client type', () => {
  const result = validateMessageForm(form({ content: 'He sounded unsure about budget.' }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.values.role, 'client');
    assert.equal(result.values.channel, null);
  }
});

test('absurdly long messages are refused with a clear reason', () => {
  const result = validateMessageForm(form({ content: 'x'.repeat(20_001) }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /split/i);
});

// --------------------------------------------------------------- snippets ---

test('highlight markers split into safe segments', () => {
  const segments = splitHighlights('He asked about [[[pricing]]] again today');
  assert.deepEqual(segments, [
    { text: 'He asked about ', marked: false },
    { text: 'pricing', marked: true },
    { text: ' again today', marked: false },
  ]);
});

test('unbalanced or empty markers never lose text', () => {
  assert.deepEqual(splitHighlights(''), []);
  assert.deepEqual(splitHighlights('plain text'), [{ text: 'plain text', marked: false }]);
  assert.deepEqual(splitHighlights('dangling [[[ open'), [{ text: 'dangling [[[ open', marked: false }]);
  const adjacent = splitHighlights('[[[one]]][[[two]]]');
  assert.equal(adjacent.map((s) => s.text).join(''), 'onetwo');
  assert.ok(adjacent.every((s) => s.marked));
});

test('html in a client message stays text, it is never interpreted', () => {
  const hostile = 'He said <script>alert(1)</script> about [[[pricing]]]';
  const segments = splitHighlights(hostile);
  const rejoined = segments.map((s) => s.text).join('');
  assert.ok(rejoined.includes('<script>alert(1)</script>'));
  // The segments carry raw text only. React escapes it at render time, so no
  // marker in a snippet can ever become markup.
  assert.equal(segments.some((s) => s.text.includes('<mark>')), false);
});

test('message previews cut on a word boundary', () => {
  assert.equal(preview('short message', 50), 'short message');
  assert.equal(preview(null, 50), '');
  const long = 'word '.repeat(60);
  const cut = preview(long, 50);
  assert.ok(cut.length <= 54);
  assert.ok(cut.endsWith('...'));
});

test('time gaps read like a person would say them', () => {
  assert.equal(humaniseInterval('0 days 02:00:00'), 'today');
  assert.equal(humaniseInterval('1 days 02:00:00'), 'yesterday');
  assert.equal(humaniseInterval('3 days 05:00:00'), '3 days ago');
  assert.equal(humaniseInterval('9 days 05:00:00'), '1 week ago');
  assert.equal(humaniseInterval('21 days 05:00:00'), '3 weeks ago');
  assert.equal(humaniseInterval(null), '');
});

// ---------------------------------------------------------------- stages ----

test('every stage has a label and a place in the pipeline', async () => {
  const { ENGAGED_STAGES, STAGES, STAGE_LABELS, isStage } = await import('../lib/domain.ts');

  for (const stage of STAGES) {
    assert.ok(STAGE_LABELS[stage], `stage ${stage} has no label, it would render blank`);
  }

  // Outreach is a stage you chose to be in, not a result. It must stay out of
  // the set the app treats as a live conversation.
  assert.ok(STAGES.includes('outreach'));
  assert.ok(isStage('outreach'));
  assert.ok(!ENGAGED_STAGES.includes('outreach'));
  assert.equal(ENGAGED_STAGES.length, STAGES.length - 2);

  for (const stage of ENGAGED_STAGES) {
    assert.ok(isStage(stage), `engaged stage ${stage} is not a real stage`);
  }
});

test('follow up labels cover every state the database can return', async () => {
  const { FOLLOWUP_LABELS } = await import('../lib/domain.ts');

  // These are the exact values pending_followups produces in 0004.
  for (const state of ['no_reply_yet', 'follow_up_overdue', 'nudge', 'check_in', 'ok']) {
    assert.ok(FOLLOWUP_LABELS[state], `follow up state ${state} would render as its raw name`);
  }
});
