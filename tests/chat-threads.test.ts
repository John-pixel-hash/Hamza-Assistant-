import assert from 'node:assert/strict';
import test from 'node:test';

import { dedupeKey, isLatestClientMessage, normaliseClientName, normaliseContent, pickThread } from '../lib/chat/threads.ts';

test('normaliseContent folds case and whitespace', () => {
  assert.equal(normaliseContent('  Salam,  I need a STORE '), 'salam, i need a store');
});

test('client names from screenshot OCR match despite accents and punctuation', () => {
  assert.equal(normaliseClientName("Cash'mére Roziers"), normaliseClientName('Cash’mere Roziers'));
  assert.ok(normaliseClientName("Cash'mére Roziers").includes(normaliseClientName('Cash’mér')));
  assert.equal(normaliseClientName('نُور الحسن'), normaliseClientName('نور الحسن'));
});

test('a pasted inbound message is already saved only when it is the latest conversation message', () => {
  const messages = [
    { role: 'client', content: 'Cards are working well.' },
    { role: 'me', content: 'Good to hear. Are you getting enquiries?' },
    { role: 'assistant', content: 'Saved draft only, not sent.' },
  ];
  assert.equal(isLatestClientMessage(messages, 'Cards are working well.'), false);

  messages.push({ role: 'client', content: 'We have a few new enquiries.' });
  messages.push({ role: 'assistant', content: 'Unsent reply draft.' });
  assert.equal(isLatestClientMessage(messages, 'We have a few new enquiries.'), true);
  assert.equal(isLatestClientMessage(messages, 'A different new message.'), false);
});

test('pickThread prefers the freshest thread on the same platform', () => {
  const threads = [
    { id: 'new', title: 'Instagram: saramalik', channel: 'instagram' },
    { id: 'old', title: 'Instagram chat', channel: 'instagram' },
    { id: 'wa', title: 'WhatsApp chat', channel: 'whatsapp' },
  ];
  assert.equal(pickThread(threads, 'instagram')?.id, 'new');
  assert.equal(pickThread(threads, 'whatsapp')?.id, 'wa');
});

test('pickThread creates fresh when the platform has no thread', () => {
  const threads = [{ id: 'ig', title: 'Instagram: x', channel: 'instagram' }];
  assert.equal(pickThread(threads, 'whatsapp'), null);
});

test('pickThread lets one channel-less thread adopt the conversation', () => {
  const threads = [{ id: 'solo', title: 'Old import', channel: null }];
  assert.equal(pickThread(threads, 'instagram')?.id, 'solo');
  const two = [
    { id: 'solo', title: 'Old import', channel: null },
    { id: 'b', title: 'Other', channel: null },
  ];
  assert.equal(pickThread(two, 'instagram'), null);
});

test('dedupeKey matches same speaker same words', () => {
  assert.equal(dedupeKey('client', 'hi  there'), dedupeKey('client', 'HI THERE'));
  assert.notEqual(dedupeKey('client', 'hi there'), dedupeKey('me', 'hi there'));
});
