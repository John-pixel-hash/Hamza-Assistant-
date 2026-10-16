/**
 * One place for the vocabulary of the business.
 * Labels live here so a screen can never invent its own wording for a stage.
 */

export const STAGES = [
  'outreach',
  'lead',
  'contacted',
  'quoted',
  'negotiating',
  'active',
  'delivered',
  'repeat',
  'lost',
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  outreach: 'Outreach',
  lead: 'Lead',
  contacted: 'Contacted',
  quoted: 'Quoted',
  negotiating: 'Negotiating',
  active: 'Active',
  delivered: 'Delivered',
  repeat: 'Repeat',
  lost: 'Lost',
};

/** Stages that mean real money is in play. Used for emphasis in the list. */
export const HOT_STAGES: Stage[] = ['quoted', 'negotiating'];

export const SOURCES = [
  'fiverr',
  'referral',
  'instagram',
  'cold_email',
  'upwork',
  'linkedin',
  'website',
  'other',
] as const;

export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<Source, string> = {
  fiverr: 'Fiverr',
  referral: 'Referral',
  instagram: 'Instagram',
  cold_email: 'Cold email',
  upwork: 'Upwork',
  linkedin: 'LinkedIn',
  website: 'Website',
  other: 'Other',
};

export const CHANNELS = [
  'fiverr',
  'email',
  'whatsapp',
  'instagram',
  'tiktok',
  'call',
  'linkedin',
  'upwork',
  'other',
] as const;

export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  fiverr: 'Fiverr',
  email: 'Email',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  call: 'Call',
  linkedin: 'LinkedIn',
  upwork: 'Upwork',
  other: 'Other',
};

export const MESSAGE_ROLES = ['client', 'me', 'note'] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  client: 'Client',
  me: 'You',
  note: 'Note',
  assistant: 'Assistant draft',
  system: 'System',
  tool: 'Tool',
};

export const FOLLOWUP_LABELS: Record<string, string> = {
  no_reply_yet: 'No reply yet',
  follow_up_overdue: 'Follow up overdue',
  nudge: 'Worth a nudge',
  check_in: 'Worth a check in',
  ok: 'Up to date',
};

/** Stages where a person has actually engaged. Everything else is cold. */
export const ENGAGED_STAGES: Stage[] = [
  'lead',
  'contacted',
  'quoted',
  'negotiating',
  'active',
  'delivered',
  'repeat',
];

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  intake: 'Intake',
  planned: 'Planned',
  active: 'Active',
  review: 'In review',
  delivered: 'Delivered',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
};

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

export function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

export function isMessageRole(value: string): value is MessageRole {
  return (MESSAGE_ROLES as readonly string[]).includes(value);
}
