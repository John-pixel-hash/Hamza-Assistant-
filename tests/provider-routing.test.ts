import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * The router is tested without touching the network or the database.
 *
 * What matters is that a bad row cannot route to a model that costs money, and
 * that an unknown task still gets a sensible model. Those are the two ways this
 * file could quietly become expensive or broken.
 */

test('every task has a default that is on the free tier allow list', async () => {
  const provider = await import('../lib/ai/routing.ts');
  for (const [task, route] of Object.entries(provider.DEFAULT_ROUTING)) {
    assert.ok(
      provider.isAllowed(route.provider, route.modelId),
      `${task} routes to ${route.provider}:${route.modelId}, which is not allowed`,
    );
  }
});

test('a paid or unknown model in the database cannot be routed to', async () => {
  const provider = await import('../lib/ai/routing.ts');
  const rows = [
    { task: 'reply_draft', provider: 'google', modelId: 'gemini-3.1-pro-preview' },
    { task: 'plan', provider: 'anthropic', modelId: 'claude-opus-5-5' },
  ].map((r) => ({ task: r.task, provider: r.provider, model_id: r.modelId }));

  const reply = provider.resolveTask('reply_draft', rows);
  assert.equal(reply.modelId, 'gemini-3.5-flash', 'pro is not allowed, so seed default wins');
  assert.equal(reply.fellBack, true);
  assert.match(reply.reason, /allow list/);

  const plan = provider.resolveTask('plan', rows);
  assert.equal(plan.provider, 'google');
  assert.equal(plan.fellBack, true);
});

test('a valid row is honoured', async () => {
  const provider = await import('../lib/ai/routing.ts');
  const rows = [{ task: 'reply_draft', provider: 'google', model_id: 'gemini-3.1-flash-lite' }];
  const resolved = provider.resolveTask('reply_draft', rows);
  assert.equal(resolved.modelId, 'gemini-3.1-flash-lite');
  assert.equal(resolved.fellBack, false);
  assert.equal(resolved.reason, 'task_routing');
});

test('no rows at all falls back to the seed defaults', async () => {
  const provider = await import('../lib/ai/routing.ts');
  const resolved = provider.resolveTask('reply_draft', []);
  assert.equal(resolved.provider, 'google');
  assert.equal(resolved.modelId, 'gemini-3.5-flash');
  assert.equal(resolved.fellBack, false);
});

test('the free tier decision is explicit, not accidental', async () => {
  const provider = await import('../lib/ai/routing.ts');
  const before = process.env.ENABLE_AI_BILLING;
  delete process.env.ENABLE_AI_BILLING;
  assert.equal(provider.billingEnabled(), false);
  process.env.ENABLE_AI_BILLING = 'TRUE';
  assert.equal(provider.billingEnabled(), true, 'the same tolerant flag reading as ALLOW_SIGNUP');
  if (before === undefined) delete process.env.ENABLE_AI_BILLING;
  else process.env.ENABLE_AI_BILLING = before;
});

test('an unknown price records as unknown, not as zero', async () => {
  const telemetry = await import('../lib/ai/routing.ts');
  // There is no price table yet, so nothing may claim a cost it cannot know.
  assert.equal(telemetry.estimateCostUsd('google', 'gemini-3.5-flash', 1000, 500), null);
});
