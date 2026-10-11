import { enforceStyleWithTelemetry, type GuardActions } from './style-guard';
import { assembleContext, type ContextInput } from './context';
import { buildVoicePrompt, type Tone, type VoiceOptions } from './voice';

/**
 * The drafting pipeline: the loop, the guard and the repair attempt.
 *
 * The shape is deliberate: generate, check, and if the check fails, regenerate
 * once with the exact failure quoted back. One retry maximum, because the free
 * tier is a real constraint and because a second attempt guided by the specific
 * problem is a repair rather than a lottery.
 *
 * If the second draft still breaks a rule, it is returned as failed rather than
 * quietly handed over. A draft that breaks the rules must never look like a
 * draft that passed, or the guard becomes decoration.
 */

export type DraftOutcome = {
  ok: boolean;
  text: string;
  /** Present when the first attempt broke a rule and a second was made. */
  fixed: boolean;
  attempts: number;
  actions: GuardActions;
  /** Plain language list of what is still wrong, for the UI to show. */
  problems: string[];
  latencyMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

export type DraftRequest = {
  context: ContextInput;
  tone?: Tone;
  purpose?: VoiceOptions['purpose'];
  /** Extra instruction for this one draft, from the user typing a hint. */
  instruction?: string | null;
  /** Start on the fast model: used by flows inside the serverless time box. */
  fast?: boolean;
  channel?: string;
};

/**
 * Thinking tokens count against maxOutputTokens on the current models, and a
 * real call returned 396 output tokens for 11 words of visible text. Too tight
 * a budget produces a half-written reply that looks like a broken model, so the
 * budget here is generous on purpose.
 */
export const DRAFT_MAX_OUTPUT_TOKENS = 2400;

export function describeProblems(actions: GuardActions): string[] {
  const problems: string[] = [];

  if (actions.words === 0) {
    problems.push('It came back empty.');
  }

  if (actions.chasePhrases.length > 0) {
    problems.push(
      `It contained chase phrasing: ${actions.chasePhrases.slice(0, 3).join(', ')}.`,
    );
  }
  if (actions.bannedOpeners.length > 0) {
    problems.push(`It opened with a filler line: ${actions.bannedOpeners[0]}.`);
  }
  if (actions.overQuestioned) {
    problems.push(`It asked ${actions.questions} questions. The limit is one.`);
  }
  if (actions.hasListMarkers) {
    problems.push('It was laid out as a list. A chat message is not a list.');
  }
  if (actions.overBudgetBy > 0) {
    problems.push(`It was ${actions.overBudgetBy} words over the budget for this platform.`);
  }
  if (actions.dashesReplaced > 0) {
    problems.push('It used a dash, which is not allowed.');
  }

  return problems;
}

function hasProblems(actions: GuardActions): boolean {
  return (
    actions.words === 0 ||
    actions.chasePhrases.length > 0 ||
    actions.bannedOpeners.length > 0 ||
    actions.overQuestioned ||
    actions.hasListMarkers ||
    actions.overBudgetBy > 0
  );
}

/**
 * A rewrite instruction built from the specific failures.
 *
 * Quoting the failure back works far better than "try again", and it gives the
 * user something readable when they are shown why a draft was rejected.
 */
export function buildRepairInstruction(problems: string[], previous: string): string {
  return [
    'The previous attempt broke a rule of this business and cannot be used.',
    '',
    'What was wrong:',
    ...problems.map((problem) => `- ${problem}`),
    '',
    'The rejected draft was:',
    previous,
    '',
    'Write it again from scratch. Do not edit that draft. Same reply to the same message, but respecting every rule.',
  ].join('\n');
}

export type GenerateFn = (prompt: {
  system: string;
  prompt: string;
  maxOutputTokens: number;
}) => Promise<{ text: string; inputTokens: number | null; outputTokens: number | null }>;

/**
 * Runs one draft, with the guard and the single repair attempt.
 *
 * Takes a generator rather than a model so tests can drive it with a fake and
 * prove the loop behaves, without spending quota or depending on a network.
 */
export async function draftReplyWith(
  generate: GenerateFn,
  request: DraftRequest,
): Promise<DraftOutcome> {
  const started = Date.now();
  const channel = request.channel ?? request.context.channel ?? 'instagram';
  const context = assembleContext({ ...request.context, channel });

  const system = buildVoicePrompt({
    channel,
    source: request.context.client.source ?? null,
    tone: request.tone ?? 'unknown',
    stage: request.context.client.stage ?? 'lead',
    purpose: request.purpose ?? 'reply',
  });

  const basePrompt = [
    context.text,
    request.instruction ? `\n## Extra instruction for this reply\n${request.instruction}` : '',
    '',
    'Write one message, ready to send. No preamble, no explanation, no options, no quotation marks around it.',
  ]
    .filter(Boolean)
    .join('\n');

  const first = await generate({
    system,
    prompt: basePrompt,
    maxOutputTokens: DRAFT_MAX_OUTPUT_TOKENS,
  });

  const firstGuard = enforceStyleWithTelemetry(first.text, { channel });
  const firstProblems = describeProblems(firstGuard.actions);

  if (!hasProblems(firstGuard.actions)) {
    return {
      ok: true,
      text: firstGuard.text,
      fixed: false,
      attempts: 1,
      actions: firstGuard.actions,
      problems: [],
      latencyMs: Date.now() - started,
      usage: { inputTokens: first.inputTokens, outputTokens: first.outputTokens },
    };
  }

  const second = await generate({
    system,
    prompt: `${basePrompt}\n\n${buildRepairInstruction(firstProblems, firstGuard.text)}`,
    maxOutputTokens: DRAFT_MAX_OUTPUT_TOKENS,
  });

  const secondGuard = enforceStyleWithTelemetry(second.text, { channel });
  const secondProblems = describeProblems(secondGuard.actions);

  return {
    ok: secondProblems.length === 0,
    text: secondGuard.text,
    fixed: true,
    attempts: 2,
    actions: secondGuard.actions,
    problems: secondProblems,
    latencyMs: Date.now() - started,
    usage: {
      inputTokens: (first.inputTokens ?? 0) + (second.inputTokens ?? 0) || null,
      outputTokens: (first.outputTokens ?? 0) + (second.outputTokens ?? 0) || null,
    },
  };
}
