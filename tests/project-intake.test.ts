import assert from 'node:assert/strict';
import test from 'node:test';

import { parseIntakePayload, runIntake } from '../lib/ai/intake.ts';

// runIntake reads the key before touching the network. Tests inject every
// fetch, so a dummy key just opens the door; nothing real is called.
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';

function okPayload(overrides: Record<string, unknown> = {}) {
  return {
    restatement: {
      goal: 'Deliver a five page WordPress site that turns visits into enquiries',
      deliverables: ['Five page WordPress site', 'Contact form'],
      constraints: ['Client provides copy', 'Budget 250 USD'],
      success: ['Enquiries arriving through the form'],
      next_step: 'Send the gap questions to the client',
      deadline_risk: null,
      ...overrides,
    },
    questions: [
      { question: 'Who writes the page copy?', why_it_matters: 'Copy delays are the top cause of late sites.' },
      { question: 'Do you already own the domain and hosting?', why_it_matters: 'Access decides day one of the plan.' },
    ],
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

test('parseIntakePayload validates a full payload', () => {
  const parsed = parseIntakePayload(okPayload());
  assert.ok(parsed);
  assert.equal(
    parsed.restatement.goal,
    'Deliver a five page WordPress site that turns visits into enquiries',
  );
  assert.equal(parsed.restatement.deadline_risk, null);
  assert.equal(parsed.questions.length, 2);
  const first = parsed.questions[0];
  assert.ok(first);
  assert.equal(first.why_it_matters.length > 5, true);
});

test('parseIntakePayload refuses a payload without a real goal', () => {
  assert.equal(parseIntakePayload(null), null);
  assert.equal(parseIntakePayload({ questions: [] }), null);
  assert.equal(parseIntakePayload(okPayload({ goal: 'no' })), null);
});

test('parseIntakePayload drops junk questions, dedupes, and caps at six', () => {
  const questions = [
    { question: 'First question here?', why_it_matters: 'Because.' },
    { question: 'first question here?', why_it_matters: 'Case dupe.' },
    { question: 'x', why_it_matters: 'too short' },
    { question: 'No why field at all?', why_it_matters: 42 },
    ...Array.from({ length: 8 }, (_, i) => ({
      question: `Filler question number ${i}?`,
      why_it_matters: 'Reason.',
    })),
  ];
  const parsed = parseIntakePayload({ ...okPayload(), questions });
  assert.ok(parsed);
  assert.equal(parsed.questions.length, 6);
  const firstKept = parsed.questions[0];
  assert.ok(firstKept);
  assert.equal(firstKept.question, 'First question here?');
  assert.equal(
    parsed.questions.some((q) => q.question === 'No why field at all?'),
    true,
    'a real question survives a bad why field, with a default reason',
  );
});

test('parseIntakePayload carries a deadline risk through', () => {
  const parsed = parseIntakePayload(
    okPayload({ deadline_risk: 'Seven days is not enough for a store build with product upload.' }),
  );
  assert.ok(parsed);
  assert.equal(
    parsed.restatement.deadline_risk,
    'Seven days is not enough for a store build with product upload.',
  );
});

test('runIntake reads fenced JSON from the model', async () => {
  const payload = okPayload();
  const fetchImpl = async () => fakeResponse(200, geminiBody('```json\n' + JSON.stringify(payload) + '\n```'));
  const result = await runIntake({ title: 'Site', brief: 'Client wants a site.', deliverables: [] }, { fetchImpl });
  assert.ok(result.restatement);
  assert.equal(result.questions.length, 2);
  assert.equal(result.modelId, 'gemini-3.1-flash-lite');
  assert.equal(result.repaired, false);
});

test('runIntake repairs with the second model when the first answers junk', async () => {
  const payload = okPayload();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return fakeResponse(200, geminiBody('Sorry, I cannot help with that.'));
    return fakeResponse(200, geminiBody(JSON.stringify(payload)));
  };
  const result = await runIntake({ title: 'Site', brief: 'Client wants a site.', deliverables: [] }, { fetchImpl });
  assert.ok(result.restatement);
  assert.equal(result.modelId, 'gemini-3.5-flash');
  assert.equal(result.repaired, true);
});

test('runIntake skips quota errors and reports honestly when both models fail', async () => {
  const fetchImpl = async () => fakeResponse(429, {});
  const result = await runIntake({ title: 'Site', brief: 'Client wants a site.', deliverables: [] }, { fetchImpl });
  assert.equal(result.restatement, null);
  assert.equal(result.questions.length, 0);
  assert.equal(result.reason, 'ai failed');
});
