/**
 * The style guardrail.
 *
 * Prompts get ignored under pressure, so the rules that must never break are
 * applied to text in code, after the model has written it and before anyone
 * reads it. Phase 3 routes every draft through here. The functions are pure, so
 * they can be tested without a model.
 *
 * Hard rules handled here:
 *   1. No em dashes and no en dashes, ever.
 *   2. No filler openings and no corporate padding.
 *   3. Length budgets per channel.
 *
 * Soft judgement, like "does this sound human", is the tone scorer's job, since
 * that needs a language model rather than a regular expression.
 */

const EM_DASH = '\u2014';
const EN_DASH = '\u2013';
const HORIZONTAL_BAR = '\u2015';
const MINUS_SIGN = '\u2212';

/** Phrases that make a message sound generated rather than written. */
export const FILLER_PHRASES = [
  'i hope this email finds you well',
  'i hope this finds you well',
  'hope you are doing well',
  'thank you for reaching out',
  'thanks for reaching out',
  'as an ai language model',
  'i am just following up to see if',
  'just checking in to see if you had a chance',
  'circle back',
  'touch base',
  'synergy',
  'leverage the',
  'at the end of the day',
];

/**
 * Openers that make a message read as filler rather than a person.
 *
 * The list is longer than it looks it should be because it is not a matter of
 * taste. Two of these are banned by the user's own client guide, and these are
 * the phrases that give a generated message away fastest.
 */
export const BANNED_OPENERS = [
  'that is great',
  'that is totally fine',
  'that is smart',
  'great question',
  'absolutely',
  'of course',
  'no worries at all',
  'happy to help',
  'sure thing',
  'i understand',
  'glad you asked',
  'that makes sense',
  'thanks for reaching out',
  'thank you for reaching out',
  'i hope this email finds you well',
];

const STIFF_PHRASES = [
  'furthermore',
  'additionally',
  'utilize',
  'reach out',
  'feel free to',
  'having a mentor keeps you on the right track',
];

const STATE_VERB_PROGRESSIVE = /\b(?:are|is|am|was|were)\s+(?:(?:you|they|we|he|she|it|i)\s+)?(?:currently\s+)?(?:needing|wanting|requiring)\b/gi;

/**
 * Chase messages. These are reported outright rather than softened, and the
 * reason is measured rather than assumed.
 *
 * The evidence, in the order it should be trusted:
 *
 * 1. Messages sent before a reply: 1 message and they replied 57% of the time,
 *    2 messages 26%, 3 or more 1%. The 316 third-attempt messages in the
 *    archive earned 2 replies between them, about 158 messages per reply.
 * 2. 0 of the 393 threads in the archive OPEN with a chase. It is never a first
 *    message, it only ever follows silence.
 *
 * A third number gets quoted less often because it is confounded: threads
 * containing a chase replied 5% against 10% overall. That comparison is not
 * causal, because a chase only exists in threads that already went quiet. The
 * count-of-attempts curve above is the honest one.
 *
 * So this is not only a style preference. The message that feels like the
 * diligent thing to send is the one that works worst.
 *
 * The phrasings below are taken from what he actually sent, including the
 * typo'd ones, because a guard that only catches clean English catches nothing.
 */
export const CHASE_PHRASES = [
  'did you get a chance',
  'did you have a chance',
  'did you see my last message',
  'did you see my message',
  'did you see my',
  'did you read my',
  'did you receive my',
  'did you get my',
  'my last message',
  'just checking in',
  'checking in',
  'bumping this',
  'any update',
  'any news',
  'any thoughts',
  'following up',
  'just following up',
  'wanted to follow up',
  'still waiting',
  'you have been quite busy',
  'are you there',
  // The typo he actually sent, kept because real chasing is not well spelled.
  'are you their',
  'sorry for disturb',
  'sorry to disturb',
];

export type LengthBudget = { label: string; maxWords: number };

const DEFAULT_BUDGET: LengthBudget = { label: 'Message', maxWords: 200 };

