import type { Channel, Stage } from '../domain';
import { CHANNEL_LABELS, ROLE_LABELS, STAGE_LABELS } from '../domain';

/**
 * Assembles what the model is told, from data that is already loaded.
 *
 * Pure functions, no database and no model calls, so the exact prompt can be
 * asserted in a test. The cap on history exists because a long conversation
 * would otherwise eat the token budget and the free tier allowance.
 */

export type ContextMessage = {
  role: string;
  content: string;
  sent_at?: string | null;
  channel?: string | null;
};

export type ContextClient = {
  id: string;
  name: string;
  company?: string | null;
  country?: string | null;
  stage?: string | null;
  source?: string | null;
  channel?: string | null;
  currency?: string | null;
  deal_value_estimate?: number | null;
  summary?: string | null;
  notes?: string | null;
};

export type ContextFact = {
  key: string;
  value: string;
  /** Numeric in the database, descriptive in tests. Both are accepted. */
  confidence?: number | string | null;
};

export type ContextProject = {
  title: string;
  status?: string | null;
  goal?: string | null;
  next_step?: string | null;
};

export type ContextInput = {
  client: ContextClient;
  /** The specific conversation. Threads never mix. */
  thread: { id: string; title?: string | null; mode?: string | null };
  messages: ContextMessage[];
  facts?: ContextFact[];
  projects?: ContextProject[];
  /** What the client just sent, when it is not already in messages. */
  incoming?: string | null;
  channel?: Channel | string;
  tone?: string;
  /** How many past messages to include. */
  historyLimit?: number;
};

export type AssembledContext = {
  text: string;
  /** Threads the prompt is built from. Always exactly one. */
  threadId: string;
  includedMessages: number;
  droppedMessages: number;
  /** The last message was theirs, so a reply is owed. */
  awaitingMyReply: boolean;
  currentStage: Stage | string;
  currentChannel: string;
};

const DEFAULT_HISTORY = 20;

/** Long messages are the ones that matter, so they are trimmed, not dropped. */
const MAX_MESSAGE_CHARS = 1200;

function trim(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= MAX_MESSAGE_CHARS
    ? clean
    : `${clean.slice(0, MAX_MESSAGE_CHARS)} ... [cut]`;
}

/**
 * Whether a fact is shaky enough to be labelled as such in the prompt.
 *
 * The database stores confidence as a number, tests and older rows may describe
 * it in words, and anything unlabelled is treated as solid rather than flagged.
 */
function isUncertain(confidence: number | string | null | undefined): boolean {
  if (typeof confidence === 'number') return confidence < 0.6;
  if (typeof confidence === 'string') return ['low', 'uncertain', 'weak'].includes(confidence);
  return false;
}

function money(value: number | null | undefined, currency: string | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${currency ?? 'USD'} ${value}`;
}

/**
 * Everything the model is told about this one conversation.
 *
 * Order is deliberate: who they are, then where the deal is, then the
 * conversation oldest to newest, then the newest message last so it is closest
 * to the instruction and gets the attention.
 */
export function assembleContext(input: ContextInput): AssembledContext {
  const { client, thread, messages, facts = [], projects = [] } = input;
  const limit = input.historyLimit ?? DEFAULT_HISTORY;

  // Saved assistant drafts are useful in the timeline, but were never sent to
  // the client. Keep them out of the conversation and its reply-state logic.
  const ordered = messages
    .filter((message) => !['assistant', 'system', 'tool'].includes(message.role))
    .sort((a, b) => {
      const at = a.sent_at ?? '';
      const bt = b.sent_at ?? '';
      if (at === bt) return 0;
      return at < bt ? -1 : 1;
    });

  const kept = ordered.slice(-limit);
  const dropped = ordered.length - kept.length;

  const lines: string[] = [];

  lines.push('## The client');
  lines.push(`- Name: ${client.name}`);
  if (client.company) lines.push(`- Business: ${client.company}`);
  if (client.country) lines.push(`- Country: ${client.country}`);
  if (client.source) lines.push(`- Came from: ${client.source}`);
  if (client.channel) lines.push(`- Usual channel: ${client.channel}`);
  const value = money(client.deal_value_estimate, client.currency);
  if (value) lines.push(`- Deal value so far: ${value}`);
  lines.push(
    `- Stage: ${STAGE_LABELS[(client.stage ?? 'lead') as Stage] ?? client.stage ?? 'Lead'}`,
  );
  if (client.summary) lines.push(`- Summary on file: ${trim(client.summary)}`);
  if (client.notes) lines.push(`- His own notes: ${trim(client.notes)}`);

  if (facts.length > 0) {
    lines.push('');
    lines.push('## Confirmed facts about them');
    for (const fact of facts) {
      const mark = isUncertain(fact.confidence) ? ' (uncertain)' : '';
      lines.push(`- ${fact.key}: ${fact.value}${mark}`);
    }
  }

  if (projects.length > 0) {
    lines.push('');
    lines.push('## Work in progress with them');
    for (const project of projects) {
      const bits = [project.title];
      if (project.status) bits.push(`status ${project.status}`);
      if (project.goal) bits.push(`goal: ${trim(project.goal)}`);
      if (project.next_step) bits.push(`next step: ${trim(project.next_step)}`);
      lines.push(`- ${bits.join(', ')}`);
    }
  }

  lines.push('');
  lines.push(`## This conversation only (thread: ${thread.title ?? thread.id})`);
  lines.push(
    'Nothing from any other conversation applies here. This is the whole history with this person on this channel.',
  );
  if (dropped > 0) {
    lines.push(`(${dropped} older message${dropped === 1 ? '' : 's'} left out for length.)`);
  }
  lines.push('');

  if (kept.length === 0) {
    lines.push('No messages stored yet. This is the first contact.');
  } else {
    for (const message of kept) {
      const who = ROLE_LABELS[message.role] ?? message.role;
      const when = message.sent_at ? ` (${String(message.sent_at).slice(0, 10)})` : '';
      lines.push(`${who}${when}: ${trim(message.content)}`);
    }
  }

  const last = kept[kept.length - 1];
  const awaitingMyReply = Boolean(last && last.role === 'client');

  if (input.incoming && input.incoming.trim() !== '') {
    lines.push('');
    lines.push('## What they just sent, and what to reply to');
    lines.push(trim(input.incoming));
  } else if (awaitingMyReply && last) {
    lines.push('');
    lines.push('## What to reply to');
    lines.push(
      `The last message is theirs and has no reply yet. Reply to it: "${trim(last.content)}"`,
    );
  } else if (last) {
    lines.push('');
    lines.push(
      'The last message is his. They have not replied yet. Do not chase. Continue from where it stopped, or say what to do next.',
    );
  }

  if (kept.length > 0 || input.incoming) {
    const channelName =
      CHANNEL_LABELS[(input.channel ?? client.channel ?? 'instagram') as Channel] ??
      String(input.channel ?? 'message');
    lines.push('');
    lines.push(`Reply on: ${channelName}.`);
  }

  return {
    text: lines.join('\n'),
    threadId: thread.id,
    includedMessages: kept.length,
    droppedMessages: dropped,
    awaitingMyReply,
    currentStage: client.stage ?? 'lead',
    currentChannel: String(input.channel ?? client.channel ?? 'instagram'),
  };
}
