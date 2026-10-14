/**
 * Minimal Supabase Auth (GoTrue) mock, for verifying this app's own auth flow
 * without a live Supabase project.
 *
 * Implements only what the app touches:
 *   POST /auth/v1/token?grant_type=password   sign in
 *   POST /auth/v1/signup                      create account
 *   GET  /auth/v1/user                        verify a session (getUser)
 *   POST /auth/v1/logout                      sign out
 *
 * Data lives in memory and is wiped when the process exits. Nothing here is
 * used in production. It exists so the security rules can be proven end to end.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 54321);
const OWNER_EMAIL = (process.env.MOCK_OWNER_EMAIL ?? 'hamza@example.com').toLowerCase();
const OWNER_PASSWORD = process.env.MOCK_OWNER_PASSWORD ?? 'correct-horse-battery-staple';

/**
 * One seeded thread, so the reply panel can be rendered and asserted in a real
 * signed-in session. Fixed ids, because the harness has to reference them.
 */
export const FIXTURE = {
  clientId: '11111111-1111-4111-8111-111111111111',
  threadId: '22222222-2222-4222-8222-222222222222',
  client: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Simon Fixture',
    company: 'Fixture Trading',
    stage: 'quoted',
    source: 'fiverr',
    channel: 'fiverr',
    country: 'United Kingdom',
    tags: [],
    deal_value_estimate: 199.99,
    currency: 'USD',
    last_contact_at: '2026-10-01T10:00:00Z',
    last_message_at: '2026-10-02T10:00:00Z',
    last_message: 'Can you do 150?',
    last_message_role: 'client',
    client_message_count: 2,
    my_message_count: 1,
    thread_count: 1,
    open_projects: 0,
    summary: 'Fiverr buyer, quoted 199.99, pushing on price.',
    notes: null,
  },
  facts: [
    {
      id: '77777777-7777-4777-8777-777777777777',
      client_id: '11111111-1111-4111-8111-111111111111',
      key: 'relationship_summary',
      value: 'Fiverr buyer quoted 199.99, pushing on price, ball in his court.',
      confidence: 0.9,
      is_pinned: false,
      updated_at: '2026-10-02T10:00:00Z',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      client_id: '11111111-1111-4111-8111-111111111111',
      key: 'budget_ceiling',
      value: '150, will not go higher',
      confidence: 0.9,
      is_pinned: false,
      updated_at: '2026-10-02T10:00:00Z',
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      client_id: '11111111-1111-4111-8111-111111111111',
      key: 'platform',
      value: 'Fiverr only, never off platform',
      confidence: 0.9,
      is_pinned: true,
      updated_at: '2026-10-02T10:00:00Z',
    },
  ],
  thread: {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Simon, Fiverr order',
    mode: 'client_reply',
    status: 'open',
    client_id: '11111111-1111-4111-8111-111111111111',
  },
  messages: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      thread_id: '22222222-2222-4222-8222-222222222222',
      role: 'me',
      content: 'The store build is 199.99 and that covers everything.',
      channel: 'fiverr',
      sent_at: '2026-10-01T10:00:00Z',
      created_at: '2026-10-01T10:00:00Z',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      thread_id: '22222222-2222-4222-8222-222222222222',
      role: 'client',
      content: 'Can you do 150?',
      channel: 'fiverr',
      sent_at: '2026-10-02T10:00:00Z',
      created_at: '2026-10-02T10:00:00Z',
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      thread_id: '22222222-2222-4222-8222-222222222222',
      role: 'assistant',
      content: 'I can meet you at 175 and start today.',
      channel: 'fiverr',
      sent_at: '2026-10-02T10:01:00Z',
      created_at: '2026-10-02T10:01:00Z',
    },
  ],
  projectId: '55555555-5555-4555-8555-555555555555',
  project: {
    id: '55555555-5555-4555-8555-555555555555',
    title: 'Simon, store rebuild',
    status: 'active',
    brief: 'Simon wants the store rebuilt before the sale.',
    brief_json: {
      goal: 'Rebuild the store so it converts before the sale',
      deliverables: ['Store rebuild'],
      constraints: ['Sale date fixed'],
      success: ['Checkout works end to end'],
      next_step: 'Confirm the product list',
      deadline_risk: null,
      planning_assumptions: ['Simon provides product photos by Friday'],
    },
    deliverables: ['Store rebuild'],
    deadline: '2026-10-30',
    budget_amount: 25000,
    currency: 'USD',
    clients: { id: '11111111-1111-4111-8111-111111111111', name: 'Simon' },
    questions: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        question: 'Who writes the product descriptions?',
        why_it_matters: 'Copy delays are the top cause of late stores.',
        status: 'answered',
        answer: 'Simon does, by Friday.',
      },
    ],
    steps: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        position: 1,
        title: 'Confirm the product list with Simon',
        detail: 'Agree the exact list and who supplies each photo.',
        method: 'Standard discovery call',
        method_source: null,
        estimate_minutes: 60,
        status: 'done',
        blocked_reason: null,
        quality_checklist: [
          { item: 'List agreed in writing', done: true },
          { item: 'Photo owner named per product', done: true },
        ],
      },
      {
        id: '88888888-8888-4888-8888-888888888888',
        position: 2,
        title: 'Install the pixel and test one purchase event end to end',
        detail: 'Fire a test purchase and see it land in the dashboard.',
        method: 'Per the platform tracking guide',
        method_source: 'https://research.example/tracking',
        estimate_minutes: 90,
        status: 'in_progress',
        blocked_reason: null,
        quality_checklist: [
          { item: 'Test purchase event fires', done: false },
          { item: 'Event visible in the dashboard', done: false },
        ],
      },
    ],
  },
  researchNotes: [
    {
      id: '99999999-9999-4999-8999-999999999999',
      query: 'store tracking setup pitfalls',
      summary: 'Test purchases must be verified in the dashboard.',
      sources: [{ url: 'https://research.example/tracking', title: 'Tracking guide' }],
      created_at: '2026-10-05T10:00:00Z',
    },
  ],
};

