import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVisionPrompt, parseVisionJson } from '../lib/ai/vision-core.ts';

test('parseVisionJson maps a clean single-image payload', () => {
  const extraction = parseVisionJson(
    JSON.stringify({
      platform: 'Instagram',
      client_name: 'Fahad Khan',
      messages: [
        { role: 'client', text: 'hi how much for a shopify store' },
        { role: 'me', text: 'depends on the scope' },
        { role: 'sideways', text: 'dropped, bad role' },
        { role: 'client', text: '   ' },
      ],
      tone: 'casual',
    }),
  );
  assert.ok(extraction);
  assert.equal(extraction.platform, 'instagram');
  assert.equal(extraction.clientName, 'Fahad Khan');
  assert.equal(extraction.messages.length, 2);
  assert.deepEqual(extraction.messages[0]?.screenshotIndices, [0]);
  assert.deepEqual(extraction.messages[1]?.screenshotIndices, [0]);
  assert.equal(extraction.tone, 'casual');
});

test('the screenshot reader recognises TikTok as a supported platform', () => {
  assert.match(buildVisionPrompt(1), /instagram\|tiktok\|call/);
  const extraction = parseVisionJson(
    JSON.stringify({ platform: 'tiktok', client_name: 'A client', messages: [{ role: 'client', text: 'Hi' }] }),
  );
  assert.equal(extraction?.platform, 'tiktok');
});

test('parseVisionJson tolerates fences and prose around the JSON', () => {
  const extraction = parseVisionJson(
    'Here you go: ```json {"platform":"whatsapp","client_name":null,"messages":[{"role":"client","text":"salam"}],"tone":null} ```',
  );
  assert.ok(extraction);
  assert.equal(extraction.platform, 'whatsapp');
  assert.equal(extraction.clientName, null);
  assert.equal(extraction.messages.length, 1);
  assert.deepEqual(extraction.messages[0]?.screenshotIndices, [0]);
});

test('parseVisionJson maps screenshot sources from one-based model indices', () => {
  const extraction = parseVisionJson(
    JSON.stringify({
      platform: 'instagram',
      client_name: 'A client',
      messages: [
        { role: 'client', text: 'Hi', screenshot_indices: [1, 2, 2] },
        { role: 'me', text: 'Hello', screenshot_indices: [3] },
        { role: 'client', text: 'Partly invalid source', screenshot_indices: [1, 4] },
      ],
      tone: null,
    }),
    3,
  );
  assert.ok(extraction);
  assert.deepEqual(extraction.messages.map((message) => message.screenshotIndices), [[0, 1], [2], [0]]);
});

test('multi-image extraction rejects messages without trustworthy screenshot sources', () => {
  const payload = JSON.stringify({
    platform: 'whatsapp',
    client_name: 'Client',
    messages: [{ role: 'client', text: 'Hello' }],
    tone: null,
  });
  assert.equal(parseVisionJson(payload, 2), null);
});

test('the batch prompt tells vision to deduplicate overlap and keep sources', () => {
  const prompt = buildVisionPrompt(4);
  assert.match(prompt, /4 screenshots from the same conversation/i);
  assert.match(prompt, /overlapping screenshots/i);
  assert.match(prompt, /screenshot indices are 1-based/i);
});

test('parseVisionJson refuses a payload with nothing readable', () => {
  assert.equal(parseVisionJson('not json at all'), null);
  assert.equal(parseVisionJson('{"platform":"unknown","client_name":null,"messages":[]}'), null);
});
