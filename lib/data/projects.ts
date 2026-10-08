import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';

export type ProjectListItem = {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  clients: { name: string } | null;
  steps: { status: string }[];
};

export async function getProjects(): Promise<{ projects: ProjectListItem[]; ready: boolean }> {
  if (!SUPABASE_CONFIGURED) return { projects: [], ready: false };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projects')
    .select('id, title, status, deadline, clients(name), steps:project_steps(status)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return { projects: [], ready: false };

  return { projects: (data ?? []) as unknown as ProjectListItem[], ready: true };
}
