import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { ALLOWED_EMAIL } from '@/lib/env';
import { loadConversation, draftReplyAction } from '@/app/actions/drafts';
import type { DraftState } from '@/lib/ai/draft-state';

export const dynamic = 'force-dynamic';

/**
 * TEMPORARY diagnostic, owner only. It runs the exact chain the reply panel
 * uses, in the real runtime, and returns whatever happened as JSON, including
 * a stack trace. Remove once the live crash is understood.
 *
 * It answers 404 for anyone who is not the owner, so it reveals nothing to a
 * stranger who guesses the URL.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || (user.email ?? '').toLowerCase() !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const thread = new URL(request.url).searchParams.get('thread') ?? '';
  const steps: Record<string, unknown> = { thread };

  try {
    const loaded = await loadConversation(thread);
    steps.loaded = loaded
      ? {
          messages: loaded.detail.messages.length,
          client: loaded.client?.name ?? null,
          facts: loaded.facts.length,
          projects: loaded.projects.length,
        }
      : null;

    if (!loaded) {
      return NextResponse.json({ steps, error: 'thread not found' }, { status: 200 });
    }

    const formData = new FormData();
    formData.set('thread_id', thread);
    formData.set('incoming', '');
    formData.set('channel', loaded.client?.channel ?? 'instagram');
    formData.set('tone', 'unknown');
    formData.set('instruction', '');

    const outcome = await draftReplyAction({} as DraftState, formData);
    steps.outcome = {
      error: outcome.error,
      ok: outcome.ok,
      attempts: outcome.attempts,
      latencyMs: outcome.latencyMs,
      draftPreview: outcome.draft ? outcome.draft.slice(0, 140) : null,
      problems: outcome.problems,
    };
    return NextResponse.json({ steps });
  } catch (error) {
    return NextResponse.json(
      {
        steps,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null,
      },
      { status: 500 },
    );
  }
}
