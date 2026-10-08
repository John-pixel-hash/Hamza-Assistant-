# Phase 1 Verification

What was proven, how, and how to prove it again. Written after the fact from actual test runs, not from intention.

## Commands

```bash
npm run typecheck     # TypeScript, strict mode, no errors allowed
npm test              # 16 access rule tests, no server needed
npm run verify:auth   # 31 end to end checks against a running server
```

## How the end to end test works

`tests/auth-e2e.mjs` starts a mock Supabase Auth service, builds the app against it, runs two real Next.js servers (one normal, one in first run setup mode), then drives them over HTTP exactly as a browser would, including posting the login form the way a browser without JavaScript does. Nothing is mocked inside the app itself. The proxy, the session refresh, the guard, the server actions and the pages are all the real ones.

To rerun without rebuilding: `SKIP_BUILD=1 npm run verify:auth`. To see server logs: `VERBOSE=1 npm run verify:auth`.

## Results

31 of 31 checks passed. 16 of 16 unit tests passed. TypeScript clean.

### 1. Signed out visitors are kept out (8 checks)

| Check | Result |
| --- | --- |
| Health endpoint answers publicly | pass |
| Login page renders | pass |
| / redirects to login when signed out | pass |
| /clients, /projects, /settings redirect to login | pass |
| Private API returns JSON 401, not an HTML page | pass |
| An unknown deep route is private by default | pass |

### 2. Sign in works, and only for the owner (9 checks)

| Check | Result |
| --- | --- |
| Wrong password is rejected and issues no session | pass |
| A non-owner email cannot even attempt a sign in | pass |
| Owner sign in returns a session cookie | pass |
| Session cookie uses the Supabase storage format | pass |
| Owner reaches the dashboard, /clients, /projects, /settings | pass |
| Signed in owner is sent away from the login page | pass |

### 3. A second real account is refused everywhere (7 checks)

The test creates a genuine second Supabase account, obtains a real valid session token for it, and presents that session to the app. This is the case that matters: not a forged cookie, a real one.

| Check | Result |
| --- | --- |
| A valid session from another account is refused at /, /clients, /settings | pass |
| That account gets no private API access (401) | pass |
| It is signed out through a reachable route, no redirect loop | pass |
| The login page explains why it was turned away | pass |

### 4. Signing out ends the session for real (2 checks)

Session revoked server side. The old cookie no longer works afterwards.

### 5. First run setup behaves (5 checks)

| Check | Result |
| --- | --- |
| Before an owner exists, private pages send you to setup | pass |
| Setup page renders | pass |
| Creating the owner account succeeds and tells you to lock it down | pass |
| A second account cannot be created with the same email | pass |
| A weak password is refused | pass |

## Bugs this testing caught

Worth recording, because each one would have been a real security or reliability problem:

1. **A redirect loop for non-owners.** The guard sent a non-owner to `/api/auth/signout`, but that path was itself treated as private, so the signout request was redirected back to itself forever. The owner would have seen nothing wrong, but the escape hatch was broken. Fixed by allowing public paths through for any signed in visitor, and covered by a dedicated unit test.

2. **Private API routes answered a non-owner with an HTML redirect** instead of a JSON 401, which would break any fetch based client and leak the shape of the app. Now API paths from a non-owner return a clean 401.

3. **`/setup` was being statically prerendered.** Next precomputed the page at build time with the build machine's environment, which froze the first run logic. In production this would have broken account claiming depending on when the build happened relative to setting environment variables. Login and setup are now explicitly dynamic.

4. **The dashboard redirect carried a stale `next=/login`.** After signing in, a later redirect could have bounced the owner back to a login page. The `next` parameter is now only attached when sending someone to sign in.

5. **The test harness itself had a broken HTML parser** that silently produced empty server action fields, which made three checks fail for the wrong reason. Fixed by parsing attributes individually instead of with one greedy pattern.

## Phase 2.1 testing: the Instagram import

Five more problems were found while wiring a real 393 conversation archive into
the client hub. All five are fixed and covered.

1. **Fifteen different people shared one handle.** Instagram withheld the
   username for some accounts and gave every one of them the placeholder
   `instagramuser`. Keying the import on the handle merged 15 strangers into one
   client, and the first run silently dropped 2 conversations and 41 messages.
   The import is now keyed on the unique export folder, and those people are
   numbered and tagged `unidentified`.

2. **`auth.users.created_at` was assumed to exist.** The import ordered by it.
   It is not guaranteed, and the failure was caught only because the file was run
   against a real database with stubs. The order by was unnecessary, so it was
   removed rather than depended on.

3. **Blank environment variables beat filled ones.** `.env.local` lists every
   name, so `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` was present but empty. `??`
   treats an empty string as a value, so it won over the correctly filled
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the app reported "your project's URL and
   Key are required" while the key sat in the file. Blank now means absent.

4. **The test harness leaked servers, which then broke the next run.** The
   harness killed its direct child, but `next start` spawns the real server as a
   grandchild, so an orphan survived holding the port and the next run died with
   `EADDRINUSE` before it even built. Children are now started in their own
   process group and the whole group is killed.

5. **The harness used hardcoded ports.** It also reserved the app ports at run
   time alongside the mock port, all three at once so two can never come back the
   same. The same class of bug had already bitten the mock service.

Verification at the end of Phase 2.1:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm test` | 54 of 54 |
| `npm run verify:auth` | 45 of 45, twice in a row, nothing leaked |
| `bash scripts/verify-schema.sh` | 29 checks across three suites |
| Import against real Postgres 17 | 39 conversations, 762 messages, exact match |
| Import run a second time | 0 created, 0 written, as designed |

## Environment note

Node 22 or newer is required. `@supabase/supabase-js` now refuses to run on Node 20 and below, and this was confirmed by testing on both. The project declares `"node": ">=22.0.0"`.
