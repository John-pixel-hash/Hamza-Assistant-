import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateResearchQueries,
  parsePlanPayload,
  parseQueriesPayload,
  runPlanner,
} from '../lib/ai/planner.ts';

// The engines read the key before touching the network. Tests inject every
// fetch, so a dummy key only opens the door.
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';

const ALLOWED = ['https://research.example/tracking', 'https://research.example/pricing'];

function planPayload(overrides: Record<string, unknown> = {}) {
  const step = {
    title: 'Install the pixel and test one purchase event end to end',
    detail: 'Fire a test purchase and see it land in the dashboard.',
    method: 'Per the platform tracking guide',
    source_url: 'https://research.example/tracking',
    estimate_minutes: 90,
    checklist: ['Test purchase event fires', 'Event visible in the dashboard'],
  };
  return {
    steps: [step, { ...step, title: 'Hand over with a recorded walkthrough', source_url: 'https://evil.example' }],
    assumptions: ['Client provides copy by Friday'],
    ...overrides,
  };
}

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function geminiBody(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

test('parseQueriesPayload keeps at most two real questions', () => {
  assert.deepEqual(parseQueriesPayload({ queries: ['a', 'How do store pixels fire test purchases?'] }), [
    'How do store pixels fire test purchases?',
  ]);
  assert.deepEqual(
    parseQueriesPayload({ queries: ['one long enough question', 'two long enough question', 'three long enough question'] }),
    ['one long enough question', 'two long enough question'],
  );
  assert.deepEqual(parseQueriesPayload(null), []);
});

test('parsePlanPayload requires at least two usable steps', () => {
  assert.equal(parsePlanPayload(null, ALLOWED), null);
  assert.equal(parsePlanPayload(planPayload({ steps: [{ title: 'x' }] }), ALLOWED), null);
});

test('parsePlanPayload only cites research that was supplied', () => {
  const parsed = parsePlanPayload(planPayload(), ALLOWED);
  assert.ok(parsed);
  const first = parsed.steps[0];
  const second = parsed.steps[1];
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.source_url, 'https://research.example/tracking');
  assert.equal(second.source_url, null, 'an unknown url can never be cited');
  assert.equal(parsed.assumptions.length, 1);
});

test('parsePlanPayload clamps estimates and seeds missing checklists', () => {
  const parsed = parsePlanPayload(
    planPayload({
      steps: [
        { title: 'First step here', estimate_minutes: 99999, checklist: [] },
        { title: 'Second step here', estimate_minutes: 1, checklist: ['a check'] },
      ],
    }),
    ALLOWED,
  );
  assert.ok(parsed);
  const first = parsed.steps[0];
  const second = parsed.steps[1];
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.estimate_minutes, 4000);
  assert.equal(second.estimate_minutes, 5);
  assert.equal(first.checklist.length, 1, 'a step without checks gets a confirmation check');
});

test('runPlanner returns parsed steps and reports repair', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return fakeResponse(200, geminiBody('not json at all'));
    return fakeResponse(200, geminiBody(JSON.stringify(planPayload())));
  };
  const result = await runPlanner(
    {
      title: 'Store',
      goal: 'Rebuild',
      deliverables: [],
      deadline: null,
      answers: [],
      openQuestions: [],
      research: [{ query: 'tracking', summary: 'verify events', urls: ALLOWED }],
    },
    { fetchImpl },
  );
  assert.equal(result.steps.length, 2);
  assert.equal(result.modelId, 'gemini-3.5-flash');
  assert.equal(result.repaired, true);
});

test('generateResearchQueries and runPlanner report honest failures', async () => {
  const fetchImpl = async () => fakeResponse(429, {});
  const queries = await generateResearchQueries(
    { title: 'Store', goal: null, deliverables: [], brief: 'brief' },
    { fetchImpl },
  );
  assert.deepEqual(queries, { queries: [], modelId: null });
  const plan = await runPlanner(
    {
      title: 'Store',
      goal: null,
      deliverables: [],
      deadline: null,
      answers: [],
      openQuestions: [],
      research: [],
    },
    { fetchImpl },
  );
  assert.equal(plan.reason, 'ai failed');
});
