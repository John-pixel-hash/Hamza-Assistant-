import { NextResponse } from 'next/server';

import { runMemoryPass } from '@/lib/ai/memory-live';
import { ALLOWED_EMAIL } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The Chat capture answers first and remembers second. The browser calls this
 * right after the reply lands, so the memory pass gets its own 60 second
 * window instead of sharing the capture's.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || (user.email ?? '').toLowerCase() !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let threadId = '';
  try {
    threadId = String(((await request.json()) as { threadId?: string }).threadId ?? '');
  } catch {
    return NextResponse.json({ error: 'bad body' }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) {
    return NextResponse.json({ error: 'bad thread' }, { status: 400 });
  }

  const pass = await runMemoryPass(threadId);
  return NextResponse.json({ ok: true, pass });
}
