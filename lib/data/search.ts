import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';

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
 * Full text search across every client conversation.
 * Multiple words behave like a web search: all must appear unless OR is used.
 */
export async function searchMessages(query: string, limit = 40): Promise<SearchHit[]> {
  if (!SUPABASE_CONFIGURED) return [];

  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_messages', {
    p_query: trimmed,
    p_limit: Math.min(Math.max(limit, 1), 100),
  });

  if (error) {
    console.error('[search] failed', error.message);
    return [];
  }

  return (data ?? []) as SearchHit[];
}
