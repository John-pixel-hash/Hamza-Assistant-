/**
 * Search snippets come back from Postgres with [[[ and ]]] around the matched
 * words. Client messages are untrusted text, so the app never injects HTML.
 * It splits the snippet into plain segments and lets React render the marks.
 */

export type Segment = { text: string; marked: boolean };

const OPEN = '[[[';
const CLOSE = ']]]';

export function splitHighlights(snippet: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < snippet.length) {
    const open = snippet.indexOf(OPEN, cursor);

    if (open === -1) {
      push(segments, snippet.slice(cursor), false);
      break;
    }

    push(segments, snippet.slice(cursor, open), false);

    const close = snippet.indexOf(CLOSE, open + OPEN.length);
    if (close === -1) {
      // Unbalanced marker: treat the rest as plain text rather than dropping it.
      push(segments, snippet.slice(open), false);
      break;
    }

    push(segments, snippet.slice(open + OPEN.length, close), true);
    cursor = close + CLOSE.length;
  }

  return segments.filter((s) => s.text.length > 0);
}

function push(list: Segment[], text: string, marked: boolean) {
  if (!text) return;
  const last = list[list.length - 1];
  if (last && last.marked === marked) {
    last.text += text;
    return;
  }
  list.push({ text, marked });
}

/** Plain text version, for places that cannot render segments. */
export function stripHighlightMarkers(snippet: string): string {
  return snippet.split(OPEN).join('').split(CLOSE).join('');
}

/**
 * Reads a Postgres interval such as "3 days 04:12:00" into a short phrase.
 * Used on the follow up list, where precision beyond days is noise.
 */
export function humaniseInterval(value: string | null | undefined): string {
  if (!value) return '';
  if (value.includes('day')) {
    const days = Number(value.match(/(\d+)\s+day/)?.[1] ?? '0');
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  const hours = Number(value.match(/(\d+):/)?.[1] ?? '0');
  if (hours === 0) return 'just now';
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

/** Formats an amount held in minor units, for example 150000 with USD -> $1,500 */
export function formatMoney(minor: number | null | undefined, currency: string | null): string | null {
  if (minor === null || minor === undefined) return null;
  const code = (currency ?? 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(0)} ${code}`;
  }
}

/** Truncates a message for a list preview, on a word boundary. */
export function preview(text: string | null | undefined, max = 120): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max)}...`;
}
