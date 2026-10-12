/**
 * The project planner: research questions first, then a step plan that cites
 * the research, with a quality checklist per step.
 *
 * Two pure generation passes, both REST based, server-only free, never
 * throws, free tier models only:
 *
 *  1. generateResearchQueries turns the brief into at most two search
 *     questions worth running through the research engine.
 *  2. runPlanner writes the steps, and may only recommend a method that the
 *     supplied research backs. Steps must be executable, and each carries
 *     the checklist it will be judged against.
 */

import { MODEL_CHAIN } from './routing';

export type PlanStepInput = {
  title: string;
  detail: string;
  method: string | null;
  source_url: string | null;
  estimate_minutes: number;
  checklist: string[];
};

export type PlanResult = {
  steps: PlanStepInput[];
  assumptions: string[];
  modelId: string | null;
  repaired: boolean;
  reason?: string;
};

const PLANNER_MODELS = MODEL_CHAIN;
const MAX_STEPS = 10;
const MAX_CHECKLIST = 8;

function asStringArray(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim() !== '') out.push(entry.trim().slice(0, 400));
    if (out.length >= cap) break;
  }
  return out;
}

function extractJson(text: string): string | null {
  const stripped = text.replace(/```(?:json)?/gi, ' ').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return stripped.slice(start, end + 1);
}

type GeminiResponse = { candidates?: { content?: { parts?: { text?: string }[] } }[] };

function textFromGemini(payload: GeminiResponse): string {
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() ?? ''
  );
}

/** Validates the research query payload. Exported for tests. */
export function parseQueriesPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const queries = asStringArray((payload as { queries?: unknown }).queries, 2);
  return queries.filter((q) => q.length >= 8).slice(0, 2);
}

/**
 * Validates one plan payload. source_url must be one of the urls the research
 * actually returned, so a method can never cite a study that was not read.
 * Exported for tests.
 */
export function parsePlanPayload(
  payload: unknown,
  allowedUrls: string[],
): { steps: PlanStepInput[]; assumptions: string[] } | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const rawSteps = Array.isArray(root.steps) ? root.steps : [];
  if (rawSteps.length < 2) return null;

  const allowed = new Set(allowedUrls);
  const steps: PlanStepInput[] = [];
  for (const entry of rawSteps) {
    if (!entry || typeof entry !== 'object') continue;
    const s = entry as Record<string, unknown>;
    const title = typeof s.title === 'string' ? s.title.trim() : '';
    if (title.length < 3) continue;
    const detail = typeof s.detail === 'string' ? s.detail.trim() : '';
    const method = typeof s.method === 'string' && s.method.trim() !== '' ? s.method.trim() : null;
    const sourceUrl =
      typeof s.source_url === 'string' && allowed.has(s.source_url) ? s.source_url : null;
    const estimate = typeof s.estimate_minutes === 'number' ? Math.round(s.estimate_minutes) : 0;
    const checklist = asStringArray(s.checklist, MAX_CHECKLIST);

    steps.push({
      title: title.slice(0, 300),
      detail: detail.slice(0, 800),
      method: method ? method.slice(0, 800) : null,
      source_url: sourceUrl,
      estimate_minutes: Math.min(Math.max(estimate, 5), 4000),
      checklist: checklist.length > 0 ? checklist : ['The client confirmed this part works as briefed.'],
    });
    if (steps.length >= MAX_STEPS) break;
  }

  if (steps.length < 2) return null;
  return { steps, assumptions: asStringArray(root.assumptions, 6) };
}

export type QueryInput = {
  title: string;
  goal: string | null;
  deliverables: string[];
  brief: string | null;
};

export async function generateResearchQueries(
  input: QueryInput,
  overrides?: { fetchImpl?: typeof fetch },
): Promise<{ queries: string[]; modelId: string | null }> {
  const doFetch = overrides?.fetchImpl ?? fetch;
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return { queries: [], modelId: null };

  const prompt = [
    'You are the research lead inside a private assistant for a freelance web',
    'designer and digital marketer. A project needs its method researched',
    'before planning. Write at most two web search questions that will decide',
    'HOW the work should be done: current platform pricing and limits, plugin',
    'or tool choices, performance targets, common pitfalls with fixes.',
    'Never ask about the client\'s own answers, only about method.',
    'Respond with JSON only: {"queries": ["question one", "question two"]}',
    'Plain words, no dashes.',
    '',
    `Project: ${input.title}`,
    `Goal: ${input.goal ?? 'not restated yet'}`,
    `Deliverables: ${input.deliverables.join('; ') || 'not listed'}`,
    `Brief: ${(input.brief ?? '').slice(0, 1500)}`,
  ].join('\n');

  for (const modelId of PLANNER_MODELS) {
    try {
      const response = await doFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (response.status === 429 || response.status === 503) continue;
      if (!response.ok) continue;
      const text = textFromGemini((await response.json()) as GeminiResponse);
      const json = extractJson(text);
      if (!json) continue;
      const queries = parseQueriesPayload(JSON.parse(json));
      if (queries.length > 0) return { queries, modelId };
    } catch {
      // try the next model
    }
  }
  return { queries: [], modelId: null };
}

export type PlannerInput = {
  title: string;
  goal: string | null;
  deliverables: string[];
  deadline: string | null;
  answers: { question: string; answer: string }[];
  openQuestions: string[];
  research: { query: string; summary: string; urls: string[] }[];
};

export async function runPlanner(
  input: PlannerInput,
  overrides?: { fetchImpl?: typeof fetch },
): Promise<PlanResult> {
  const doFetch = overrides?.fetchImpl ?? fetch;
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return { steps: [], assumptions: [], modelId: null, repaired: false, reason: 'no key' };

  const allowedUrls = input.research.flatMap((note) => note.urls);
  const researchBlocks = input.research
    .map((note, i) => {
      const sources = note.urls.map((url, j) => `  source ${i + 1}.${j + 1}: ${url}`).join('\n');
      return `Research ${i + 1}: ${note.query}\n${note.summary}\n${sources}`;
    })
    .join('\n\n');

  const prompt = [
    'You are the delivery lead inside a private assistant for a freelance web',
    'designer and digital marketer. Write the step plan for one project.',
    'The plan is built ONLY from the brief, the client\'s answers, and the',
    'numbered research below. Where the research backs a method, cite its',
    'source url exactly as listed. Where nothing was researched, leave',
    'source_url null and say in method that it is the freelancer\'s standard.',
    '',
    'Respond with JSON only:',
    '{',
    '  "steps": [',
    '    {"title": "short verb-first title",',
    '     "detail": "what done looks like, specific enough to execute",',
    '     "method": "how, citing research where it applies",',
    '     "source_url": "one of the listed source urls or null",',
    '     "estimate_minutes": 60,',
    '     "checklist": ["the checks that must all pass before this step is done"]}',
    '  ],',
    '  "assumptions": ["anything you had to assume because a question is still open"]',
    '}',
    '',
    'Rules:',
    `- Between 3 and ${MAX_STEPS} steps, in execution order.`,
    '- Steps are executable: "Install and configure the pixel and test one',
    '  purchase event end to end", never "do tracking".',
    '- Every step has two to six checklist items, testable, no vague words.',
    '- Estimates are honest minutes including fixes, not best case.',
    `- Open questions become assumptions listed plainly, and the first step`,
    '  covers confirming them with the client when any exist.',
    '- No em dashes anywhere.',
    '',
    `Project: ${input.title}`,
    `Goal: ${input.goal ?? 'not restated'}`,
    `Deliverables: ${input.deliverables.join('; ') || 'not listed'}`,
    `Deadline: ${input.deadline ?? 'none stated'}`,
    '',
    'Client answers:',
    input.answers.length > 0
      ? input.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n')
      : 'none recorded yet',
    '',
    'Open questions:',
    input.openQuestions.length > 0 ? input.openQuestions.map((q) => `- ${q}`).join('\n') : 'none',
    '',
    'Research:',
    researchBlocks || 'none, so methods are the freelancer\'s standard and say so',
  ].join('\n');

  let attempts = 0;
  for (const modelId of PLANNER_MODELS) {
    try {
      const response = await doFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(25000),
        },
      );
      if (response.status === 429 || response.status === 503) continue;
      if (!response.ok) continue;
      const text = textFromGemini((await response.json()) as GeminiResponse);
      const json = extractJson(text);
      if (!json) {
        attempts += 1;
        continue;
      }
      const parsed = parsePlanPayload(JSON.parse(json), allowedUrls);
      if (!parsed) {
        attempts += 1;
        continue;
      }
      return { ...parsed, modelId, repaired: attempts > 0 };
    } catch {
      attempts += 1;
    }
  }
  return { steps: [], assumptions: [], modelId: null, repaired: false, reason: 'ai failed' };
}
