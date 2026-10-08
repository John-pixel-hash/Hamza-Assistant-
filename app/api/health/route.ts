import { NextResponse } from 'next/server';

/**
 * Public liveness check. Reports nothing sensitive, only that the app is up.
 * Safe to expose: it confirms nothing about your data or configuration.
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, app: 'hamza-assistant', phase: 1, time: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
