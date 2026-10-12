/**
 * The client status update draft: written from real progress only. Done
 * steps, the step in flight, named blockers, and the next thing the client
 * needs to provide. Never invented progress, never vague.
 *
 * REST based, server-only free, never throws, free tier models only.
 */

import { MODEL_CHAIN } from './routing';

const UPDATE_MODELS = MODEL_CHAIN;

export type UpdateInput = {
  clientName: string | null;
  title: string;
  steps: { title: string; status: string; blocked_reason: string | null }[];
  deadline: string | null;
  extra?: string | null;
};

type GeminiResponse = { candidates?: { content?: { parts?: { text?: string }[] } }[] };

export async function draftProjectUpdate(
  input: UpdateInput,
  overrides?: { fetchImpl?: typeof fetch },
): Promise<{ text: string | null; modelId: string | null; reason?: string }> {
  const doFetch = overrides?.fetchImpl ?? fetch;
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return { text: null, modelId: null, reason: 'no key' };

  const lines = input.steps.map((s, i) => {
    const blocked = s.status === 'blocked' && s.blocked_reason ? ` (blocked: ${s.blocked_reason})` : '';
    return `${i + 1}. [${s.status}] ${s.title}${blocked}`;
  });

  const prompt = [
    'You write short project updates for a freelance web designer to send to',
    'his client. Write it in first person, as the freelancer. Rules:',
    '- Only the facts supplied. No invented progress, no fake dates.',
    '- Say what is done, what is in flight, what is blocked and why, and the',
    '  one thing the client needs to do next, if anything.',
    '- Short: 120 words maximum. Warm but professional. No em dashes.',
    '- Open with the client\'s name when it is known. When it is not, start',
    '  straight with the update. Never open with the bare word client.',
    '',
    `Client: ${input.clientName ?? 'the client'}`,
    `Project: ${input.title}`,
    `Deadline: ${input.deadline ?? 'none stated'}`,
    '',
    'Steps:',
    lines.join('\n'),
    input.extra ? `\nAdd: ${input.extra}` : '',
  ].join('\n');

  for (const modelId of UPDATE_MODELS) {
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
          signal: AbortSignal.timeout(20000),
        },
      );
      if (response.status === 429 || response.status === 503) continue;
      if (!response.ok) continue;
      const payload = (await response.json()) as GeminiResponse;
      const text = (
        payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? ''
      ).slice(0, 1500);
      if (text.length > 20) return { text, modelId };
    } catch {
      // try the next model
    }
  }
  return { text: null, modelId: null, reason: 'ai failed' };
}