/** access token -> user */
const sessions = new Map();
/** email -> password, for accounts created at runtime */
const accounts = new Map([[OWNER_EMAIL, OWNER_PASSWORD]]);

function uuid() {
  return crypto.randomUUID();
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function makeUser(email) {
  return {
    id: uuid(),
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
}

function issueSession(user) {
  const accessToken = uuid();
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  sessions.set(accessToken, user);
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: uuid(),
    user,
  };
}

function bearer(req) {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  // Health, so the harness can wait for readiness.
  if (path === '/health') return json(res, 200, { ok: true });

  if (path === '/auth/v1/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    const body = await readBody(req);
    const email = String(body.email ?? '').toLowerCase();

    if (grant === 'password') {
      if (!accounts.has(email) || accounts.get(email) !== body.password) {
        return json(res, 400, {
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        });
      }
      return json(res, 200, issueSession(makeUser(email)));
    }

    if (grant === 'refresh_token') {
      // Good enough for the harness: mint a fresh session for the owner.
      return json(res, 200, issueSession(makeUser(OWNER_EMAIL)));
    }

    return json(res, 400, { error: 'unsupported_grant_type' });
  }

  if (path === '/auth/v1/signup' && req.method === 'POST') {
    const body = await readBody(req);
    const email = String(body.email ?? '').toLowerCase();
    if (!email || !body.password) return json(res, 400, { error: 'validation_failed' });
    if (accounts.has(email)) return json(res, 422, { error: 'user_already_exists' });
    accounts.set(email, String(body.password));
    return json(res, 200, { user: makeUser(email), session: null });
  }

  if (path === '/auth/v1/user' && req.method === 'GET') {
    const token = bearer(req);
    const user = token ? sessions.get(token) : null;
    if (!user) {
      return json(res, 401, { error: 'invalid_token', error_description: 'Invalid JWT' });
    }
    return json(res, 200, user);
  }

  if (path === '/auth/v1/logout' && req.method === 'POST') {
    const token = bearer(req);
    if (token) sessions.delete(token);
    res.writeHead(204);
    return res.end();
  }

  // ---------------------------------------------------------------------------
  // PostgREST surface, so the interface can be walked through with no database.
  // Reads answer with empty results, which renders the real empty states.
  // Writes refuse, and say why, rather than pretending to save something.
  // ---------------------------------------------------------------------------
  if (path.startsWith('/rest/v1/')) {
    const wantsSingleObject = (req.headers.accept ?? '').includes('vnd.pgrst.object+json');

    if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-range': '*/0', 'cache-control': 'no-store' });
      return res.end();
    }

    if (req.method === 'GET') {
      // The seeded thread and its messages, so the reply panel can be rendered
      // for real. Everything else answers empty, which renders the empty states.
      const table = path.replace('/rest/v1/', '');
      const idFilter = url.searchParams.get('id');

      if (table === 'threads' && idFilter === `eq.${FIXTURE.threadId}`) {
        return json(res, 200, {
          ...FIXTURE.thread,
          clients: {
            id: FIXTURE.client.id,
            name: FIXTURE.client.name,
            company: FIXTURE.client.company,
            stage: FIXTURE.client.stage,
            source: FIXTURE.client.source,
            channel: FIXTURE.client.channel,
          },
        });
      }

      if (table === 'messages' && url.searchParams.get('thread_id') === `eq.${FIXTURE.threadId}`) {
        return json(res, 200, FIXTURE.messages);
      }

      if (table === 'client_overview' && idFilter === `eq.${FIXTURE.clientId}`) {
        return json(res, 200, FIXTURE.client);
      }

      if (table === 'client_facts' && url.searchParams.get('client_id') === `eq.${FIXTURE.clientId}`) {
        return json(res, 200, FIXTURE.facts);
      }

      if (table === 'projects' && idFilter === `eq.${FIXTURE.projectId}`) {
        return json(res, 200, FIXTURE.project);
      }

      if (
        table === 'research_notes' &&
        url.searchParams.get('project_id') === `eq.${FIXTURE.projectId}`
      ) {
        return json(res, 200, FIXTURE.researchNotes);
      }

      if (wantsSingleObject) {
        // What PostgREST returns when a single row was requested and none exist.
        return json(res, 406, {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
          details: 'Results contain 0 rows',
        });
      }
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-range': '*/0',
        'cache-control': 'no-store',
      });
      return res.end('[]');
    }

    return json(res, 403, {
      code: 'preview_read_only',
      message:
        'Preview mode has no database, so nothing can be saved here. Connect your Supabase project to store data.',
    });
  }

  json(res, 404, { error: 'not_found', path });
});

server.on('error', (error) => {
  console.error(`[mock-supabase] cannot start on port ${PORT}: ${error.message}`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-supabase] listening on http://127.0.0.1:${PORT}`);
});
