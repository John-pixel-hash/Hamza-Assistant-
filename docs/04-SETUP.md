# Setup Guide

What you create, in order, and how to confirm each step actually worked. Nothing here needs coding on your side.

## Decisions locked (your answers)

| Decision | Choice | Why it matters later |
| --- | --- | --- |
| Primary AI provider | Google Gemini | Cheapest strong option, excellent vision for client screenshots. The adapter means adding Claude or GPT later is configuration, not a rebuild. |
| Hosting | Cloud: Supabase plus a Next.js host | Works from your phone anywhere, always on, no laptop required |
| Research API | Tavily | Built for AI agents, clean extracted content, free tier covers a single user comfortably |
| Your focus | Websites plus marketing, roughly equal | Playbook depth order: web development and Meta ads first, then ecommerce, sales, and the rest |

## Step 1: Supabase project

This is the database for the assistant. It must be its own project. The project
in your Drive belongs to a different product and has none of these tables, so
nothing should be added to it.

### 1a. Create the project

1. Go to supabase.com/dashboard and sign in.
2. Click **New project**.
3. Name it something you will recognise later, for example `hamza-assistant`.
4. Set a **database password**. Generate a strong one and save it in your password manager. You will rarely need it, but losing it means losing access to the database.
5. **Region**: pick the closest to Lagos. `West EU (Ireland)` or `Europe (Frankfurt)` are the sensible choices. Region cannot be changed later without recreating the project.
6. Click **Create new project** and wait about two minutes for it to finish provisioning.

### 1b. Copy the three values

1. In the left sidebar, open **Project Settings**, then **API Keys**.
2. You need two keys and one URL.
   - **Project URL**: also shown at the top of **Project Settings** under **API**. It looks like `https://abcdefghijklmnop.supabase.co`.
   - **Publishable key**: starts with `sb_publishable_`. This one is safe in the browser.
   - **Secret key**: starts with `sb_secret_`. This one bypasses every security rule, so it stays on the server and never goes near a browser or a chat message.
3. If your project only shows the older names, that is fine. `anon` is the same thing as publishable, and `service_role` is the same as secret. Both formats work. New projects created today usually show the new pair.

Where each value goes in `.env.local`:

