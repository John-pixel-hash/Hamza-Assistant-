# Deploying Hamza Assistant

Goal: a private app, reachable from your phone anywhere, that only your account
can open. No server to maintain and no monthly cost, because Supabase and the
hosting both have free tiers that a single user fits inside comfortably.

Read this whole page before starting. Steps 3 and 4 are the two that are easy to
get wrong, and both of them are about not locking yourself out.

## The shape of it

| Piece | What it is | Where it lives | Cost |
| --- | --- | --- | --- |
| The app | Next.js, this repository | Vercel | Free |
| The database | Postgres with row level security | Supabase | Free |
| The AI | Gemini API calls | Google | Free tier, see the note at the end |
| Your conversations | Rows in the database | Supabase | Free |

Nothing here is a demo instance. This is the real app, using your real data.

## Step 1: Put the code on GitHub

The project is already a git repository with one commit that contains no secrets.
Check that for yourself before you push, because this is the last moment it is
easy:

```bash
git status                     # expect: nothing to commit, working tree clean
git log --oneline              # expect: one commit
git ls-files | grep -c "^.env" # expect: exactly 1, and it is .env.example
```

That last command should print `1`. `.env.example` contains placeholder names,
not values. If it ever prints more than one, stop, because a real key is about to
be committed.

Then create an empty **private** repository on GitHub called `hamza-assistant`
and push:

```bash
git remote add origin https://github.com/YOUR-USERNAME/hamza-assistant.git
git push -u origin main
```

Private matters. This is your client data and your business.

## Step 2: Create the Supabase project

Full click by click instructions are in `docs/04-SETUP.md`, Step 1. The short
version: create the project, choose the region closest to Lagos, then run the
four migration files in the SQL editor in order.

Come back here once **Table Editor** shows `clients`, `messages`, `projects` and
`playbooks`.

## Step 3: Create your account BEFORE switching the lock on

This is the step that locks people out, so read it twice.

Signups are controlled by two settings: `ALLOW_SIGNUP` and `ALLOWED_EMAIL`. The
correct order is:

1. In Supabase, **Authentication**, **Sign In / Providers**, make sure **Email**
   is enabled so signups can happen at all.
2. In Vercel, set the environment variables from Step 4 with `ALLOW_SIGNUP=true`
   and `ALLOWED_EMAIL` empty.
3. Open your deployed `/setup` page and create your account. Use a password of
   12 characters or more. It is the only account this system will ever have.
4. If Supabase sends a confirmation email, click the link before signing in.
5. Now come back and set `ALLOWED_EMAIL` to that address and `ALLOW_SIGNUP=false`,
   then redeploy.

After step 5 the app admits exactly one address and refuses every other account,
including accounts that exist in Supabase. That behaviour is covered by the
automated tests, so it is proven rather than assumed.

You can do steps 3 to 5 before step 4 completes if you prefer to create the
account locally first. Either order works as long as `ALLOW_SIGNUP` is true while
you claim the account.

## Step 4: Deploy to Vercel, and get the variables exactly right

1. Go to vercel.com and sign in with GitHub.
2. **Add New**, then **Project**, then import `hamza-assistant`.
3. Framework preset: Next.js. Leave the build settings alone.
4. Before clicking Deploy, open **Environment Variables** and add every row
   below. Do this now rather than after the first deploy, because adding them
   later means another deploy anyway.

| Name | Value | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase, Project Settings, API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | starts `sb_publishable_` | Supabase, Project Settings, API Keys |
| `SUPABASE_SECRET_KEY` | starts `sb_secret_` | Same page. Server only |
| `GOOGLE_GENERATIVE_AI_API_KEY` | your Gemini key | Already in `.env.local` |
| `ALLOWED_EMAIL` | your email | Empty for the first deploy, see Step 3 |
| `ALLOW_SIGNUP` | `true` for the first deploy | `false` after you claim the account |
| `DEFAULT_AI_PROVIDER` | `google` | Fixed for now |
| `RESEARCH_PROVIDER` | `tavily` | Used in Phase 5 |
| `NEXT_PUBLIC_APP_NAME` | `Hamza Assistant` | Shown in the interface |
| `TONE_SCORE_THRESHOLD` | `7` | Guardrail strictness |
| `RATE_LIMIT_AI_CALLS_PER_HOUR` | `120` | Cost control |

If your Supabase project shows the older key names, use
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` instead. Both
formats work.

Set each variable's environment to **Production, Preview and Development** so a
preview deployment is not broken.

Two warnings that matter:

- The secret key must go in `SUPABASE_SECRET_KEY`, never in a `NEXT_PUBLIC_`
  name. The app refuses to start if you swap them, but do not rely on that.
- Do not add the value from your Drive `.env.local`. That project belongs to a
  different product.

5. Click **Deploy**. It takes about a minute.
6. Open the URL Vercel gives you. You will land on `/login`, then `/setup` while
   no account exists.

## Step 5: Turn the lock on, then test it

1. Claim your account as described in Step 3.
2. Set `ALLOWED_EMAIL` and `ALLOW_SIGNUP=false` in Vercel, then redeploy.
3. Test from your phone: sign in, open a client, and confirm it works away from
   your desk. That is the whole point of deploying.
4. Test that the lock holds. In a private browser window, try to sign in with a
   different email address. You should be refused and shown why.

## Step 6: Import your conversations

Once you are signed in on the deployed app, open the Supabase SQL editor, paste
`scripts/import-instagram-engaged.sql` and run it once. Expect 39 conversations
and 762 messages, and expect the second run to write nothing.

That file is git ignored because it contains your private conversations in plain
text. Keep it local, or regenerate it when needed:

```bash
python3 scripts/build-instagram-import.py --selection engaged
```

## Step 7: Keep it alive

A free Supabase project pauses after about a week with no activity. Your app
will simply not load, which looks alarming the first time. Open the Supabase
dashboard and click **Restore**, and it comes back within a minute. Signing in
regularly is usually enough to prevent it. If it ever becomes annoying, the paid
tier removes pausing.

## What is checked, and what is not

Honest answer to "is everything checked".

| Layer | State |
| --- | --- |
| TypeScript, strict mode | Clean, zero errors |
| Unit tests | 61 passing |
| End to end access checks | 47 passing against a real running server |
| Database schema | 29 checks passing against real Postgres 17 |
| Session cookie hardening | Verified live over both HTTP and HTTPS |
| Import against a real database | Exact match, and idempotent |
| Built and served in production mode | Verified, all screens render |

What is **not** verified, and cannot be from here:

- Anything on Vercel. I have no access to your account, so the deployment itself
  is unverified until you do it. The build is proven to work; the hosting is not.
- Anything against your real Supabase project. It does not exist yet.
- The AI features. Those are Phase 3 onwards and are not written yet. Right now
  the app stores and searches your conversations, and it does not yet draft
  replies.

That last point is worth being clear about so the app does not disappoint you on
day one: what you can deploy today is a fast, private, searchable client hub. The
drafting, planning and research come next.

## The AI cost question

Your key is on the free tier and the app is routed accordingly, so everyday use
costs nothing. Flash models work, Pro models are quota blocked. When you enable
billing later, switching the harder jobs to Pro is three lines in
`scripts/seed-config.sql`, no code changes.

Two numbers to watch as usage grows. The free tier has a daily request limit
that resets at midnight Pacific, which is 8am in Lagos, and long conversations
make each request heavier. If you start hitting limits during real work, billing
is the fix, and the telemetry tables will show you exactly which job is spending
the requests.
