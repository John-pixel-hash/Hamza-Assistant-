import { NextResponse } from 'next/server';
import { generateText } from 'ai';

import { createClient } from '@/lib/supabase/server';
import { ALLOWED_EMAIL } from '@/lib/env';
import { getModelFor } from '@/lib/ai/provider';
import { logRun } from '@/lib/ai/telemetry';
import { parseTone, toneScorePrompt } from '@/lib/ai/tone';

export const dynamic = 'force-dynamic';

/**
 * Reads the tone of a pasted client message with the lite model, so the panel
 * can preselect it before the draft is written. A courtesy, never a gate: on
 * any failure it answers unknown and the draft simply reads the tone itself.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || (user.email ?? '').toLowerCase() !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let text = '';
  try {
    const body = (await request.json()) as { text?: unknown };
    text = String(body.text ?? '').trim();
  } catch {
    return NextResponse.json({ tone: 'unknown' });
  }

  if (text.length < 12) {
    return NextResponse.json({ tone: 'unknown' });
  }

  const started = Date.now();
  try {
    const { model, resolved } = await getModelFor('tone_score');
    const result = await generateText({
      model,
      prompt: toneScorePrompt(text),
      maxOutputTokens: 24,
    });
    const tone = parseTone(result.text);

    await logRun({
      task: 'tone_score',
      resolved,
      latencyMs: Date.now() - started,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      status: 'ok',
    });

    return NextResponse.json({ tone, modelId: resolved.modelId });
  } catch {
    return NextResponse.json({ tone: 'unknown' });
  }
}
