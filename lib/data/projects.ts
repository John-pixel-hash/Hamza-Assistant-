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

export type ProjectQuestion = {
  id: string;
  question: string;
  why_it_matters: string;
  status: 'open' | 'sent' | 'answered' | 'dismissed';
  answer: string | null;
};

export type ChecklistItem = { item: string; done: boolean };

/**
 * The checklist is jsonb, and two shapes have existed: the planner writes
 * objects with a done flag, early fixtures were plain strings. Both read.
 */
export function normaliseChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const out: ChecklistItem[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim() !== '') {
      out.push({ item: entry.trim(), done: false });
    } else if (entry && typeof entry === 'object') {
      const item = (entry as { item?: unknown }).item;
      const done = (entry as { done?: unknown }).done === true;
      if (typeof item === 'string' && item.trim() !== '') {
        out.push({ item: item.trim(), done });
      }
    }
    if (out.length >= 8) break;
  }
  return out;
}

export type ProjectStep = {
  id: string;
  position: number;
  title: string;
  detail: string | null;
  method: string | null;
  method_source: string | null;
  estimate_minutes: number | null;
  status: 'not_started' | 'in_progress' | 'blocked' | 'review' | 'done';
  blocked_reason: string | null;
  quality_checklist: ChecklistItem[];
};

export type ResearchNote = {
  id: string;
  query: string;
  summary: string;
  sources: { url: string; title?: string }[];
  created_at: string;
};

export type ProjectDetail = {
  id: string;
  title: string;
  status: string;
  brief: string | null;
  brief_json: {
    goal?: string;
    deliverables?: string[];
    constraints?: string[];
    success?: string[];
    next_step?: string;
    deadline_risk?: string | null;
    planning_assumptions?: string[];
  } | null;
  deliverables: string[];
  deadline: string | null;
  budget_amount: number | null;
  currency: string | null;
  client: { id: string; name: string } | null;
  questions: ProjectQuestion[];
  steps: ProjectStep[];
  research: ResearchNote[];
};

/**
 * Everything the project page renders, in one round trip where possible.
 * The research note query tolerates a missing project_id column so the page
 * keeps working on a database where migration 0007 has not run yet.
 */
export async function getProject(id: string): Promise<ProjectDetail | null> {
  if (!SUPABASE_CONFIGURED) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, title, status, brief, brief_json, deliverables, deadline, budget_amount, currency, ' +
        'clients(id, name), ' +
        'questions:project_questions(id, question, why_it_matters, status, answer), ' +
        'steps:project_steps(id, position, title, detail, method, method_source, estimate_minutes, status, blocked_reason, quality_checklist)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    id: string;
    title: string;
    status: string;
    brief: string | null;
    brief_json: ProjectDetail['brief_json'];
    deliverables: string[] | null;
    deadline: string | null;
    budget_amount: number | null;
    currency: string | null;
    clients: { id: string; name: string } | null;
    questions: ProjectQuestion[] | null;
    steps: (Omit<ProjectStep, 'quality_checklist'> & { quality_checklist: unknown })[] | null;
  };

  const steps: ProjectStep[] = (row.steps ?? [])
    .map((step) => ({
      ...step,
      quality_checklist: normaliseChecklist(step.quality_checklist),
    }))
    .sort((a, b) => a.position - b.position);

  // Tolerated failure: before migration 0007 the column does not exist and
  // this query errors. The rest of the page must still render.
  let research: ResearchNote[] = [];
  const researchQuery = await supabase
    .from('research_notes')
    .select('id, query, summary, sources, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .limit(10);
  if (!researchQuery.error && researchQuery.data) {
    research = (researchQuery.data as unknown as ResearchNote[]).map((note) => ({
      ...note,
      sources: Array.isArray(note.sources) ? note.sources.slice(0, 6) : [],
    }));
  }

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    brief: row.brief,
    brief_json: row.brief_json,
    deliverables: row.deliverables ?? [],
    deadline: row.deadline,
    budget_amount: row.budget_amount,
    currency: row.currency,
    client: row.clients ?? null,
    questions: (row.questions ?? []) as ProjectQuestion[],
    steps,
    research,
  };
}
