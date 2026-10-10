/**
 * Reading a client's tone from a pasted message.
 *
 * The model answers with a single word and this module keeps the pure part:
 * the prompt and the parsing. Both are testable without a network, and the
 * route that calls the model lives in app/api/tone.
 */
import type { Tone } from './voice';

export const TONE_VALUES: Tone[] = [
  'casual',
  'formal',
  'short',
  'detailed',
  'warm',
  'direct',
  'unknown',
];

/**
 * Tolerates the model adding punctuation or a short sentence around the word.
 * The order matters when two tones appear in the same answer: the more
 * specific read wins over "short", which is the weakest signal.
 */
export function parseTone(raw: string): Tone {
  const text = raw.toLowerCase();
  for (const value of ['casual', 'formal', 'detailed', 'warm', 'direct', 'short'] as Tone[]) {
    if (text.includes(value)) return value;
  }
  return 'unknown';
}

export function toneScorePrompt(message: string): string {
  return [
    'Read the tone of this one client message, for the purpose of matching it',
    'in a reply. casual: relaxed, emojis, slang. formal: polite, complete',
    'sentences, titles. short: one or two words at a time. detailed: long,',
    'specific, many points. warm: friendly, personal, thankful. direct: business',
    'only, no small talk. unknown: not enough signal.',
    'Answer with exactly one word from: casual, formal, short, detailed, warm, direct, unknown.',
    '',
    'Message:',
    message.slice(0, 1200),
  ].join('\n');
}
