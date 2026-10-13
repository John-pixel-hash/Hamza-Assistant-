import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyDraftError,
  draftFailureMessage,
  isRetryableDraftError,
} from '../lib/ai/draft-errors.ts';

test('quota errors are retried on another free model', () => {
  const error = { statusCode: 429, message: 'rate limited' };
  assert.equal(classifyDraftError(error), 'quota');
  assert.equal(isRetryableDraftError(error), true);
  assert.match(draftFailureMessage(error), /free AI models are busy/i);
});

test('wrapped 503 errors are recognized as transient', () => {
  const error = {
    name: 'APICallError',
    cause: { status: '503', message: 'service unavailable' },
  };
  assert.equal(classifyDraftError(error), 'temporary');
  assert.equal(isRetryableDraftError(error), true);
});

test('provider timeouts are retried and get a clear message if the chain fails', () => {
  const error = Object.assign(new Error('The operation was aborted due to timeout'), {
    name: 'TimeoutError',
  });
  assert.equal(classifyDraftError(error), 'timeout');
  assert.equal(isRetryableDraftError(error), true);
  assert.equal(
    draftFailureMessage(error),
    'The draft took too long to finish. Nothing was saved. Please try again.',
  );
});

test('network failures are retried but permanent request errors are not', () => {
  assert.equal(classifyDraftError(new TypeError('fetch failed')), 'temporary');
  assert.equal(isRetryableDraftError(new TypeError('fetch failed')), true);
  assert.equal(classifyDraftError({ statusCode: 400, message: 'invalid request' }), 'unknown');
  assert.equal(isRetryableDraftError({ statusCode: 400, message: 'invalid request' }), false);
});
