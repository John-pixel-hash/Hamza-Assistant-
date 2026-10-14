/**
 * Pure half of screenshot reading: the prompt and the JSON parser. Kept free of
 * server-only imports so tests can run it directly.
 */

import { CHANNELS, type Channel } from '../domain';

export type VisionMessage = {
  role: 'client' | 'me';
  text: string;
  /** Zero-based positions in the ordered screenshot batch. */
  screenshotIndices: number[];
};

export type VisionExtraction = {
  platform: Channel | 'unknown';
  clientName: string | null;
  messages: VisionMessage[];
  tone: string | null;
};

export type VisionResult = {
  extraction: VisionExtraction | null;
  modelId: string | null;
  reason?: string;
};

export function buildVisionPrompt(imageCount: number): string {
  const batchContext = imageCount > 1
    ? `There are ${imageCount} screenshots from the same conversation, in the user's chosen order. Read them together as one conversation and return messages in chronological order.`
    : 'There is one screenshot. Read the visible conversation in chronological order.';

  return [
    'You read screenshots of client conversations from any platform.',
    'Look at the interface chrome (headers, colors, layout) to identify the',
    'platform, and read the visible conversation exactly as written.',
    batchContext,
    'Answer with JSON only, in this exact shape:',
    '{"platform": one of fiverr|email|whatsapp|instagram|call|linkedin|upwork|other|unknown,',
    ' "client_name": the other person\'s visible display name or null,',
    ' "messages": [{"role": "client" or "me", "text": "...", "screenshot_indices": [1]}],',
    ' "tone": one word for how the client sounds, or null}',
    'Rules: only state what the screenshots show. A name that is not visible is null.',
    'Screenshot indices are 1-based positions in the supplied image order.',
    'Every message must include at least one valid screenshot index.',
    'List each message once. If a message bubble appears in overlapping screenshots,',
    'include every screenshot index where that same bubble is visible.',
    'Preserve the visible words, punctuation, and message order. Do not invent unreadable text.',
    'If the images do not show a conversation, messages is an empty array.',
  ].join('\n');
}

/** Backwards-compatible single-image prompt. */
export const VISION_PROMPT = buildVisionPrompt(1);

/** Accepts the model's JSON, tolerating fences and prose around it. */
export function parseVisionJson(raw: string, imageCount = 1): VisionExtraction | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;

  const platformRaw = typeof record.platform === 'string' ? record.platform.toLowerCase() : '';
  const platform: Channel | 'unknown' = (CHANNELS as readonly string[]).includes(platformRaw)
    ? (platformRaw as Channel)
    : 'unknown';

  const clientName =
    typeof record.client_name === 'string' && record.client_name.trim().length > 0
      ? record.client_name.trim().slice(0, 120)
      : null;

  const rawMessages = Array.isArray(record.messages) ? record.messages : [];
  const messages: VisionMessage[] = [];
  for (const entry of rawMessages) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    const role = item.role === 'me' ? 'me' : item.role === 'client' ? 'client' : null;
    if (text.length === 0 || !role) continue;

    const hasDeclaredSources = Array.isArray(item.screenshot_indices);
    const declaredIndices = hasDeclaredSources ? item.screenshot_indices as unknown[] : [1];
    const screenshotIndices = [...new Set(declaredIndices
      .filter((index): index is number =>
        typeof index === 'number' && Number.isInteger(index) && index >= 1 && index <= imageCount,
      )
      .map((index) => index - 1))].sort((a, b) => a - b);
    if (imageCount > 1 && (!hasDeclaredSources || screenshotIndices.length === 0)) return null;

    messages.push({
      role,
      text: text.slice(0, 2000),
      screenshotIndices: screenshotIndices.length > 0 ? screenshotIndices : [0],
    });
  }

  const tone = typeof record.tone === 'string' && record.tone.trim() ? record.tone.trim().slice(0, 40) : null;

  if (platform === 'unknown' && !clientName && messages.length === 0) return null;
  return { platform, clientName, messages, tone };
}
