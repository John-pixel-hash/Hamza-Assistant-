'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SUPABASE_CONFIGURED } from '@/lib/env';
import { validateClientForm } from '@/lib/validation/client';

export type ClientFormState = { error: string | null };

const NOT_CONNECTED = {
  error: 'Supabase is not connected, so nothing can be saved yet. Check docs/04-SETUP.md.',
} as const;

export async function createClientAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const parsed = validateClientForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session expired. Sign in again.' };

  const v = parsed.values;
  const { data, error } = await supabase
    .from('clients')
    .insert({
      user_id: user.id,
      name: v.name,
      company: v.company,
      stage: v.stage,
      source: v.source,
      channel: v.channel,
      country: v.country,
      deal_value_estimate: v.dealValueMinor,
      currency: v.currency,
      tags: v.tags,
      notes: v.notes,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[clients] create failed', error?.message);
    return { error: 'Could not save that client. The database refused the record.' };
  }

  revalidatePath('/clients');
  revalidatePath('/');
  redirect(`/clients/${data.id}`);
}

export async function updateClientAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  if (!SUPABASE_CONFIGURED) return NOT_CONNECTED;

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing client id.' };

  const parsed = validateClientForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const v = parsed.values;

  const { error } = await supabase
    .from('clients')
    .update({
      name: v.name,
      company: v.company,
      stage: v.stage,
      source: v.source,
      channel: v.channel,
      country: v.country,
      deal_value_estimate: v.dealValueMinor,
      currency: v.currency,
      tags: v.tags,
      notes: v.notes,
    })
    .eq('id', id);

  if (error) {
    console.error('[clients] update failed', error.message);
    return { error: 'Could not save those changes.' };
  }

  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}
