/**
 * The project intake engine: restate the brief, then ask the questions that
 * separate a professional from a beginner.
 *
 * The rule this file exists to enforce: missing information becomes a
 * question, never a silent assumption. The model restates what it understood,
 * flags a deadline that does not fit the scope, and produces gap questions
 * with the reason each one matters, so sending them to the client is a choice
 * rather than a chore.
 *
 * REST based, server-only free, never throws. Free tier models only.
 */

import { MODEL_CHAIN } from './routing';

export type BriefRestatement = {
  goal: string;
  deliverables: string[];
  constraints: string[];
  success: string[];
  next_step: string;
  deadline_risk: string | null;
};

export type GapQuestion = { question: string; why_it_matters: string };

export type IntakeResult = {
  restatement: BriefRestatement | null;
  questions: GapQuestion[];
  modelId: string | null;
  repaired: boolean;
  reason?: string;
};

export type IntakeInput = {
  title: string;
  brief: string;
  deliverables: string[];
  deadline?: string | null;
  budget?: string | null;
  currency?: string | null;
  clientName?: string | null;
  /** Operating knowledge matched to this brief, when any playbook matched. */
  knowledge?: string;
};

const INTAKE_MODELS = MODEL_CHAIN;
const MAX_QUESTIONS = 6;

function asStringArray(value: unknown, cap = 8): string[] {
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

/**
 * Validates one model payload. Exported for tests. Returns null when the
 * payload is not usable, so the caller can fall through to the repair model.
 */
export function parseIntakePayload(
  payload: unknown,
): { restatement: BriefRestatement; questions: GapQuestion[] } | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;

  const restatementRaw = root.restatement;
  if (!restatementRaw || typeof restatementRaw !== 'object') return null;
  const r = restatementRaw as Record<string, unknown>;

  const goal = typeof r.goal === 'string' ? r.goal.trim() : '';
  if (goal.length < 5) return null;

  const nextStep = typeof r.next_step === 'string' ? r.next_step.trim() : '';
  const deadlineRisk =
    typeof r.deadline_risk === 'string' && r.deadline_risk.trim() !== ''
      ? r.deadline_risk.trim().slice(0, 600)
      : null;

  const questionsRaw = Array.isArray(root.questions) ? root.questions : [];
  const seen = new Set<string>();
  const questions: GapQuestion[] = [];
  for (const entry of questionsRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const q = entry as Record<string, unknown>;
    const question = typeof q.question === 'string' ? q.question.trim() : '';
    const why = typeof q.why_it_matters === 'string' ? q.why_it_matters.trim() : '';
    if (question.length < 5) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push({
      question: question.slice(0, 400),
      why_it_matters: why === '' ? 'It changes how the work is planned.' : why.slice(0, 400),
    });
    if (questions.length >= MAX_QUESTIONS) break;
  }

  return {
    restatement: {
      goal: goal.slice(0, 600),
      deliverables: asStringArray(r.deliverables),
      constraints: asStringArray(r.constraints),
      success: asStringArray(r.success),
      next_step: nextStep.slice(0, 400),
      deadline_risk: deadlineRisk,
    },
    questions,
  };
}

function buildIntakePrompt(input: IntakeInput): string {
  const deliverables =
    input.deliverables.length > 0 ? input.deliverables.join('; ') : 'not listed by the user';
  const lines = [
    'You are the delivery lead inside a private assistant for a freelance',
    'web designer and digital marketer. A new project brief just arrived.',
    'Your job: restate it accurately, then ask the questions a professional',
    'asks before planning. Never invent information. Anything unclear or',
    'missing becomes a question.',
    '',
    'Respond with JSON only, exactly this shape:',
    '{',
    '  "restatement": {',
    '    "goal": "one sentence, what done looks like for the client",',
    '    "deliverables": ["each thing that will be delivered"],',
    '    "constraints": ["budget, timeline, platform, access limits"],',
    '    "success": ["how success will be judged"],',
    '    "next_step": "the single next action for the freelancer",',
    '    "deadline_risk": "if the deadline does not fit the scope, say why in one sentence, else null"',
    '  },',
    '  "questions": [',
    '    {"question": "the question, worded so it can be sent to the client as is",',
    '     "why_it_matters": "one sentence, why the plan depends on this"}',
    '  ]',
    '}',
    '',
    'Rules:',
    `- Ask between 3 and ${MAX_QUESTIONS} questions, most important first.`,
    '- Target the gaps that actually change the plan: who writes the copy, who',
    '  owns hosting and domain access, how many revisions are included, what',
    '  happens if the client delays content, is tracking configured, what is',
    '  the real pressure behind the deadline. Pick what is missing here, do',
    '  not ask all of them by habit.',
    '- Questions are for the client: plain words, no jargon, no dashes.',
    '- If the deadline looks impossible for the scope, put that in',
    '  deadline_risk plainly. Do not agree politely and fail later.',
    '- No em dashes anywhere in the JSON.',
    '',
    'The brief:',
    `Title: ${input.title}`,
    input.clientName ? `Client: ${input.clientName}` : 'Client: not linked',
    input.deadline ? `Deadline: ${input.deadline}` : 'Deadline: not stated',
    input.budget
      ? `Budget: ${input.budget} ${input.currency ?? 'USD'}`
      : 'Budget: not stated',
    `Stated deliverables: ${deliverables}`,
    '',
    'Raw brief from the freelancer:',
    input.brief.slice(0, 4000),
  ];
  if (input.knowledge) {
    lines.push('', '## Operating knowledge for this domain', '', input.knowledge);
  }
  return lines.join('\n');
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

export async function runIntake(
  input: IntakeInput,
  overrides?: { fetchImpl?: typeof fetch },
): Promise<IntakeResult> {
  const doFetch = overrides?.fetchImpl ?? fetch;
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return { restatement: null, questions: [], modelId: null, repaired: false, reason: 'no key' };

  const prompt = buildIntakePrompt(input);
  let attempts = 0;

  for (const modelId of INTAKE_MODELS) {
    try {
      const response = await doFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3 },
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
      const parsed = parseIntakePayload(JSON.parse(json));
      if (!parsed) {
        attempts += 1;
        continue;
      }
      return { ...parsed, modelId, repaired: attempts > 0 };
    } catch {
      attempts += 1;
    }
  }

  return { restatement: null, questions: [], modelId: null, repaired: false, reason: 'ai failed' };
}
