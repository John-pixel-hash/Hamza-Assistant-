import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';

export type ClientListItem = {
  id: string;
  name: string;
  company: string | null;
  country: string | null;
  stage: string;
  source: string | null;
  channel: string | null;
  tags: string[] | null;
  deal_value_estimate: number | null;
  currency: string | null;
  last_contact_at: string | null;
  last_message_at: string | null;
  last_message: string | null;
  last_message_role: string | null;
  client_message_count: number;
  my_message_count: number;
  thread_count: number;
  open_projects: number;
  summary: string | null;
};

export type ClientDetail = ClientListItem & {
  country: string | null;
  notes: string | null;
};

export type ListOptions = {
  q?: string;
  stage?: string;
  limit?: number;
};

const LIST_COLUMNS =
  'id, name, company, country, stage, source, channel, tags, deal_value_estimate, currency, ' +
  'last_contact_at, last_message_at, last_message, last_message_role, ' +
  'client_message_count, my_message_count, thread_count, open_projects, summary';

function escapeForFilter(value: string): string {
  // PostgREST treats these characters as filter syntax. They must be neutralised
  // so a client name containing a comma or bracket cannot alter the query.
  return value.replace(/[,()*\\]/g, ' ').replace(/"/g, '').trim();
}

export async function getClients(
  options: ListOptions = {},
): Promise<{ clients: ClientListItem[]; ready: boolean; filtered: boolean }> {
  if (!SUPABASE_CONFIGURED) return { clients: [], ready: false, filtered: false };

  const supabase = await createClient();
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);

  let query = supabase.from('client_overview').select(LIST_COLUMNS).limit(limit);

  const stage = options.stage?.trim();
  if (stage) query = query.eq('stage', stage);

  const q = options.q ? escapeForFilter(options.q) : '';
  if (q) query = query.or(`name.ilike.%${q}%,company.ilike.%${q}%`);

  // stage_rank is declared by the view, so cold outreach always sits below real
  // work regardless of how the stages happen to be named. Within a stage, the
  // most recent activity wins.
  query = query
    .order('stage_rank', { ascending: true })
    .order('last_message_at', { ascending: false, nullsFirst: false });

  const { data, error } = await query;

  if (error) {
    console.error('[clients] list failed', error.message);
    return { clients: [], ready: false, filtered: false };
  }

  return {
    clients: (data ?? []) as unknown as ClientListItem[],
    ready: true,
    filtered: Boolean(stage || q),
  };
}

export async function getClientDetail(
  id: string,
): Promise<{ client: ClientDetail | null; ready: boolean }> {
  if (!SUPABASE_CONFIGURED) return { client: null, ready: false };

  // Guard against a malformed id reaching the database.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return { client: null, ready: true };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_overview')
    .select(`${LIST_COLUMNS}, country, notes`)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[clients] detail failed', error.message);
    return { client: null, ready: false };
  }

  return { client: (data as unknown as ClientDetail) ?? null, ready: true };
}

export type ClientFact = {
  id: string;
  key: string;
  value: string;
  confidence: number;
  is_pinned: boolean;
  updated_at: string;
};

export async function getClientFacts(clientId: string): Promise<ClientFact[]> {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_facts')
    .select('id, key, value, confidence, is_pinned, updated_at')
    .eq('client_id', clientId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as ClientFact[];
}

export type ClientMessage = {
  message_id: string;
  thread_id: string;
  thread_title: string;
  role: string;
  channel: string | null;
  content: string;
  sent_at: string;
};

/** The full conversation for one client, newest first, across every thread. */
export async function getClientMessages(clientId: string, limit = 100): Promise<ClientMessage[]> {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('client_messages', {
    p_client_id: clientId,
    p_limit: limit,
  });

  if (error) {
    console.error('[clients] timeline failed', error.message);
    return [];
  }
  return (data ?? []) as ClientMessage[];
}
