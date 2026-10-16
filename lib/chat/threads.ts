/**
 * Where a chat capture lands: an existing thread for the same platform, a
 * single channel-less thread, or a brand new one. Plus the dedupe key that
 * keeps a screenshot from doubling messages that were already saved.
 */

export function normaliseContent(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Normalises names from OCR without losing accented characters. */
export function normaliseClientName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** True when the last saved client message is exactly the text being pasted. */
export function isLatestClientMessage(messages: { role: string; content: string }[], incoming: string): boolean {
  const latest = [...messages].reverse().find((message) => message.role === 'client' || message.role === 'me');
  return Boolean(latest?.role === 'client' && dedupeKey('client', latest.content) === dedupeKey('client', incoming));
}

export function dedupeKey(role: string, content: string): string {
  return `${role}:${normaliseContent(content)}`;
}

export type ThreadChannelInfo = {
  id: string;
  title: string;
  /** Channel of the newest message that has one, null when the thread is empty. */
  channel: string | null;
};

/**
 * The caller sorts threads by updated_at descending, so the first match is
 * the freshest conversation on that platform.
 */
export function pickThread(
  threads: ThreadChannelInfo[],
  platform: string,
): ThreadChannelInfo | null {
  const matching = threads.filter((thread) => thread.channel === platform);
  if (matching.length > 0) return matching[0] ?? null;

  // A single thread that never recorded a channel can adopt the conversation.
  if (threads.length === 1) {
    const only = threads[0];
    if (only && only.channel === null) return only;
  }
  return null;
}
