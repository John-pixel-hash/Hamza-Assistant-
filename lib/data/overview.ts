import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';

export type ClientRow = {
  id: string;
  name: string;
  company: string | null;
  stage: string;
  last_contact_at: string | null;
  open_projects: number;
  last_message?: string | null;
};

export type FollowUpRow = {
  client_id: string;
  name: string;
  followup_state: string;
  since_last_contact: string | null;
};

export type Overview = {
  connected: boolean;
  schemaReady: boolean;
  userEmail: string | null;
  counts: {
    clients: number;
    activeProjects: number;
    messagesThisWeek: number;
    openQuestions: number;
    playbooksWritten: number;
  };
  recentClients: ClientRow[];
  followUps: FollowUpRow[];
};

const EMPTY: Overview = {
  connected: false,
  schemaReady: false,
  userEmail: null,
  counts: {
    clients: 0,
    activeProjects: 0,
    messagesThisWeek: 0,
    openQuestions: 0,
    playbooksWritten: 0,
  },
  recentClients: [],
  followUps: [],
};

/**
 * Everything the dashboard needs, in one place.
 *
 * Fails soft: if Supabase is unreachable or the migrations have not been run
 * yet, the dashboard still renders and tells you what to do instead of
 * throwing an error page.
 */
export async function getOverview(): Promise<Overview> {
  if (!SUPABASE_CONFIGURED) return EMPTY;

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return EMPTY;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return EMPTY;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [clients, projects, messages, questions, playbooks, recent, followUps] =
    await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', '("delivered","cancelled")'),
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'user')
        .gte('created_at', weekAgo),
      supabase.from('project_questions').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('playbooks').select('slug, content').eq('active', true),
      supabase
        .from('client_overview')
        .select('id, name, company, stage, last_contact_at, open_projects, last_message')
        .order('last_contact_at', { ascending: false, nullsFirst: false })
        .limit(5),
      supabase
        .from('pending_followups')
        .select('client_id, name, followup_state, since_last_contact')
        .neq('followup_state', 'ok')
        .limit(5),
    ]);

  // If the very first query says the table is missing, the migrations have not
  // been run against this project yet.
  const schemaReady = !clients.error;

  const written = (playbooks.data ?? []).filter((p) => (p.content ?? '').trim().length > 200).length;

  return {
    connected: true,
    schemaReady,
    userEmail: user.email ?? null,
    counts: {
      clients: clients.count ?? 0,
      activeProjects: projects.count ?? 0,
      messagesThisWeek: messages.count ?? 0,
      openQuestions: questions.count ?? 0,
      playbooksWritten: written,
    },
    recentClients: (recent.data ?? []) as ClientRow[],
    followUps: (followUps.data ?? []) as FollowUpRow[],
  };
}
