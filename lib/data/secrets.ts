import { createClient } from '@/lib/supabase/server';

/** The owner's Tavily key saved from Settings, null when not stored yet. */
export async function getStoredTavilyKey(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from('user_secrets').select('tavily_key').maybeSingle();
    return (data?.tavily_key as string | null | undefined) ?? null;
  } catch {
    // Table missing before migration 0006 runs: research falls back to env.
    return null;
  }
}
