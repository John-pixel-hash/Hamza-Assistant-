import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';

export type ModelRow = {
  provider: string;
  model_id: string;
  label: string;
  role: string | null;
  input_cost_per_mtok: number | null;
  output_cost_per_mtok: number | null;
};

export type PlaybookRow = { slug: string; title: string; words: number };

export type SystemStatus = {
  email: string | null;
  models: ModelRow[];
  playbooks: PlaybookRow[];
  schemaReady: boolean;
};

export async function getSystemStatus(): Promise<SystemStatus> {
  const empty: SystemStatus = { email: null, models: [], playbooks: [], schemaReady: false };
  if (!SUPABASE_CONFIGURED) return empty;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [models, playbooks] = await Promise.all([
    supabase
      .from('model_registry')
      .select('provider, model_id, label, role, input_cost_per_mtok, output_cost_per_mtok')
      .order('provider', { ascending: true })
      .order('role', { ascending: true }),
    supabase.from('playbooks').select('slug, title, content').eq('active', true).order('slug'),
  ]);

  return {
    email: user?.email ?? null,
    models: (models.data ?? []) as ModelRow[],
    playbooks: (playbooks.data ?? []).map((p) => ({
      slug: p.slug as string,
      title: p.title as string,
      words: countWords((p.content as string) ?? ''),
    })),
    schemaReady: !models.error,
  };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
