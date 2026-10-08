import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Public liveness check. Reports nothing sensitive, only that the app is up.
 * The build marker is the commit Vercel deployed, which makes it possible to
 * confirm a push actually went live by curling this endpoint. Locally it reads
 * "local".
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      app: 'hamza-assistant',
      phase: 1,
      build: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
      time: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
