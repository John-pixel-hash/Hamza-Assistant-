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
