'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export type ResearchKeyState = { error: string | null; saved?: boolean };

/** Only async exports leave a use server file, on purpose. */
export async function saveTavilyKeyAction(
  _prev: ResearchKeyState,
  formData: FormData,
): Promise<ResearchKeyState> {
  const value = String(formData.get('tavily_key') ?? '').trim();
  if (value && !value.startsWith('tvly-')) {
    return { error: 'A Tavily key starts with tvly-. Copy the whole key from app.tavily.com.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out. Sign in and try again.' };

  // The field renders blank even when a key is stored, so an empty submit is a
  // no-op. Writing null here would silently delete the working key.
  if (!value) return { error: null };

  const { error } = await supabase.from('user_secrets').upsert({
    user_id: user.id,
    tavily_key: value,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return {
      error:
        'Could not save the key. If the table is missing, run supabase/migrations/0006_user_secrets.sql once in the SQL editor.',
    };
  }

  revalidatePath('/settings');
  return { error: null, saved: true };
}
