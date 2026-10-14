import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_CHAT_BATCH_BYTES,
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_SCREENSHOTS,
  mergeOverlappingMessages,
  moveScreenshotAt,
  parseChatScreenshotUploads,
} from '../lib/chat/capture-core.ts';


test('the capture limit is ten ordered screenshots', () => {
  assert.equal(MAX_CHAT_SCREENSHOTS, 10);
  assert.equal(MAX_CHAT_IMAGE_BYTES, 8 * 1024 * 1024);
  assert.equal(MAX_CHAT_BATCH_BYTES, 12 * 1024 * 1024);
  const ten = Array.from({ length: 10 }, (_, index) => ({
    path: `owner/chat/${index}.png`,
    name: `capture-${index}.png`,
  }));
  assert.equal(parseChatScreenshotUploads(JSON.stringify(ten)).uploads.length, 10);
  assert.match(parseChatScreenshotUploads(JSON.stringify([...ten, {
    path: 'owner/chat/extra.png',
    name: 'extra.png',
  }])).error ?? '', /no more than 10/i);
});

test('selected screenshots can be moved earlier or later without changing the others', () => {
  const images = ['first', 'second', 'third'];
  assert.deepEqual(moveScreenshotAt(images, 0, 1), ['second', 'first', 'third']);
  assert.deepEqual(moveScreenshotAt(images, 2, -1), ['first', 'third', 'second']);
  assert.deepEqual(moveScreenshotAt(images, 0, -1), images);
});

test('screenshot upload manifests are parsed and validated', () => {
  assert.match(parseChatScreenshotUploads('not json').error ?? '', /invalid/i);
  assert.match(parseChatScreenshotUploads('[]').error ?? '', /at least one/i);
  assert.match(parseChatScreenshotUploads(JSON.stringify([{ path: '', name: 'image.png' }])).error ?? '', /invalid/i);

  const parsed = parseChatScreenshotUploads(JSON.stringify([
    { path: 'owner/chat/one.png', name: 'one.png' },
    { path: 'owner/chat/one.png', name: 'duplicate.png' },
    { path: 'owner/chat/two.png', name: 'two.png' },
  ]));
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.uploads, [
    { path: 'owner/chat/one.png', name: 'one.png' },
    { path: 'owner/chat/two.png', name: 'two.png' },
  ]);
});

test('repeated text in one screenshot stays as separate messages', () => {
  const result = mergeOverlappingMessages([
    { role: 'client', text: 'Okay', screenshotIndices: [0] },
    { role: 'client', text: 'Okay', screenshotIndices: [0] },
  ]);
  assert.equal(result.length, 2);
  const separated = mergeOverlappingMessages([
    { role: 'client', text: 'Okay', screenshotIndices: [0] },
    { role: 'client', text: 'Okay', screenshotIndices: [2] },
  ]);
  assert.equal(separated.length, 2);
});

test('overlapping screenshots merge repeated bubbles and retain both sources', () => {
  const result = mergeOverlappingMessages([
    { role: 'client', text: '  Can you send the price? ', screenshotIndices: [0] },
    { role: 'me', text: 'Yes, I will send it today.', screenshotIndices: [0] },
    { role: 'client', text: 'can you send the PRICE?', screenshotIndices: [1] },
    { role: 'client', text: 'What is the timeline?', screenshotIndices: [1] },
  ]);

  assert.equal(result.length, 3);
  assert.deepEqual(result[0], {
    role: 'client',
    text: 'Can you send the price?',
    screenshotIndices: [0, 1],
  });
  assert.deepEqual(result[1]?.screenshotIndices, [0]);
  assert.equal(result[2]?.text, 'What is the timeline?');
});
