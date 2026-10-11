import assert from 'node:assert/strict';
import test from 'node:test';

import { parseVisionJson } from '../lib/ai/vision-core.ts';

test('parseVisionJson maps a clean payload', () => {
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
  assert.equal(extraction.tone, 'casual');
});

test('parseVisionJson tolerates fences and prose around the JSON', () => {
  const extraction = parseVisionJson(
    'Here you go: ```json {"platform":"whatsapp","client_name":null,"messages":[{"role":"client","text":"salam"}],"tone":null} ```',
  );
  assert.ok(extraction);
  assert.equal(extraction.platform, 'whatsapp');
  assert.equal(extraction.clientName, null);
  assert.equal(extraction.messages.length, 1);
});

test('parseVisionJson refuses a payload with nothing readable', () => {
  assert.equal(parseVisionJson('not json at all'), null);
  assert.equal(parseVisionJson('{"platform":"unknown","client_name":null,"messages":[]}'), null);
});
