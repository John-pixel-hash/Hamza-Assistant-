/**
 * Access rule tests. Run with: npm test
 *
 * These cover the security core of Phase 1. They need no server and no browser,
 * because the rules were written as a pure function for exactly this reason.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideAccess, isApiPath, isPublicPath, type GuardInput } from '../lib/auth/guard.ts';

const OWNER = 'hamza@example.com';

function input(overrides: Partial<GuardInput>): GuardInput {
  return {
    pathname: '/',
    userEmail: null,
    allowedEmail: OWNER,
    allowSignup: false,
    ...overrides,
  };
}

test('signed in owner reaches every private page', () => {
  for (const pathname of ['/', '/clients', '/projects', '/settings', '/clients/abc-123']) {
    assert.deepEqual(
      decideAccess(input({ pathname, userEmail: OWNER })),
      { action: 'allow' },
      `expected owner to reach ${pathname}`,
    );
  }
});

test('owner is bounced away from login and setup', () => {
  assert.deepEqual(decideAccess(input({ pathname: '/login', userEmail: OWNER })), {
    action: 'redirect',
    to: '/',
  });
  assert.deepEqual(decideAccess(input({ pathname: '/setup', userEmail: OWNER })), {
    action: 'redirect',
    to: '/',
  });
});

test('signed out visitor is sent to login from any private page', () => {
  for (const pathname of ['/', '/clients', '/projects', '/settings']) {
    const decision = decideAccess(input({ pathname }));
    assert.equal(decision.action, 'redirect');
    assert.equal(decision.action === 'redirect' && decision.to, '/login');
  }
});

test('signed out visitor may reach login and setup', () => {
  assert.deepEqual(decideAccess(input({ pathname: '/login' })), { action: 'allow' });
  assert.deepEqual(decideAccess(input({ pathname: '/setup' })), { action: 'allow' });
});

test('a different signed in account is bounced out of every private page', () => {
  for (const pathname of ['/', '/clients', '/projects', '/settings', '/clients/abc']) {
    const decision = decideAccess(input({ pathname, userEmail: 'intruder@example.com' }));
    assert.equal(decision.action, 'redirect', `intruder should be rejected from ${pathname}`);
    assert.equal(decision.action === 'redirect' && decision.to, '/api/auth/signout?reason=not_allowed');
  }
});

test('the signout escape hatch stays reachable, so a non-owner cannot loop', () => {
  // If this path were blocked, the redirect target would itself be redirected
  // and the visitor would bounce forever.
  assert.deepEqual(
    decideAccess(input({ pathname: '/api/auth/signout', userEmail: 'intruder@example.com' })),
    { action: 'allow' },
  );
  assert.deepEqual(
    decideAccess(input({ pathname: '/login', userEmail: 'intruder@example.com' })),
    { action: 'allow' },
  );
});

test('email matching is exact, case and whitespace sensitive after normalisation', () => {
  // Callers lowercase both sides. A near miss must still be rejected.
  assert.notEqual(decideAccess(input({ pathname: '/', userEmail: 'hamza@example.co' })).action, 'allow');
  assert.notEqual(decideAccess(input({ pathname: '/', userEmail: 'hamza+ads@example.com' })).action, 'allow');
  assert.notEqual(decideAccess(input({ pathname: '/', userEmail: 'HAMZA@example.com' })).action, 'allow');
});

test('an unset allowed email locks the system rather than opening it', () => {
  const decision = decideAccess(input({ pathname: '/clients', userEmail: OWNER, allowedEmail: '' }));
  assert.deepEqual(decision, { action: 'redirect', to: '/api/auth/signout?reason=not_allowed' });
});

test('first run with signup open sends a signed out visitor to setup', () => {
  assert.deepEqual(
    decideAccess(input({ pathname: '/clients', allowSignup: true })),
    { action: 'redirect', to: '/setup' },
  );
});

test('signup open never lets a signed out visitor straight into a private page', () => {
  const decision = decideAccess(input({ pathname: '/', allowSignup: true }));
  assert.deepEqual(decision, { action: 'redirect', to: '/setup' });
});

test('unknown API routes answer with JSON 401, not an HTML redirect', () => {
  for (const pathname of ['/api/clients', '/api/chat', '/api/export']) {
    assert.deepEqual(decideAccess(input({ pathname })), { action: 'deny-api' });
  }
});

test('public API routes stay reachable while signed out', () => {
  assert.deepEqual(decideAccess(input({ pathname: '/api/health' })), { action: 'allow' });
  assert.deepEqual(decideAccess(input({ pathname: '/api/auth/signout' })), { action: 'allow' });
});

test('a signed in non-owner gets a plain 401 from private API routes', () => {
  for (const pathname of ['/api/clients', '/api/chat', '/api/export']) {
    assert.deepEqual(
      decideAccess(input({ pathname, userEmail: 'intruder@example.com' })),
      { action: 'deny-api' },
    );
  }
});

test('public API routes answer a non-owner without leaking anything', () => {
  assert.deepEqual(
    decideAccess(input({ pathname: '/api/health', userEmail: 'intruder@example.com' })),
    { action: 'allow' },
  );
});

test('trailing slashes and query-free pathnames are handled predictably', () => {
  // The proxy passes pathname only. A bare "/clients/" is not a public path.
  const decision = decideAccess(input({ pathname: '/clients/' }));
  assert.deepEqual(decision, { action: 'redirect', to: '/login' });
});

test('helpers classify paths correctly', () => {
  assert.equal(isApiPath('/api/anything'), true);
  assert.equal(isApiPath('/apifoo'), false);
  assert.equal(isPublicPath('/login'), true);
  assert.equal(isPublicPath('/login/extra'), false);
  assert.equal(isPublicPath('/api/health'), true);
  assert.equal(isPublicPath('/clients'), false);
});

// ------------------------------------------------------ key safety -----

test('a secret key in a public variable is refused, not ignored', async () => {
  const { keyMisuseProblem } = await import('../lib/env.ts');

  // The dangerous case: a secret key pasted into a variable that ships to the
  // browser. Full database access, bypassing row level security, in the bundle.
  const problem = keyMisuseProblem('sb_secret_abc123');
  assert.ok(problem, 'a secret key in a public variable must be reported');
  assert.match(problem!, /sb_publishable_/);

  // Every legitimate value passes.
  assert.equal(keyMisuseProblem('sb_publishable_abc123'), null);
  assert.equal(keyMisuseProblem('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.long.jwt'), null);
  assert.equal(keyMisuseProblem(''), null);
  assert.equal(keyMisuseProblem(undefined), null);
  assert.equal(keyMisuseProblem(null), null);
});

test('the readiness checklist reports both key formats', async () => {
  const { serverConfigStatus } = await import('../lib/env.ts');
  const status = serverConfigStatus();

  // These are the field names the settings screen and the Today checklist read.
  for (const field of ['allowedEmail', 'supabaseUrl', 'supabaseKey', 'secretKey', 'googleKey', 'tavilyKey']) {
    assert.ok(field in status, `readiness report is missing ${field}`);
  }
  assert.equal(typeof status.supabaseKey, 'boolean');
});

test('a blank variable is treated as absent, not as a value', async () => {
  const { firstFilled } = await import('../lib/env.ts');

  // The failure this prevents: .env.local lists every name, so the newer name is
  // present but empty. If blank counted as a value it would beat the older name
  // that the user actually filled in, and the app would claim it had no key.
  assert.equal(firstFilled('', 'sb_publishable_real'), 'sb_publishable_real');
  assert.equal(firstFilled('   ', 'fallback'), 'fallback');
  assert.equal(firstFilled(undefined, 'fallback'), 'fallback');
  assert.equal(firstFilled('first', 'second'), 'first');
  assert.equal(firstFilled('', '', undefined), undefined);
  assert.equal(firstFilled(), undefined);
});

// ------------------------------------------------- deployment advice -----

test('the setup advice matches where the app is running', async () => {
  const { missingKeysAdvice, REQUIRED_KEYS } = await import('../lib/env.ts');

  // The bug this prevents: telling somebody to edit .env.local on a deployed
  // app, where Vercel never reads that file. That message wasted real time.
  const hosted = missingKeysAdvice({ onVercel: true });
  assert.match(hosted, /Vercel/);
  assert.match(hosted, /Environment Variables/i);
  assert.match(hosted, /redeploy/i);
  // It may mention .env.local, but only to say it will not work there. What it
  // must never do is instruct somebody to put keys in it.
  assert.ok(
    !/add them to \.env\.local|edit \.env\.local/i.test(hosted),
    'a deployed app must not be told to put keys in .env.local',
  );

  const local = missingKeysAdvice({ onVercel: false });
  assert.match(local, /\.env\.local/);
  assert.match(local, /restart/i);

  // The names are shown to the user, so they must be the real ones and complete.
  assert.deepEqual([...REQUIRED_KEYS], [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
  ]);
});

test('hosted detection does not depend on a single variable', async () => {
  const { isHostedOnVercel } = await import('../lib/env.ts');

  assert.equal(isHostedOnVercel({ VERCEL: '1' }), true);
  assert.equal(isHostedOnVercel({ VERCEL: 'true' }), true);
  // Corroborating signals, in case the primary one is not exposed.
  assert.equal(isHostedOnVercel({ VERCEL_ENV: 'production' }), true);
  assert.equal(isHostedOnVercel({ VERCEL_URL: 'hamza-assistant.vercel.app' }), true);

  // A laptop sets none of these, so it keeps the local wording.
  assert.equal(isHostedOnVercel({}), false);
  assert.equal(isHostedOnVercel({ VERCEL: '0' }), false);
  assert.equal(isHostedOnVercel({ VERCEL: '' }), false);
  assert.equal(isHostedOnVercel({ VERCEL: 'no' }), false);
  assert.equal(isHostedOnVercel({ VERCEL_ENV: '' }), false);
});

test('flag settings are read the way people type them', async () => {
  const { isEnabledFlag } = await import('../lib/env.ts');

  // The trap this closes: `=== 'true'` reads every one of these as off, and the
  // app then refuses setup while the user looks at a variable they set.
  for (const yes of ['true', 'True', 'TRUE', ' true', 'true ', '"true"', "'true'", '1', 'yes', 'on', 'ON']) {
    assert.equal(isEnabledFlag(yes), true, `${JSON.stringify(yes)} should switch the flag on`);
  }

  // Nothing unrecognised may ever switch a flag on.
  for (const no of ['false', 'False', 'FALSE', '0', 'no', 'off', '', '   ', 'tru', 'yess', '2', undefined, null]) {
    assert.equal(isEnabledFlag(no), false, `${JSON.stringify(no)} should stay off`);
  }
});
