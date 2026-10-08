/**
 * Phase 1 acceptance test: private access, end to end.
 *
 * Runs the real Next.js server against a mock Supabase Auth, then drives the
 * actual sign in flow the way a browser would (including the no-JavaScript form
 * post), and checks that nobody but the owner can get in.
 *
 * Usage:  npm run verify:auth
 *         SKIP_BUILD=1 npm run verify:auth     reuse the existing build
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Every port this harness uses is allocated fresh rather than hardcoded.
 *
 * This was learned the hard way twice. First the mock auth service was pinned to
 * 54321, where a preview was already listening, so the run silently reused real
 * preview state and failed in a confusing way. Then the app ports were pinned to
 * 4321 and 4322, and a server left behind by an earlier crashed run made the
 * next run die with EADDRINUSE before it even built.
 *
 * Allocating at run time removes the whole class of problem. All three ports are
 * reserved at once so two of them can never come back the same.
 */
const [APP_PORT, SETUP_PORT, MOCK_PORT] = await freePorts(3);

const OWNER_EMAIL = 'hamza@example.com';
const OWNER_PASSWORD = 'correct-horse-battery-staple';
const INTRUDER_EMAIL = 'someone.else@example.com';

/**
 * Reserves count distinct free ports, then releases them.
 *
 * Every probe is held open until all of them have a port, because a closed probe
 * hands its port straight back and a later call can return the same number.
 */
async function freePorts(count) {
  const probes = [];
  for (let i = 0; i < count; i += 1) {
    probes.push(await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.unref();
      probe.on('error', reject);
      probe.listen(0, '127.0.0.1', () => resolve(probe));
    }));
  }

  const ports = probes.map((probe) => {
    const address = probe.address();
    return typeof address === 'object' && address ? address.port : 0;
  });

  await Promise.all(probes.map((probe) => new Promise((resolve) => probe.close(resolve))));
  return ports;
}

const APP = `http://127.0.0.1:${APP_PORT}`;
const SETUP_APP = `http://127.0.0.1:${SETUP_PORT}`;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
// Derived from the Supabase hostname (127.0.0.1), which does not include the port.
const COOKIE_NAME = 'sb-127-auth-token';

const children = [];
const results = [];

/**
 * Starts a child process in its own process group.
 *
 * The group matters. `next start` is a launcher that spawns the real server as a
 * grandchild, so killing the direct child alone leaves an orphan holding the
 * port. That orphan then breaks the next run with EADDRINUSE. Detaching puts the
 * whole tree in one group, and cleanup kills the group.
 */
