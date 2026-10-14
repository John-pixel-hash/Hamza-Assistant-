/**
 * The pure half of the memory engine: the extraction prompt, the parser and
 * the merge planner. No network, no database, so all of it is unit tested.
 *
 * The rule that matters: memory only stores what somebody stated. An inferred
 * fact is a guess wearing a uniform, and a guess remembered forever is worse
 * than none, because future drafts will trust it.
 */

export type FactConfidence = 'high' | 'medium';

export type ExtractedFact = {
  key: string;
  value: string;
  confidence: FactConfidence;
};

export type ExistingFact = {
  id: string;
  key: string;
  value: string;
  confidence: number;
  is_pinned: boolean;
};

/** Reserved key: the rolling relationship summary lives in client_facts so it
 * rides the same injection path into drafts, but the fact sheet UI renders it
 * as prose, not as a row he has to govern. */
export const RELATIONSHIP_SUMMARY_KEY = 'relationship_summary';

export const CONFIDENCE_VALUE: Record<FactConfidence, number> = {
  high: 0.9,
  medium: 0.6,
};

function memorySlice(messages: { role: string; content: string }[]): string {
  return messages
    .filter((message) => ['client', 'me', 'note'].includes(message.role))
    .map((message) => {
      const speaker = message.role === 'me' ? 'HAMZA' : message.role === 'note' ? 'PRIVATE NOTE' : 'CLIENT';
      return `${speaker}: ${message.content}`;
    })
    .join('\n')
    .slice(-6000);
}

export function buildMemoryPrompt(messages: { role: string; content: string }[]): string {
  const slice = memorySlice(messages);

  return [
    'You are the memory of a one person business. Read this slice of a client',
    'conversation and extract durable facts only: things still true in three',
    'weeks, like country, budget, currency, store link, niche, products,',
    'platform, deadline, what was promised, what was refused, constraints.',
    '',
    'Rules:',
    'Extract only what somebody stated. Never infer, never guess.',
    'Each fact is a short snake_case key plus a value under 120 characters,',
    'in the speaker own meaning, not padded.',
    'confidence is high when directly stated, medium when paraphrased.',
    'At most 8 facts. If nothing durable was said, return an empty array.',
    '',
    'Answer with a JSON array only, like:',
    '[{"key": "country", "value": "Pakistan", "confidence": "high"}]',
    '',
    'Conversation slice:',
    slice,
  ].join('\n');
}

function normaliseKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return key.length >= 3 ? key : null;
}

function normaliseValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.replace(/\s+/g, ' ').trim().slice(0, 160);
  return value.length >= 2 ? value : null;
}

/** Tolerates code fences and a sentence of padding around the JSON array. */
export function parseFacts(raw: string): ExtractedFact[] {
  const cleaned = raw.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Map<string, ExtractedFact>();
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const key = normaliseKey(record.key);
    const value = normaliseValue(record.value);
    if (!key || !value) continue;
    const confidence: FactConfidence =
      String(record.confidence ?? '').toLowerCase() === 'high' ? 'high' : 'medium';
    seen.set(key, { key, value, confidence });
  }
  return [...seen.values()].slice(0, 8);
}

export function buildSummaryPrompt(
  currentSummary: string | null,
  messages: { role: string; content: string }[],
): string {
  const slice = memorySlice(messages);

  return [
    'You keep the rolling summary of this business relationship. Read the',
    'current summary and the newest slice of the conversation, then write the',
    'new current summary in two or three sentences of plain words: who they',
    'are, what was discussed, what was promised, where it stands.',
    'Keep what is still true from the old summary, add what changed, drop what',
    'was resolved. Only state things that were said. No padding, no dashes,',
    'at most 600 characters. Answer with the summary text only.',
    '',
    `Current summary: ${currentSummary ?? 'none yet'}`,
    '',
    'Newest slice:',
    slice,
  ].join('\n');
}

/** The model answers with prose. Trim, de-fence, and refuse tiny answers. */
export function parseSummary(raw: string): string | null {
  const text = raw
    .replace(/```/g, '')
    .replace(/^[\s"'“”]+|[\s"'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 20) return null;
  return text.slice(0, 600);
}

export type FactPlan = {
  inserts: { key: string; value: string; confidence: number }[];
  updates: { id: string; value: string; confidence: number }[];
};

/**
 * Pinned facts are his, and never touched. A stored fact is only replaced by
 * one at least as confident, so a mumbled medium read cannot clobber a high
 * one, and re-extracting the same slice is a no-op.
 */
export function planFactWrites(existing: ExistingFact[], extracted: ExtractedFact[]): FactPlan {
  const byKey = new Map(existing.map((fact) => [fact.key, fact]));
  const plan: FactPlan = { inserts: [], updates: [] };

  for (const fact of extracted) {
    const current = byKey.get(fact.key);
    const score = CONFIDENCE_VALUE[fact.confidence];

    if (current?.is_pinned) continue;
    if (current && score < current.confidence) continue;
    if (current && current.value === fact.value) continue;

    if (current) {
      plan.updates.push({ id: current.id, value: fact.value, confidence: score });
    } else {
      plan.inserts.push({ key: fact.key, value: fact.value, confidence: score });
    }
  }
  return plan;
}
