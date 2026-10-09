import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';

export type ThreadSummary = {
  id: string;
  title: string;
  mode: string;
  status: string;
  updated_at: string;
  message_count: number;
  last_message_at: string | null;
};

export type MessageRow = {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  channel: string | null;
  sent_at: string | null;
  created_at: string;
};

export type AttachmentRow = {
  id: string;
  message_id: string | null;
  storage_path: string;
  original_name: string | null;
  kind: string;
  size_bytes: number | null;
  extracted_text: string | null;
  /** Short lived signed URL, or null when storage is unreachable. */
  url: string | null;
};

export async function getClientThreads(clientId: string): Promise<ThreadSummary[]> {
  if (!SUPABASE_CONFIGURED) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('threads')
    .select('id, title, mode, status, updated_at, messages(id, sent_at, created_at)')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[threads] list failed', error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const messages = (row.messages ?? []) as { sent_at: string | null; created_at: string }[];
    const times = messages.map((m) => m.sent_at ?? m.created_at).sort();
    return {
      id: row.id as string,
      title: row.title as string,
      mode: row.mode as string,
      status: row.status as string,
      updated_at: row.updated_at as string,
      message_count: messages.length,
      last_message_at: times.length > 0 ? (times[times.length - 1] as string) : null,
    };
  });
}

/**
 * The newest thread id per client, in one query. The dashboard uses this so a
 * row in Needs attention opens the conversation itself, one tap from the reply
 * panel, instead of the client page.
 */
export async function latestThreadIdsForClients(
  clientIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!SUPABASE_CONFIGURED || clientIds.length === 0) return result;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('threads')
    .select('id, client_id, updated_at')
    .in('client_id', clientIds)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[threads] latest per client failed', error.message);
    return result;
  }

  // Rows arrive newest first, so the first one seen per client is the latest.
  for (const row of data ?? []) {
    const clientId = row.client_id as string | null;
    if (!clientId || result.has(clientId)) continue;
    result.set(clientId, row.id as string);
  }
  return result;
}

export type ThreadDetail = {
  thread: {
    id: string;
    title: string;
    mode: string;
    status: string;
    client_id: string | null;
  };
  client: {
    id: string;
    name: string;
    company: string | null;
    stage: string;
    source: string | null;
    channel: string | null;
  } | null;
  messages: MessageRow[];
  attachments: AttachmentRow[];
};

export async function getThread(id: string): Promise<ThreadDetail | null> {
  if (!SUPABASE_CONFIGURED) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const supabase = await createClient();

  const { data: thread, error } = await supabase
    .from('threads')
    .select('id, title, mode, status, client_id, clients(id, name, company, stage, source, channel)')
    .eq('id', id)
    .maybeSingle();

  if (error || !thread) {
    if (error) console.error('[threads] detail failed', error.message);
    return null;
  }

  const { data: messages, error: messageError } = await supabase
    .from('messages')
    .select('id, thread_id, role, content, channel, sent_at, created_at')
    .eq('thread_id', id)
    .order('sent_at', { ascending: true })
    .order('created_at', { ascending: true });

  if (messageError) {
    console.error('[threads] messages failed', messageError.message);
    return null;
  }

  const messageIds = (messages ?? []).map((m) => m.id as string);

  let attachments: AttachmentRow[] = [];
  if (messageIds.length > 0) {
    const { data: rows } = await supabase
      .from('attachments')
      .select('id, message_id, storage_path, original_name, kind, size_bytes, extracted_text')
      .in('message_id', messageIds)
      .order('created_at', { ascending: true });

    attachments = ((rows ?? []) as Omit<AttachmentRow, 'url'>[]).map((row) => ({ ...row, url: null }));

    // Files are private. Each one needs a short lived signed link.
    if (attachments.length > 0) {
      const paths = attachments.map((a) => a.storage_path);
      const { data: signed } = await supabase.storage
        .from('attachments')
        .createSignedUrls(paths, 60 * 60);

      if (signed) {
        const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
        attachments = attachments.map((a) => ({
          ...a,
          url: a.storage_path ? byPath.get(a.storage_path) ?? null : null,
        }));
      }
    }
  }

  // PostgREST types a to-one relation as an array, so the cast goes through unknown.
  const client = (thread.clients ?? null) as unknown as ThreadDetail['client'];

  return {
    thread: {
      id: thread.id as string,
      title: thread.title as string,
      mode: thread.mode as string,
      status: thread.status as string,
      client_id: (thread.client_id as string) ?? null,
    },
    client,
    messages: (messages ?? []) as MessageRow[],
    attachments,
  };
}
