'use server';

import { revalidatePath } from 'next/cache';

import { parseRefreshQueries, stripVerifiedSections } from '@/lib/ai/knowledge';
import { researchQuestion } from '@/lib/ai/research';
import { getStoredTavilyKey } from '@/lib/data/secrets';
import { SUPABASE_CONFIGURED } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export type KnowledgeFormState = { error: string | null };

const NOT_CONNECTED = {
  error: 'Supabase is not connected, so nothing can be saved yet.',
} as const;

/** Edits a playbook. The version bumps so growth is visible, not silent. */
export async function savePlaybookAction(
  _prev: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const playbookId = String(formData.get('playbook_id') ?? '');
  const content = String(formData.get('content') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(playbookId)) return { error: 'Missing playbook.' };
  if (content.length < 100) return { error: 'That is too short to be operating knowledge.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.' };

  const { data: row, error: findError } = await supabase
    .from('playbooks')
    .select('id, version')
    .eq('id', playbookId)
    .maybeSingle();
  if (findError || !row) return { error: 'That playbook no longer exists.' };

  const { error } = await supabase
    .from('playbooks')
    .update({ content: content.slice(0, 12000), version: (row.version ?? 1) + 1 })
    .eq('id', playbookId);
  if (error) return { error: 'Could not save the playbook.' };

  revalidatePath('/knowledge');
  return { error: null };
}

/** Active playbooks load into prompts. Inactive ones rest on the shelf. */
export async function togglePlaybookAction(
  _prev: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const playbookId = String(formData.get('playbook_id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(playbookId)) return { error: 'Missing playbook.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.' };

  const { data: row, error: findError } = await supabase
    .from('playbooks')
    .select('id, active')
    .eq('id', playbookId)
    .maybeSingle();
  if (findError || !row) return { error: 'That playbook no longer exists.' };

  const { error } = await supabase
    .from('playbooks')
    .update({ active: !row.active })
    .eq('id', playbookId);
  if (error) return { error: 'Could not toggle that playbook.' };

  revalidatePath('/knowledge');
  return { error: null };
}

/**
 * Refreshes a playbook's time sensitive claims through the live research
 * engine. The body stays stable; a dated verification note lands on top,
 * with its sources, and only the newest note rides along.
 */
export async function refreshPlaybookAction(
  _prev: KnowledgeFormState,
  formData: FormData,
): Promise<KnowledgeFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const playbookId = String(formData.get('playbook_id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(playbookId)) return { error: 'Missing playbook.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.' };

  const { data: row, error: findError } = await supabase
    .from('playbooks')
    .select('id, title, content, version')
    .eq('id', playbookId)
    .maybeSingle();
  if (findError || !row) return { error: 'That playbook no longer exists.' };

  const queries = parseRefreshQueries(String(row.content ?? ''));
  if (queries.length === 0) {
    return { error: 'This playbook lists no research refresh questions, so there is nothing to verify.' };
  }

  const storedKey = await getStoredTavilyKey();
  const noteLines: string[] = [];
  for (const query of queries) {
    const result = await researchQuestion(query, {
      tavilyKey: storedKey ?? undefined,
      synthTimeoutMs: 12000,
    });
    if (result.sources.length === 0) continue;
    const sources = result.sources
      .slice(0, 3)
      .map((source) => source.url)
      .join(' | ');
    noteLines.push(
      `- ${query}\n  ${result.answer ?? 'No summary landed; the sources below are worth a read.'}\n  sources: ${sources}`,
    );
  }

  if (noteLines.length === 0) {
    return { error: 'The search came back empty. Try again in a minute, or check the Tavily key in Settings.' };
  }

  const date = new Date().toLocaleDateString('en-GB', { dateStyle: 'medium' });
  const note = `## Verified ${date}\n${noteLines.join('\n')}`;

  const stripped = stripVerifiedSections(String(row.content));
  const lines = stripped.split('\n');
  const headingIndex = lines.findIndex((line) => line.startsWith('# '));
  if (headingIndex >= 0) {
    lines.splice(headingIndex + 1, 0, '', note);
  } else {
    lines.unshift(note, '');
  }

  const { error } = await supabase
    .from('playbooks')
    .update({
      content: lines.join('\n'),
      last_researched_at: new Date().toISOString(),
      version: (row.version ?? 1) + 1,
    })
    .eq('id', playbookId);
  if (error) return { error: 'Could not save the verification note.' };

  revalidatePath('/knowledge');
  return { error: null };
}
