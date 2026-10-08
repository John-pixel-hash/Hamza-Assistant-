# Hamza Assistant

A private, single-user AI operations system for running client work: replying to clients, closing deals, and delivering projects with consistent quality.

This is not a chatbot. It is a working tool with four jobs:

1. Keep a permanent, searchable memory of every client and conversation.
2. Draft client replies that sound like an experienced human, and suggest the next move to close.
3. Break projects into real steps, research the right method first, then hold the work to a standard.
4. Refuse to guess. Research when it matters, and say so when it does not know.

## Decisions locked

| Decision | Choice |
| --- | --- |
| Primary AI provider | Google Gemini, with an adapter so Claude and GPT can be added later as configuration |
| Hosting | Cloud: Supabase plus a Next.js host, so it works from your phone daily |
| Web research | Tavily |
| Focus | Websites (Shopify, WordPress, custom) plus digital marketing, roughly equal |

## Current status

**Phase 0 complete.** Architecture, schema and model strategy designed. Schema verified against real Postgres 17 with pgvector.

**Phase 1 complete.** The app runs, and access is proven rather than assumed.

**Phase 2 complete.** The client hub works: clients, conversation threads, pasted messages, screenshot uploads, and search across every conversation.

| Check | Result |
| --- | --- |
| TypeScript, strict mode | clean |
| Unit tests for pure logic | 49 of 49 pass |
| End to end access checks against a running server | 39 of 39 pass |
| Database tests against real Postgres 17 | 17 of 17 pass |
| Verified live sign in, session handling, sign out, refusal of a second real account | yes |
| Verified em dash and filler language rules enforced in code | yes |

Not built yet: AI layer, memory extraction, research, project mode, playbooks. Those are Phases 3 through 8.

Details of what was tested and which bugs it caught: `docs/05-VERIFICATION.md` and `docs/06-PHASE-2.md`.

## Brand

Blue, white, black, with gold used sparingly. Tokens live at the top of `app/globals.css`, so a colour change is one edit and every screen follows.

| Role | Colour |
| --- | --- |
| Blue, primary | `#1d4ed8` |
| Deep navy, brand mark | `#0a1b4d` |
| Black, text | `#0b0d12` |
| White, surfaces | `#ffffff` |
| Canvas, page | `#f4f6fb` |
| Gold, sparing accents | `#c08a2e` |

## The one rule that shapes everything

Most of the strict rules you gave (no em dashes, no robotic tone, no assuming) cannot be guaranteed by asking a model nicely. Prompts get ignored under pressure. So the rules that must never break are enforced in code, in a guardrail layer that sits between the AI and the screen. The prompt asks for good behavior. The code guarantees the non-negotiables.

## Documents

| File | What it covers |
| --- | --- |
| `docs/01-ARCHITECTURE.md` | Stack, data model, system layers, security, costs |
| `docs/02-BUILD-PLAN.md` | The 9 phases, in order, with acceptance tests |
| `docs/03-AI-SYSTEM-DESIGN.md` | How the assistant thinks: prompt layers, memory tiers, research gate, style rules |
| `docs/04-SETUP.md` | What to create (Supabase, Google key, Tavily, hosting) and the exact first run sequence |
| `docs/05-VERIFICATION.md` | What was tested in Phase 1, how, and the bugs it caught |
| `docs/06-PHASE-2.md` | The client hub: what was built, what was proven, your acceptance test |

## Repository layout

```
app/                          pages and server actions
  (app)/                      private area: today, clients, search, projects, settings
    clients/                  list, add, detail, edit
    threads/[id]/             one conversation, with composer and attachments
    search/                   full text search across every conversation
  actions/                    every write: auth, clients, threads
  login/  setup/              the only two public pages
  api/health  api/auth/       liveness and sign out
components/                   shared UI: shell, forms, composer, badges
lib/ai/style-guard.ts         em dash, filler and length rules, tested
lib/auth/guard.ts             the access rules, a pure function, unit tested
lib/data/                     database reads, fail soft when unconfigured
lib/domain.ts                 stages, sources, channels, message types
lib/text/snippet.ts           money, time gaps, previews, safe highlighting
lib/validation/               form rules as pure functions
lib/supabase/                 server, browser and session-refresh clients
proxy.ts                      the network boundary (Next.js 16 name for middleware)
supabase/migrations/          schema, storage, Phase 2, Phase 2.1 (all tested)
scripts/verify-schema.sh      runs migrations and 26 tests on real Postgres
scripts/parse-instagram-export.py    Instagram HTML export to JSON
scripts/build-instagram-import.py    JSON to a pasteable SQL import file
tests/                        unit tests, end to end access test, mock Supabase
```

## Commands

```bash
npm run dev              # local development
npm run typecheck        # strict TypeScript
npm test                 # 51 unit tests: access rules, validation, guardrails, copy rules
npm run verify:auth      # 45 end to end access checks
npm run verify           # all of the above, in order
bash scripts/verify-schema.sh   # schema against real Postgres (needs Postgres 17 + pgvector)

# Instagram history import. See docs/07-INSTAGRAM-IMPORT.md
python3 scripts/build-instagram-import.py --selection engaged   # 39 conversations
python3 scripts/build-instagram-import.py --selection awaiting  # the 9 waiting on you
python3 scripts/build-instagram-import.py --selection all       # all 393
```

## Pipeline stages

`outreach` is the stage for a conversation you started that has not been
answered yet. It exists so that hundreds of unanswered introductions stay out
of the follow up list and cannot bury the conversations that are real. The
client list sorts live work above outreach, and the Today screen only counts
real conversations as needing attention.

Stages, in the order the app sorts them: `active`, `negotiating`, `quoted`,
`contacted`, `lead`, `delivered`, `repeat`, `outreach`, `lost`.

Requires Node 22 or newer.

## First run

The order matters and is tested. Full steps in `docs/04-SETUP.md`, short version:

1. Fill in `.env.local`, set `ALLOW_SIGNUP=true`, leave `ALLOWED_EMAIL` empty.
2. Open `/setup`, create your account with a password of 12 characters or more.
3. Set `ALLOWED_EMAIL` to that address and `ALLOW_SIGNUP=false`. Restart.
4. From then on, `/login` is the only way in and every other account is refused.
