import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';

import type { PlaybookLike } from '@/lib/ai/knowledge';

export type PlaybookRow = PlaybookLike & {
  id: string;
  version: number;
  active: boolean;
  updated_at: string;
};

/** Active playbooks for the signed in owner, for prompt loading. */
export async function getActivePlaybooks(): Promise<PlaybookLike[]> {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('playbooks')
    .select('slug, title, content, trigger_keywords, has_time_sensitive, last_researched_at')
    .eq('active', true)
    .order('title');
  if (error || !data) return [];
  return (data as unknown as PlaybookLike[]).map((row) => ({
    ...row,
    trigger_keywords: Array.isArray(row.trigger_keywords) ? row.trigger_keywords : [],
  }));
}

/** Every playbook, including inactive ones, for the knowledge page. */
export async function getAllPlaybooks(): Promise<{ playbooks: PlaybookRow[]; ready: boolean }> {
  if (!SUPABASE_CONFIGURED) return { playbooks: [], ready: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('playbooks')
    .select(
      'id, slug, title, version, content, trigger_keywords, has_time_sensitive, last_researched_at, active, updated_at',
    )
    .order('title');
  if (error || !data) return { playbooks: [], ready: false };
  return {
    playbooks: (data as unknown as PlaybookRow[]).map((row) => ({
      ...row,
      trigger_keywords: Array.isArray(row.trigger_keywords) ? row.trigger_keywords : [],
    })),
    ready: true,
  };
}