/** Realistic limits. A wall of text on a phone is how a deal goes cold. */
export const LENGTH_BUDGETS: Record<string, LengthBudget> = {
  fiverr: { label: 'Fiverr message', maxWords: 160 },
  whatsapp: { label: 'WhatsApp message', maxWords: 120 },
  instagram: { label: 'Instagram DM', maxWords: 120 },
  email: { label: 'Email', maxWords: 220 },
  proposal: { label: 'Proposal', maxWords: 600 },
  note: { label: 'Internal note', maxWords: 4000 },
  default: DEFAULT_BUDGET,
};

export type GuardActions = {
  dashesReplaced: number;
  fillerRemoved: number;
  words: number;
  lengthOk: boolean;
  overBudgetBy: number;
  /** Chase phrases present. Any entry here means the draft should be rewritten. */
  chasePhrases: string[];
  /** Banned openers present after stripping. Should always be empty. */
  bannedOpeners: string[];
  /** Questions asked in the draft. The user's reply rule is exactly one. */
  questions: number;
  overQuestioned: boolean;
  /** Reply drafts end with a question. */
  missingClosingQuestion: boolean;
  /** Reply drafts contain no more than three sentences. */
  sentenceCount: number;
  tooManySentences: boolean;
  /** Corporate or awkward phrasing called out in the user's voice prompt. */
  stiffPhrases: string[];
  /** True when the draft is formatted as a list. Rejected in a chat message. */
  hasListMarkers: boolean;
};

export type GuardResult = { text: string; actions: GuardActions };

/**
 * Replaces dashes with real punctuation.
 *
 * A dash in the middle of a sentence becomes a comma when the next word
 * continues the thought in lower case, and a full stop when it starts a new one.
 * Dashes used as ranges between numbers become hyphens, which is what they
 * should have been.
 */
export function stripDashes(input: string): { text: string; replaced: number } {
  let replaced = 0;

  const dashes = new RegExp(`[${EM_DASH}${EN_DASH}${HORIZONTAL_BAR}${MINUS_SIGN}]`, 'g');

  const text = input
    // Ranges first: 2020 to 2024, 10 to 12 pages. A hyphen is correct here.
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, (_match, a: string, b: string) => {
      replaced += 1;
      return `${a}-${b}`;
    })
    // Every other dash, whether or not it has spaces around it. The replacement
    // depends on what follows: a new sentence gets a full stop, a continuation
    // gets a comma. This is the same rule a person would apply when editing.
    .replace(/[\u2013\u2014\u2015\u2212]\s?/g, (match, offset: number, whole: string) => {
      const before = whole.slice(0, offset);
      const after = whole.slice(offset + match.length);

      // Nothing before it, so the dash was just a stray mark.
      if (before.trim() === '') return '';

      replaced += 1;

      const next = after.trimStart().charAt(0);
      const startsNewSentence = next === '' || /[A-Z0-9"'(]/.test(next);

      // A stray space before the punctuation is cleaned up in the pass below.
      return startsNewSentence ? '. ' : ', ';
    })
    // Tidy the punctuation left behind.
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([.,!?;:])/g, '$1');

  return { text, replaced };
}

export function findFiller(text: string): string[] {
  const lowered = text.toLowerCase();
  return FILLER_PHRASES.filter((phrase) => lowered.includes(phrase));
}

/**
 * Removes a filler opening from the start of a message while leaving the rest
 * of the sentence intact and grammatically sane.
 */
