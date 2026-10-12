/**
 * The knowledge loader: picks the playbooks that match the request, and says
 * honestly when their time sensitive parts are stale.
 *
 * Pure on purpose. The rows come from the data layer; everything here can be
 * tested with a clock and a list.
 */

export type PlaybookLike = {
  slug: string;
  title: string;
  content: string;
  trigger_keywords: string[];
  has_time_sensitive: boolean;
  last_researched_at: string | null;
};

/**
 * The freshness policy from the design doc: ad policy and pricing rot in two
 * weeks, platform behaviour in a month, benchmarks in a quarter. Fundamentals
 * (sales psychology, design craft, strategy) carry no window at all.
 */
export const FRESHNESS_WINDOWS: Record<string, number> = {
  'meta-ads': 14,
  'google-ads': 14,
  'email-marketing': 30,
  'fiverr-client-management': 30,
  ecommerce: 30,
  'web-development': 30,
  'graphic-design': 90,
  'marketing-strategy': 90,
  'sales-closing': 90,
};

export function freshnessWindowDays(slug: string): number {
  return FRESHNESS_WINDOWS[slug] ?? 90;
}

export function freshnessState(
  row: Pick<PlaybookLike, 'slug' | 'has_time_sensitive' | 'last_researched_at'>,
  nowMs: number,
): { windowDays: number; stale: boolean } {
  const windowDays = freshnessWindowDays(row.slug);
  if (!row.has_time_sensitive || !row.last_researched_at) {
    return { windowDays, stale: false };
  }
  const age = nowMs - new Date(row.last_researched_at).getTime();
  return { windowDays, stale: age > windowDays * 24 * 3600 * 1000 };
}

/** Scores a request against the playbooks and keeps the two best matches. */
export function selectPlaybooks(
  text: string,
  rows: PlaybookLike[],
  cap = 2,
): PlaybookLike[] {
  const lowered = ` ${text.toLowerCase()} `;
  const scored = rows
    .map((row) => {
      let score = 0;
      for (const keyword of row.trigger_keywords) {
        const k = keyword.toLowerCase().trim();
        if (k.length > 0 && lowered.includes(k)) score += 1;
      }
      return { row, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, cap).map((entry) => entry.row);
}

/** The questions a playbook asks the research engine when refreshed. */
export function parseRefreshQueries(content: string): string[] {
  const lines = content.split('\n');
  const queries: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s/i.test(trimmed)) {
      inSection = /research refresh/i.test(trimmed);
      continue;
    }
    if (inSection && trimmed.startsWith('-') && trimmed.length > 4) {
      queries.push(trimmed.replace(/^-\s*/, '').slice(0, 300));
      if (queries.length >= 2) break;
    }
  }
  return queries;
}

/** Removes earlier verification notes so only the newest one rides along. */
export function stripVerifiedSections(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^##\s+verified/i.test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping && /^##\s/i.test(line.trim())) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * The block that lands in the model's prompt: at most two playbooks, whole
 * and practical, with a stale warning instead of false freshness.
 */
export function buildKnowledgeBlock(
  text: string,
  rows: PlaybookLike[],
  nowMs = Date.now(),
): string {
  const selected = selectPlaybooks(text, rows);
  if (selected.length === 0) return '';

  const blocks = selected.map((row) => {
    const { stale, windowDays } = freshnessState(row, nowMs);
    const body = stripVerifiedSections(row.content);
    const note =
      row.has_time_sensitive && stale
        ? `\nNOTE: the platform specific numbers in this playbook are older than ${windowDays} days. Treat them as direction, verify current figures with research before citing them.`
        : '';
    return `### Playbook: ${row.title}\n${body}${note}`;
  });

  return ['Operating knowledge, loaded because it matches this request:', ...blocks].join('\n\n');
}
