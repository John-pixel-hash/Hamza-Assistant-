'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';

/**
 * The fact sheet is his, so he can pin what matters and delete what is wrong.
 * Pinned facts survive every future extraction, and a deleted fact stays
 * deleted, because a new extraction starts from what was stated in the
 * conversation, not from old memory.
 *
 * The session user is read server side and used in every query, on top of row
 * level security, so a fact can never be touched across accounts.
 */

async function ownerClient() {
  if (!SUPABASE_CONFIGURED) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

export async function togglePinFactAction(formData: FormData) {
  const owner = await ownerClient();
  if (!owner) return;

  const factId = String(formData.get('fact_id') ?? '');
  const clientId = String(formData.get('client_id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(factId) || !/^[0-9a-f-]{36}$/i.test(clientId)) return;

  const fact = await supabaseSelectOne(owner, factId);
  if (!fact) return;

  await owner.supabase
    .from('client_facts')
    .update({ is_pinned: !fact.is_pinned })
    .eq('id', factId)
    .eq('user_id', owner.userId);

  revalidatePath(`/clients/${clientId}`);
}

export async function deleteFactAction(formData: FormData) {
  const owner = await ownerClient();
  if (!owner) return;

  const factId = String(formData.get('fact_id') ?? '');
  const clientId = String(formData.get('client_id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(factId) || !/^[0-9a-f-]{36}$/i.test(clientId)) return;

  await owner.supabase
    .from('client_facts')
    .delete()
    .eq('id', factId)
    .eq('user_id', owner.userId);

  revalidatePath(`/clients/${clientId}`);
}

async function supabaseSelectOne(
  owner: { supabase: Awaited<ReturnType<typeof createClient>>; userId: string },
  factId: string,
) {
  const { data } = await owner.supabase
    .from('client_facts')
    .select('id, is_pinned')
    .eq('id', factId)
    .eq('user_id', owner.userId)
    .maybeSingle();
  return data;
}
