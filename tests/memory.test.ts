import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMemoryPrompt,
  parseFacts,
  planFactWrites,
  CONFIDENCE_VALUE,
  type ExistingFact,
} from '../lib/ai/memory.ts';

test('parseFacts reads a clean array', () => {
  const facts = parseFacts('[{"key": "country", "value": "Pakistan", "confidence": "high"}]');
  assert.equal(facts.length, 1);
  assert.deepEqual(facts.at(0), { key: 'country', value: 'Pakistan', confidence: 'high' });
});

test('parseFacts tolerates fences and padding', () => {
  const facts = parseFacts(
    'Here you go:\n```json\n[{"key": "Budget", "value": "7000 Rs", "confidence": "medium"}]\n```',
  );
  assert.equal(facts.length, 1);
  const [first] = facts;
  assert.ok(first);
  assert.equal(first.key, 'budget');
  assert.equal(first.confidence, 'medium');
});

test('parseFacts drops guesses of shape, keeps the rest', () => {
  const facts = parseFacts(
    '[{"key": "x", "value": "too short key"}, {"key": "niche", "value": 5}, {"key": "niche_2", "value": "streetwear"}]',
  );
  assert.deepEqual(
    facts.map((f) => f.key),
    ['niche_2'],
  );
});

test('parseFacts returns empty on garbage', () => {
  assert.deepEqual(parseFacts('no json here'), []);
  assert.deepEqual(parseFacts('[{"key": "country", "value": "Pakistan"'), []);
  assert.deepEqual(parseFacts(''), []);
});

test('parseFacts caps at eight facts and dedupes keys', () => {
  const ten = Array.from({ length: 10 }, (_, i) => ({
    key: `fact_${i}`,
    value: `value ${i}`,
    confidence: 'high',
  }));
  ten.push({ key: 'fact_0', value: 'later value', confidence: 'high' });
  const facts = parseFacts(JSON.stringify(ten));
  assert.ok(facts.length <= 8);
  assert.equal(facts.find((f) => f.key === 'fact_0')?.value, 'later value');
});

test('pinned facts are never touched', () => {
  const existing: ExistingFact[] = [
    { id: 'a', key: 'budget', value: '500', confidence: 0.9, is_pinned: true },
  ];
  const plan = planFactWrites(existing, [
    { key: 'budget', value: '9000', confidence: 'high' },
  ]);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.inserts.length, 0);
});

test('a weaker read cannot clobber a stronger stored fact', () => {
  const existing: ExistingFact[] = [
    { id: 'a', key: 'country', value: 'Guyana', confidence: 0.9, is_pinned: false },
  ];
  const plan = planFactWrites(existing, [
    { key: 'country', value: 'somewhere in south america', confidence: 'medium' },
  ]);
  assert.equal(plan.updates.length, 0);
});

test('an equal or stronger read updates, a new key inserts', () => {
  const existing: ExistingFact[] = [
    { id: 'a', key: 'country', value: 'Guyana', confidence: 0.6, is_pinned: false },
  ];
  const plan = planFactWrites(existing, [
    { key: 'country', value: 'Guyana, going worldwide', confidence: 'high' },
    { key: 'store_url', value: 'epicwearsco.myshopify.com', confidence: 'high' },
  ]);
  assert.equal(plan.updates.length, 1);
  const [update] = plan.updates;
  assert.ok(update);
  assert.equal(update.confidence, CONFIDENCE_VALUE.high);
  assert.equal(plan.inserts.length, 1);
});

test('re-extracting the same value is a no-op', () => {
  const existing: ExistingFact[] = [
    { id: 'a', key: 'country', value: 'Guyana', confidence: 0.9, is_pinned: false },
  ];
  const plan = planFactWrites(existing, [
    { key: 'country', value: 'Guyana', confidence: 'high' },
  ]);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.inserts.length, 0);
});

test('the prompt states the no-guessing rule and carries the slice', () => {
  const prompt = buildMemoryPrompt([
    { role: 'client', content: 'I am in Pakistan and my budget is 7000 Rs' },
  ]);
  assert.match(prompt, /Never infer, never guess/);
  assert.match(prompt, /I am in Pakistan/);
});