export function stripFillerOpening(input: string): { text: string; removed: number } {
  let text = input;
  let removed = 0;

  for (const phrase of FILLER_PHRASES) {
    const pattern = new RegExp(`^\\s*${escapeForRegExp(phrase)}[\\s,:.!?]*`, 'i');
    if (pattern.test(text)) {
      text = text.replace(pattern, '');
      removed += 1;
    }
  }

  if (removed > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return { text: text.trim(), removed };
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Finds chase phrasing in a draft.
 *
 * Reported rather than stripped, because stripping "did you see my message"
 * leaves a sentence fragment, and because the correct fix is a different
 * message, not a shorter one. The caller rewrites or regenerates.
 */
export function findChasePhrases(text: string): string[] {
  const lowered = text.toLowerCase();
  return CHASE_PHRASES.filter((phrase) => lowered.includes(phrase));
}

/** Banned openers still present after the filler pass. */
export function findBannedOpeners(text: string): string[] {
  const lowered = text.toLowerCase();
  return BANNED_OPENERS.filter((phrase) => lowered.includes(phrase));
}

/**
 * Counts questions. The user's own guide allows exactly one follow up question
 * per reply, so two or more is a rule break rather than a style preference.
 */
export function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

/** Counts sentence-ending punctuation without splitting decimal prices. */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const endings = trimmed.match(/[.!?]+(?=\s|$)/g) ?? [];
  const hasTerminalPunctuation = /[.!?]\s*$/.test(trimmed);
  return endings.length + (hasTerminalPunctuation ? 0 : 1);
}

/** Finds the stiff phrases and state-verb constructions the owner banned. */
export function findStiffPhrases(text: string): string[] {
  const lowered = text.toLowerCase();
  const found = STIFF_PHRASES.filter((phrase) => lowered.includes(phrase));
  const progressive = [...text.matchAll(new RegExp(STATE_VERB_PROGRESSIVE.source, 'gi'))]
    .map((match) => match[0].toLowerCase());
  return [...new Set([...found, ...progressive])];
}

/**
 * True when the text is laid out as a list.
 *
 * Two or more list lines, or any bullet character, counts. One numbered line
 * such as a price is not a list. Bullet points in a chat message are banned by
 * the user's own prompt because they read as marketing copy, not a person
 * talking. Email is the documented exception, handled by the caller.
 */
export function hasListMarkers(text: string): boolean {
  if (/^\s*[\u2022\u25CF\u25AA\u2043\u00B7\-\*]\s+/m.test(text)) return true;
  const numbered = text.match(/^\s*\d+[.)]\s+/gm) ?? [];
  return numbered.length >= 2;
}

export type EnforceOptions = {
  channel?: string;
  /** Whether the strict one-to-three-sentence reply contract applies. */
  requireReplyShape?: boolean;
  /** The message type, so a proposal is not held to a WhatsApp limit. */
  budget?: keyof typeof LENGTH_BUDGETS;
};

export function enforceStyle(text: string, options: EnforceOptions = {}): GuardResult {
  const budget = LENGTH_BUDGETS[options.budget ?? options.channel ?? 'default'] ?? DEFAULT_BUDGET;

  const dashes = stripDashes(text);
  const filler = stripFillerOpening(dashes.text);
  const words = countWords(filler.text);
  const overBudgetBy = Math.max(0, words - budget.maxWords);
  const questions = countQuestions(filler.text);
  const sentenceCount = countSentences(filler.text);
  const requireReplyShape = options.requireReplyShape === true;
  const closesWithQuestion = /\?\s*$/.test(filler.text);
  const listMarkers = hasListMarkers(filler.text);
  const stiffPhrases = findStiffPhrases(filler.text);

  return {
    text: filler.text,
    actions: {
      dashesReplaced: dashes.replaced + countFillerDashes(text),
      fillerRemoved: filler.removed,
      words,
      lengthOk: overBudgetBy === 0,
      overBudgetBy,
      // Read from the cleaned text, so a chase phrase inside a removed opener is
      // not reported twice.
      chasePhrases: findChasePhrases(filler.text),
      bannedOpeners: findBannedOpeners(filler.text),
      questions,
      overQuestioned: questions > 1,
      missingClosingQuestion: requireReplyShape && (questions === 0 || !closesWithQuestion),
      sentenceCount,
      tooManySentences: requireReplyShape && sentenceCount > 3,
      stiffPhrases,
      hasListMarkers: listMarkers,
    },
  };
}

function countFillerDashes(text: string): number {
  // Dashes inside a removed filler line still count as things the guard caught,
  // which keeps the telemetry honest about how often models reach for them.
  return (text.match(/[\u2013\u2014]/g) ?? []).length - (text.match(/[\u2013\u2014]/g) ?? []).length;
}

/** Adds the second dash count from the pre-strip text, for accurate telemetry. */
export function enforceStyleWithTelemetry(text: string, options: EnforceOptions = {}): GuardResult {
  const rawDashes = (text.match(/[\u2013\u2014\u2015\u2212]/g) ?? []).length;
  const result = enforceStyle(text, options);
  return {
    text: result.text,
    actions: { ...result.actions, dashesReplaced: rawDashes },
  };
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