| Supabase dashboard | `.env.local` |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_...`) or anon key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Secret key (`sb_secret_...`) or service_role key | `SUPABASE_SECRET_KEY` |

If you paste a secret key into the publishable variable by mistake, the app
refuses to start and tells you why. That check exists because that one mistake
would hand full database access to anyone who views the page source.

### 1c. Create the tables

1. In the left sidebar, open **SQL Editor**, then click **New query**.
2. Paste the full contents of each file below and click **Run**, one file at a time, in this exact order:
   1. `supabase/migrations/0001_init.sql`
   2. `supabase/migrations/0002_storage.sql`
   3. `supabase/migrations/0003_phase2.sql`
   4. `supabase/migrations/0004_outreach_tracking.sql`
3. Confirm it worked. Open **Table Editor** and you should see `clients`, `messages`, `projects`, `playbooks` and the rest. Open **Storage** and you should see a private bucket named `attachments`.

### 1d. Close the door on public signups

1. Open **Authentication**, then **Sign In / Providers**.
2. Turn off email signups once you have created your own account in Step 5. The app also refuses any account that is not yours, but a door that is locked twice is better than a door that is locked once.

## Step 2: Google AI Studio key

You already have a working key and it is on the free tier, so this step is
mostly a note for later.

1. The key is already in `.env.local` as `GOOGLE_GENERATIVE_AI_API_KEY`.
2. Free tier limits change and are applied per project, not per key. To see your
   current numbers, open **aistudio.google.com/rate-limit**. Requests per day
   reset at midnight Pacific time, which is 8am in Lagos.
3. On the free tier, Flash models work and Pro models are blocked by quota. The
   app is set to use Flash models only. Model routing is a configuration value,
   so if you enable billing later you can point the harder jobs at Pro without
   any code changes.
4. If you ever create a new key: aistudio.google.com, **Get API key**, then copy
   the value into `GOOGLE_GENERATIVE_AI_API_KEY`.

## Step 3: Tavily key

1. Create an account at tavily.com. The free tier is 1000 searches per month, which is enough for one person. Billing can be added later if you research heavily.

## Step 4: Hosting account

1. Create an account at vercel.com. Connect it to the GitHub account where this project will live. Do not deploy yet.

## Step 5: Environment file

Copy `.env.example` to `.env.local` and fill in the values. That file is git ignored and never leaves your machine.

Requirements before you start: Node 22 or newer (`node -v`). The Supabase library refuses to run on Node 20.

### First run sequence (this exact order matters)

1. In `.env.local`: set the Supabase URL, the publishable key and the secret key, set `ALLOW_SIGNUP=true`, and leave `ALLOWED_EMAIL` empty.
2. Start the app and open `/setup`. Create your account. Use a real password of 12 characters or more. This is the only account the system will ever have.
3. In the Supabase dashboard, under Authentication, turn off new signups if you have not already.
4. Back in `.env.local`: set `ALLOWED_EMAIL` to the email you just used, and set `ALLOW_SIGNUP=false`.
5. Restart the app. From here, `/login` is the only way in, and any other account is refused and signed out.

This sequence is covered by automated tests, so the behaviour is proven rather than assumed.

### About email confirmation

Supabase has "Confirm email" on by default. With it on, after step 2 you must click the link Supabase emails you before you can sign in. That is fine and slightly safer. If you would rather skip it, turn it off under Authentication, Providers, Email before creating the account.

## Step 6: Verify the schema and the access rules (repeatable)

The schema was verified against a real Postgres 17 with pgvector before you saw it. Twenty six tests across three suites, covering user isolation, forged writes, full text search, semantic search, storage isolation, the telemetry views, and the pipeline stages, all passed.

To re-run the verification any time, on a machine with Postgres installed:

```bash
bash scripts/verify-schema.sh
```

Run this after any future schema change. A failed test means the change is not ready.

The application has its own checks:

```bash
npm run typecheck     # strict TypeScript, zero errors
npm test              # 53 unit tests: access rules, guardrails, copy rules
npm run verify:auth   # 45 end to end checks against a running server
```

`npm run verify:auth` builds the app against a mock Supabase and drives real sign ins, real cookies, and a real second account that must be refused. Details and results are in `docs/05-VERIFICATION.md`.

## Step 6b: Import your Instagram history

Optional, and recommended. You have an export of 393 conversations already
parsed. The 39 that got a reply are the ones worth bringing in.

1. Make sure you have signed in once, so your account exists.
2. Open **SQL Editor**, **New query**.
3. Paste the full contents of `scripts/import-instagram-engaged.sql` and run it.
4. It prints a confirmation with the conversation count, the message count and
   how many accounts Instagram would not name. Expect 39 conversations and 762
   messages.
5. Safe to run twice. The second run reports 0 created and 0 written.

Full detail, including what it deliberately refuses to do, is in
`docs/07-INSTAGRAM-IMPORT.md`.

## Step 7: Seed your configuration

After you have signed up and logged in once, run `scripts/seed-config.sql` in the Supabase SQL editor. It registers the Gemini models, sets which model handles which job, and pre-fills your business context. You can edit the business context afterwards in the app.

## What is built so far

| Item | Status |
| --- | --- |
| Architecture and build plan | Done, in `docs/` |
| Database schema with row level security | Done, tested |
| Storage policies | Done, tested |
| Configuration seed | Done, runs after signup |
| Next.js application | Done, Phase 1 |
| Client hub: threads, messages, screenshots, search | Done, Phase 2 |
| AI layer: replies, guardrails, model switching | Phase 3, next |
| Memory engine: facts and summaries | Phase 4 |
| Research engine | Phase 5 |
| Project delivery mode | Phase 6 |
| Eight playbooks written | Phase 7 |

## What happens next

Phase 3 is the AI core: the provider adapter, model switching, the reply
drafting screen, the guardrails including the em dash blocker, and telemetry so
you can see what each model costs. Your Gemini key is already in place, so
Phase 3 starts as soon as the database is connected.

The order that gets you there fastest:

1. Create the Supabase project and paste the four migration files (Step 1).
2. Send me the project URL, the publishable key and the secret key.
3. Create your account at `/setup` and lock the email (Step 5).
4. Import the 39 conversations (Step 6b). It takes about a minute.
5. Phase 3 begins, with a month of real conversations already in the system.
