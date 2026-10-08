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

/**
 * Just enough about a client's live projects for a reply draft to be accurate.
 *
 * Deliberately narrow. The assistant needs to know what it is working on with
 * this person and what the next step is; it does not need the whole project
 * list, and it must never see another client's work.
 */
export type ClientProjectContext = {
  title: string;
  status: string;
  goal: string | null;
  next_step: string | null;
};

export async function getClientProjectContext(
  clientId: string,
): Promise<ClientProjectContext[]> {
  if (!SUPABASE_CONFIGURED) return [];
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('title, status, brief_json, deliverables, deadline')
    .eq('client_id', clientId)
    .not('status', 'in', '(delivered,cancelled)')
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error || !data) return [];

  return (data as unknown as {
    title: string;
    status: string;
    brief_json: { goal?: string; next_step?: string } | null;
    deliverables: string[] | null;
    deadline: string | null;
  }[]).map((row) => {
    const goal =
      row.brief_json?.goal ??
      (row.deliverables && row.deliverables.length > 0
        ? `Deliverables: ${row.deliverables.join(', ')}`
        : null);
    const next =
      row.brief_json?.next_step ?? (row.deadline ? `Due ${row.deadline}` : null);
    return { title: row.title, status: row.status, goal, next_step: next };
  });
}

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
