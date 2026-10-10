import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseTone, toneScorePrompt, TONE_VALUES } from '../lib/ai/tone.ts';

test('parseTone accepts the bare word', () => {
  for (const value of TONE_VALUES) {
    if (value === 'unknown') continue;
    assert.equal(parseTone(value), value);
  }
});

test('parseTone tolerates punctuation and casing', () => {
  assert.equal(parseTone('Formal.'), 'formal');
  assert.equal(parseTone('CASUAL'), 'casual');
  assert.equal(parseTone('warm, with thanks'), 'warm');
});

test('parseTone falls back to unknown', () => {
  assert.equal(parseTone(''), 'unknown');
  assert.equal(parseTone('I cannot say'), 'unknown');
});

test('the more specific read wins when two tones appear', () => {
  assert.equal(parseTone('short and direct'), 'direct');
  assert.equal(parseTone('a detailed breakdown, short version'), 'detailed');
});

test('the prompt bounds the answer and carries the message', () => {
  const prompt = toneScorePrompt('hey bro can you do 150?');
  assert.match(prompt, /exactly one word/);
  assert.match(prompt, /hey bro can you do 150\?/);
});

test('the prompt truncates very long messages', () => {
  const prompt = toneScorePrompt('x'.repeat(5000));
  assert.ok(prompt.length < 2200);
});
