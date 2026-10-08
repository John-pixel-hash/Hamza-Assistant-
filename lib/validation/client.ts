/**
 * Client form rules. Pure functions, so they can be tested without a database
 * and reused by the AI layer later when it proposes values.
 */
import {
  CHANNELS,
  SOURCES,
  STAGES,
  isChannel,
  isMessageRole,
  isStage,
  type Channel,
  type MessageRole,
} from '@/lib/domain';

export type ClientFormValues = {
  name: string;
  company: string | null;
  stage: string;
  source: string | null;
  channel: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  dealValueMinor: number | null;
  currency: string;
  tags: string[];
  notes: string | null;
};

export type ValidationResult =
  | { ok: true; values: ClientFormValues }
  | { ok: false; error: string };

/**
 * Parses what a person actually types into a value in minor units.
 * Accepts: 1500, 1,500, 1.5k, 12k, $1,500, 1500 usd. Returns null for blank.
 * Returns NaN when it cannot be understood, so the caller can complain.
 */
export function parseDealValue(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;

  const cleaned = input
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[$€£₦,\s]/g, '')
    .replace(/(usd|ngn|eur|gbp|dollars?|naira)$/i, '');

  if (cleaned === '') return null;

  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!match) return Number.NaN;

  const base = Number(match[1]);
  const scale = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : 1;
  const amount = base * scale;

  if (!Number.isFinite(amount) || amount < 0) return Number.NaN;

  // Money is stored in minor units as an integer, never as a float.
  return Math.round(amount * 100);
}

export function normaliseTags(input: string | null | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input.split(',')) {
    const tag = raw.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag.slice(0, 40));
  }
  return tags.slice(0, 20);
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === '' ? null : value;
}

export function validateClientForm(formData: FormData): ValidationResult {
  const name = text(formData, 'name');
  if (name.length < 2) {
    return { ok: false, error: 'A client needs a name. It can be a person or a company.' };
  }
  if (name.length > 120) {
    return { ok: false, error: 'That name is too long. Keep it under 120 characters.' };
  }

  const stageInput = text(formData, 'stage') || 'lead';
  if (!isStage(stageInput)) {
    return { ok: false, error: `Unknown stage: ${stageInput}` };
  }

  const sourceInput = text(formData, 'source');
  if (sourceInput && !(SOURCES as readonly string[]).includes(sourceInput)) {
    return { ok: false, error: `Unknown source: ${sourceInput}` };
  }

  const channelInput = text(formData, 'channel');
  if (channelInput && (!isChannel(channelInput) || !(CHANNELS as readonly string[]).includes(channelInput))) {
    return { ok: false, error: `Unknown channel: ${channelInput}` };
  }

  const dealValue = parseDealValue(text(formData, 'deal_value'));
  if (dealValue !== null && Number.isNaN(dealValue)) {
    return {
      ok: false,
      error: 'I could not read that deal value. Try 1500, 1,500 or 1.5k.',
    };
  }

  const currency = (text(formData, 'currency') || 'USD').toUpperCase().slice(0, 3);

  return {
    ok: true,
    values: {
      name,
      company: optional(formData, 'company'),
      stage: stageInput,
      source: optional(formData, 'source'),
      channel: optional(formData, 'channel'),
      country: optional(formData, 'country'),
      email: optional(formData, 'email'),
      phone: optional(formData, 'phone'),
      dealValueMinor: dealValue,
      currency,
      tags: normaliseTags(text(formData, 'tags')),
      notes: optional(formData, 'notes'),
    },
  };
}

export type MessageValues = {
  content: string;
  role: MessageRole;
  channel: Channel | null;
};

export type MessageValidation =
  | { ok: true; values: MessageValues }
  | { ok: false; error: string };

export function validateMessageForm(formData: FormData): MessageValidation {
  const content = text(formData, 'content');
  if (!content) {
    return { ok: false, error: 'Nothing to save. Type or paste the message first.' };
  }
  if (content.length > 20_000) {
    return { ok: false, error: 'That is very long. Split it into separate messages.' };
  }

  const roleInput = text(formData, 'role') || 'client';
  if (!isMessageRole(roleInput)) {
    return { ok: false, error: `Unknown message type: ${roleInput}` };
  }

  const channelInput = text(formData, 'channel');
  let channel: Channel | null = null;
  if (channelInput) {
    if (!isChannel(channelInput)) {
      return { ok: false, error: `Unknown channel: ${channelInput}` };
    }
    channel = channelInput;
  }

  return { ok: true, values: { content, role: roleInput, channel } };
}

export const STAGE_OPTIONS = STAGES;
