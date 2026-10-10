import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';
import { embedTexts } from '@/lib/ai/embed';

export type SearchHit = {
  message_id: string;
  thread_id: string;
  thread_title: string;
  client_id: string | null;
  client_name: string | null;
  role: string;
  channel: string | null;
  content: string;
  snippet: string;
  sent_at: string;
  rank: number;
};

/**
 * Search across every client conversation.
 *
 * Hybrid by design: full text search stays the backbone because exact words
 * (a price, a store link, a name) must always win, then semantic recall fills
 * the remaining slots with messages that mean the same thing using different
 * words. Both layers fail soft: no key, no pgvector migration, no network,
 * any of it and the other layer still answers.
 */
export async function searchMessages(query: string, limit = 40): Promise<SearchHit[]> {
  if (!SUPABASE_CONFIGURED) return [];

  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const capped = Math.min(Math.max(limit, 1), 100);
  const textHits = await textSearch(trimmed, capped);
  const semanticHits = await semanticSearch(trimmed, capped);
  return mergeHits(textHits, semanticHits, capped);
}

/** Text hits keep their order, semantic hits fill what is left. Deduplicated. */
export function mergeHits(
  textHits: SearchHit[],
  semanticHits: SearchHit[] | null,
  limit: number,
): SearchHit[] {
  const merged = [...textHits];
  if (semanticHits) {
    const seen = new Set(textHits.map((hit) => hit.message_id));
    for (const hit of semanticHits) {
      if (merged.length >= limit) break;
      if (seen.has(hit.message_id)) continue;
      seen.add(hit.message_id);
      merged.push(hit);
    }
  }
  return merged.slice(0, limit);
}

async function textSearch(query: string, limit: number): Promise<SearchHit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_messages', {
    p_query: query,
    p_limit: limit,
  });

  if (error) {
    console.error('[search] text search failed', error.message);
    return [];
  }

  return (data ?? []) as SearchHit[];
}

async function semanticSearch(query: string, limit: number): Promise<SearchHit[] | null> {
  const { embeddings } = await embedTexts([query]);
  if (!embeddings) return null;

  const vector = embeddings[0];
  if (!vector) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_messages_semantic', {
    p_embedding: vector,
    p_limit: limit,
  });

  // A missing function just means the pgvector migration has not been applied
  // yet. That is an expected state, not a failure worth logging loudly.
  if (error) return null;

  return (data ?? []) as SearchHit[];
}
