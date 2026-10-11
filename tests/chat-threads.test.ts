import assert from 'node:assert/strict';
import test from 'node:test';

import { dedupeKey, normaliseContent, pickThread } from '../lib/chat/threads.ts';

test('normaliseContent folds case and whitespace', () => {
  assert.equal(normaliseContent('  Salam,  I need a STORE '), 'salam, i need a store');
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