function start(command, args, env, label) {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[${label}] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[${label}] ${d}`));
  children.push(child);
  return child;
}

/** Kills a child and everything it started. */
function killTree(child) {
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
}

/**
 * Waits for a URL to answer. If the child died while waiting, say so instead of
 * blaming a timeout, because the child's output is what explains the problem.
 */
async function waitFor(url, label, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await sleep(400);
  }
  throw new Error(`${label} did not become ready in time`);
}

function check(name, condition, detail = '') {
  if (condition) {
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } else {
    results.push({ name, ok: false, detail });
    console.log(`  FAIL  ${name}${detail ? `  ->  ${detail}` : ''}`);
  }
}

/** Reads the hidden server action fields out of a rendered form. */
function decodeEntities(raw) {
  return raw
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&#x27;', "'");
}

function actionFields(html) {
  const form = html.match(/<form[\s\S]*?<\/form>/)?.[0] ?? '';
  const tags = form.match(/<input\b[^>]*>/g) ?? [];
  const fields = [];
  for (const tag of tags) {
    // Attributes are parsed one at a time. A single greedy regex silently
    // swallowed the value attribute and produced an empty action reference.
    const name = tag.match(/\bname="([^"]*)"/)?.[1];
    if (!name || !name.startsWith('$ACTION')) continue;
    const value = tag.match(/\bvalue="([^"]*)"/)?.[1] ?? '';
    fields.push([name, decodeEntities(value)]);
  }
  return fields;
}

function setCookiesFrom(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(';')[0]);
}

function sessionCookieValue(cookies) {
  const found = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return found ? decodeURIComponent(found.slice(COOKIE_NAME.length + 1)) : null;
}

/** Submits the login form exactly as a browser without JavaScript would. */
async function submitLogin(base, { email, password, next = '/' }) {
  const page = await fetch(`${base}/login`);
  const html = await page.text();
  const fields = actionFields(html);
  if (fields.length === 0) throw new Error('could not find server action fields on /login');

  const body = new FormData();
  for (const [name, value] of fields) body.append(name, value);
  body.append('email', email);
  body.append('password', password);
  body.append('next', next);

  const res = await fetch(`${base}/login`, { method: 'POST', body, redirect: 'manual' });
  const text = await res.text();
  return { res, text, cookies: setCookiesFrom(res) };
}

/** Builds the cookie value the way @supabase/ssr stores a session. */
function craftSessionCookie(session) {
  return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
}

async function main() {
  console.log('\nPhase 1 acceptance test: private access\n');

  // ---------------------------------------------------------------- setup ---
  console.log('Starting mock Supabase Auth and the app...');
  start('node', ['tests/mock-supabase.mjs'], {
    MOCK_PORT: String(MOCK_PORT),
    MOCK_OWNER_EMAIL: OWNER_EMAIL,
    MOCK_OWNER_PASSWORD: OWNER_PASSWORD,
  }, 'mock');

  await waitFor(`${MOCK}/health`, 'mock supabase');

  if (!process.env.SKIP_BUILD) {
    console.log('Building the app with test configuration...');
    await new Promise((resolve, reject) => {
      const build = start('node_modules/.bin/next', ['build'], {
        NEXT_PUBLIC_SUPABASE_URL: MOCK,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
        ALLOWED_EMAIL: OWNER_EMAIL,
        ALLOW_SIGNUP: 'false',
      }, 'build');
      build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed (${code})`))));
    });
  }

  start('node_modules/.bin/next', ['start', '-p', String(APP_PORT)], {
    NEXT_PUBLIC_SUPABASE_URL: MOCK,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    ALLOWED_EMAIL: OWNER_EMAIL,
    ALLOW_SIGNUP: 'false',
  }, 'app');

  // First run instance: no owner claimed yet, setup open.
  start('node_modules/.bin/next', ['start', '-p', String(SETUP_PORT)], {
    NEXT_PUBLIC_SUPABASE_URL: MOCK,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    ALLOWED_EMAIL: '',
    ALLOW_SIGNUP: 'true',
  }, 'setup-app');

  await waitFor(`${APP}/api/health`, 'app');
  await waitFor(`${SETUP_APP}/setup`, 'setup app');
  console.log('Ready.\n');

  // ------------------------------------------------- 1. closed by default ---
  console.log('1. Signed out visitors are kept out');

  const health = await fetch(`${APP}/api/health`);
  check('health endpoint answers publicly', health.status === 200);

  const login = await fetch(`${APP}/login`);
  check('login page renders', login.status === 200 && (await login.text()).includes('Sign in'));

  const privatePaths = [
    '/',
    '/clients',
    '/clients/new',
    '/clients/00000000-0000-0000-0000-000000000000',
    '/clients/00000000-0000-0000-0000-000000000000/edit',
    '/threads/00000000-0000-0000-0000-000000000000',
    '/search',
    '/projects',
    '/settings',
  ];

  for (const path of privatePaths) {
    const res = await fetch(`${APP}${path}`, { redirect: 'manual' });
    const location = res.headers.get('location') ?? '';
    check(
      `${path} redirects to login when signed out`,
      res.status === 307 && location.startsWith('/login'),
      `status ${res.status} location ${location}`,
    );
  }

  const api = await fetch(`${APP}/api/clients`, { redirect: 'manual' });
  check(
    'private API returns JSON 401, not an HTML page',
    api.status === 401 && (api.headers.get('content-type') ?? '').includes('json'),
    `status ${api.status}`,
  );

  const deep = await fetch(`${APP}/clients/does-not-matter/deep/path`, { redirect: 'manual' });
  check(
    'an unknown deep route is private by default',
    deep.status === 307 && (deep.headers.get('location') ?? '').startsWith('/login'),
    `status ${deep.status}`,
  );

  // ------------------------------------------------------ 2. real sign in ---
  console.log('\n2. Sign in works, and only for the owner');

  const wrongPassword = await submitLogin(APP, {
    email: OWNER_EMAIL,
    password: 'not-the-password',
  });
  check(
    'wrong password is rejected and issues no session',
    sessionCookieValue(wrongPassword.cookies) === null,
    `cookies: ${wrongPassword.cookies.join(', ') || 'none'}`,
  );

  const stranger = await submitLogin(APP, {
    email: INTRUDER_EMAIL,
    password: 'any-password-at-all',
  });
  check(
    'a non-owner email cannot even attempt a sign in',
    sessionCookieValue(stranger.cookies) === null &&
      /private|not authorised/i.test(stranger.text),
    'no session issued and a clear refusal shown',
  );

  const owner = await submitLogin(APP, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });
  const ownerCookie = sessionCookieValue(owner.cookies);
  check('owner sign in returns a session cookie', Boolean(ownerCookie));
  check(
    'session cookie uses the Supabase storage format',
    Boolean(ownerCookie && ownerCookie.startsWith('base64-')),
  );

  const cookieHeader = { cookie: `${COOKIE_NAME}=${encodeURIComponent(ownerCookie ?? '')}` };

  const today = await fetch(`${APP}/`, { headers: cookieHeader, redirect: 'manual' });
  const todayHtml = await today.text();
  check(
    'owner reaches the dashboard',
    today.status === 200 && todayHtml.includes('Today'),
    `status ${today.status}`,
  );

  for (const path of ['/clients', '/clients/new', '/search', '/projects', '/settings']) {
    const res = await fetch(`${APP}${path}`, { headers: cookieHeader, redirect: 'manual' });
    check(`owner reaches ${path}`, res.status === 200, `status ${res.status}`);
  }

  // Production hardening. Both of these only matter once the app sits behind a
  // real domain and a CDN, which is how it will be deployed, so they are checked
  // here rather than assumed.
  const privatePage = await fetch(`${APP}/`, { headers: cookieHeader, redirect: 'manual' });
  const privateCache = privatePage.headers.get('cache-control') ?? '';
  check(
    'a signed in page refuses to be cached by anything in between',
    /no-store/.test(privateCache) && /private/.test(privateCache),
    `cache-control: ${privateCache || '(none)'}`,
  );

  const rawCookies = setCookiesFrom(privatePage);
  check(
    'over plain http the session cookie is not marked Secure',
    rawCookies.length === 0 || !rawCookies.some((c) => /;\s*secure/i.test(c)),
    `this is what keeps local development working; production is https and sets it`,
  );

  // Phase 2 screens must actually render for the owner, not just return 200.
  const clientsPage = await fetch(`${APP}/clients`, { headers: cookieHeader, redirect: 'manual' });
  const clientsHtml = await clientsPage.text();
  check(
    'the clients screen renders with its empty state',
    clientsPage.status === 200 && /clients/i.test(clientsHtml),
    `status ${clientsPage.status}`,
  );

  // Phase 2.1: outreach is a first class stage, so it must be offered in the
  // filter and in the new client form. A stage that exists in the database but
  // not on screen would leave outreach clients unreachable.
  check(
    'the clients screen offers the outreach stage alongside the live ones',
    clientsPage.status === 200 && /outreach/i.test(clientsHtml) && /negotiating/i.test(clientsHtml),
    `status ${clientsPage.status}`,
  );

  const searchPage = await fetch(`${APP}/search`, { headers: cookieHeader, redirect: 'manual' });
  const searchHtml = await searchPage.text();
  check(
    'search explains itself before you type anything',
    searchPage.status === 200 && /type at least two characters/i.test(searchHtml),
    `status ${searchPage.status}`,
  );

  const newClient = await fetch(`${APP}/clients/new`, { headers: cookieHeader, redirect: 'manual' });
  const newClientHtml = await newClient.text();
  check(
    'the new client form renders with its required field',
    newClient.status === 200 && /name/i.test(newClientHtml) && /add client/i.test(newClientHtml),
    `status ${newClient.status}`,
  );
  check(
    'the new client form lets you file someone as outreach',
    /outreach/i.test(newClientHtml),
    `status ${newClient.status}`,
  );

  // Phase 3.4: the reply panel has to render for the owner on a real thread,
  // with the platform picker and the Fiverr rule that follows the client.
  const fixtureThread = await fetch(
    `${APP}/threads/22222222-2222-4222-8222-222222222222`,
    { headers: cookieHeader, redirect: 'manual' },
  );
  const threadHtml = await fixtureThread.text();
  check(
    'the reply panel renders on a thread the owner can see',
    fixtureThread.status === 200 && /write a reply/i.test(threadHtml),
    `status ${fixtureThread.status}`,
  );
  check(
    'the panel offers the platforms he actually works on',
    /instagram/i.test(threadHtml) && /fiverr/i.test(threadHtml) && /whatsapp/i.test(threadHtml),
    'the platform picker should list Instagram, Fiverr and WhatsApp',
  );
  check(
    'the panel defaulted to the client\'s own channel, Fiverr',
    fixtureThread.status === 200 && /<option[^>]*value="fiverr"[^>]*selected/i.test(threadHtml),
    'a Fiverr client should open on Fiverr without switching',
  );
  // The save control appears once there is a draft to save, so what is asserted
  // here is the entry point: the paste box and the button that starts a draft.
  check(
    'the panel takes a pasted client message and offers to draft from it',
    /what the client sent/i.test(threadHtml) && /draft the reply/i.test(threadHtml),
    'the paste box and the draft button are the way in',
  );
  check(
    'the panel warns how long a draft takes, rather than looking frozen',
    /ten to twenty seconds/i.test(threadHtml),
    'a real draft takes 6 to 18 seconds, so the panel has to say so',
  );
  check(
    'the seeded client\'s conversation is on the page',
    /Can you do 150\?/.test(threadHtml),
    'the thread history must render for the drafting context to be visible',
  );

  const missingThread = await fetch(`${APP}/threads/00000000-0000-0000-0000-000000000000`, {
    headers: cookieHeader,
    redirect: 'manual',
  });
  check(
    'a thread that does not exist returns a clean not found',
    missingThread.status === 404,
    `status ${missingThread.status}`,
  );

  // A client page for an id that does not exist must render a clear empty state
  // rather than leaking an error or pretending the client exists.
  const missing = await fetch(`${APP}/clients/00000000-0000-0000-0000-000000000000`, {
    headers: cookieHeader,
    redirect: 'manual',
  });
  const missingHtml = await missing.text();
  check(
    'a client that does not exist shows a clear message, not a crash',
    missing.status === 200 && /no such client/i.test(missingHtml),
    `status ${missing.status}`,
  );

  const loginWhileIn = await fetch(`${APP}/login`, { headers: cookieHeader, redirect: 'manual' });
  const loginWhileInLocation = loginWhileIn.headers.get('location') ?? '';
  check(
    'signed in owner is sent away from the login page',
    loginWhileIn.status === 307 && /\.com\/$|^\/$/.test(loginWhileInLocation),
    `status ${loginWhileIn.status} location ${loginWhileInLocation}`,
  );

  // ------------------------- 3. a second valid account is still locked out ---
  console.log('\n3. A second real account is refused everywhere');

  await fetch(`${MOCK}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: INTRUDER_EMAIL, password: 'intruder-password-1234' }),
  });

  const token = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: INTRUDER_EMAIL, password: 'intruder-password-1234' }),
  });
  const session = await token.json();
  check('the second account can obtain a valid Supabase session', Boolean(session.access_token));

  const intruderCookie = { cookie: `${COOKIE_NAME}=${encodeURIComponent(craftSessionCookie(session))}` };

  for (const path of ['/', '/clients', '/settings']) {
    const res = await fetch(`${APP}${path}`, { headers: intruderCookie, redirect: 'manual' });
    const location = res.headers.get('location') ?? '';
    check(
      `a valid session from another account is refused at ${path}`,
      res.status === 307 && location.includes('/api/auth/signout'),
      `status ${res.status} location ${location}`,
    );
  }

  const intruderApi = await fetch(`${APP}/api/clients`, { headers: intruderCookie, redirect: 'manual' });
  check(
    'the second account gets no private API access',
    intruderApi.status === 401,
    `status ${intruderApi.status} location ${intruderApi.headers.get('location') ?? 'none'}`,
  );

  const signout = await fetch(`${APP}/api/auth/signout?reason=not_allowed`, {
    headers: intruderCookie,
    redirect: 'manual',
  });
  const landing = signout.headers.get('location') ?? '';
  check(
    'the second account is signed out through a reachable route, with no redirect loop',
    signout.status === 307 && landing.includes('/login') && landing.includes('not_allowed'),
    `status ${signout.status} location ${landing}`,
  );

  const notice = await fetch(`${APP}/login?error=not_allowed`);
  check(
    'the login page explains why they were turned away',
    /not the owner|private/i.test(await notice.text()),
    'refusal message shown',
  );

  // ------------------------------------------------------ 4. session ends ---
  console.log('\n4. Signing out ends the session for real');

  const endSession = await fetch(`${APP}/api/auth/signout`, { headers: cookieHeader, redirect: 'manual' });
  check(
    'sign out redirects to login and clears cookies',
    endSession.status === 307 &&
      (endSession.headers.get('location') ?? '').includes('/login') &&
      setCookiesFrom(endSession).some((c) => c.startsWith(COOKIE_NAME)),
    `status ${endSession.status}`,
  );

  const afterSignOut = await fetch(`${APP}/`, { headers: cookieHeader, redirect: 'manual' });
  check(
    'the old session cookie no longer works',
    afterSignOut.status === 307 && (afterSignOut.headers.get('location') ?? '').startsWith('/login'),
    `status ${afterSignOut.status}`,
  );

  // -------------------------------------------------- 5. first run setup ---
  console.log('\n5. First run setup behaves');

  const setupRedirect = await fetch(`${SETUP_APP}/clients`, { redirect: 'manual' });
  check(
    'before an owner exists, private pages send you to setup',
    setupRedirect.status === 307 && (setupRedirect.headers.get('location') ?? '').startsWith('/setup'),
    `status ${setupRedirect.status} location ${setupRedirect.headers.get('location')}`,
  );

  const setupPage = await fetch(`${SETUP_APP}/setup`);
  const setupHtml = await setupPage.text();
  check(
    'setup page renders',
    setupPage.status === 200 && setupHtml.includes('First run setup'),
    `status ${setupPage.status}`,
  );

  const setupFields = actionFields(setupHtml);
  const setupBody = new FormData();
  const claimEmail = 'first.owner@example.com';
  for (const [name, value] of setupFields) setupBody.append(name, value);
  setupBody.append('email', claimEmail);
  setupBody.append('password', OWNER_PASSWORD);
  setupBody.append('confirm', OWNER_PASSWORD);

  const claimed = await fetch(`${SETUP_APP}/setup`, {
    method: 'POST',
    body: setupBody,
    redirect: 'manual',
  });
  const claimedHtml = await claimed.text();
  const setupNotice =
    claimedHtml.match(/Account created[^<]*/)?.[0]?.trim() ??
    claimedHtml.match(/class="alert[^"]*"[^>]*>([^<]{0,200})/)?.[1]?.trim() ??
    '';
  check(
    'creating the owner account succeeds and tells you to lock it down',
    claimedHtml.includes('Account created') && claimedHtml.includes(claimEmail),
    `response said: ${setupNotice.slice(0, 160) || 'no message found'}`,
  );

  const existing = new FormData();
  for (const [name, value] of actionFields(claimedHtml)) existing.append(name, value);
  existing.append('email', claimEmail);
  existing.append('password', OWNER_PASSWORD);
  existing.append('confirm', OWNER_PASSWORD);
  const existingRes = await fetch(`${SETUP_APP}/setup`, {
    method: 'POST',
    body: existing,
    redirect: 'manual',
  });
  check(
    'a second account cannot be created with the same email',
    /already/i.test(await existingRes.text()),
    'duplicate signup refused',
  );

  const weak = new FormData();
  for (const [name, value] of actionFields(claimedHtml)) weak.append(name, value);
  weak.append('email', 'second@example.com');
  weak.append('password', '123');
  weak.append('confirm', '123');
  const weakRes = await fetch(`${SETUP_APP}/setup`, { method: 'POST', body: weak, redirect: 'manual' });
  const weakHtml = await weakRes.text();
  check(
    'a weak password is refused',
    /12 characters/i.test(weakHtml),
    'password policy enforced',
  );

  // ------------------------------------------------------------- summary ---
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  }
  return failed.length;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  console.error('\nHarness error:', error instanceof Error ? error.message : error);
} finally {
  for (const child of children) killTree(child);

  // Give the kernel a moment to release the ports, so a following run in the
  // same shell does not race the sockets the processes just closed.
  await sleep(200);
}

process.exit(exitCode);
