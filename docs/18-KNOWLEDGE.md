# 18. Knowledge Modules (Phase 7)

Status: shipped 2026-10-12.

What this is: the assistant's operating knowledge, split into domain playbooks that
load into AI requests only when relevant. The goal is answers and drafts that follow
Hamza's actual way of working, without paying token or quality cost on every request.

## The nine playbooks

| Slug | Covers | Time-sensitive |
|---|---|---|
| web-development | Stack choice, pricing, scope, timelines, handoff | yes |
| fiverr-client-management | Orders, platform rules, upsells, disputes | yes |
| sales-closing | Qualify, pitch, pricing conversation, follow-up | no |
| meta-ads | Campaign structure, budgets, creative, policies | yes |
| google-ads | Campaign types, bidding, quality score, policies | yes |
| ecommerce | Platform choice, funnels, conversion, fulfilment | yes |
| graphic-design | Briefs, deliverables, revisions, file handoff | no |
| email-marketing | Lists, flows, deliverability, subject lines | yes |
| marketing-strategy | Positioning, channels, funnels, planning | no |

Each playbook is practical operating knowledge: checklists and decision trees, not
generic advice. Fundamentals carry no freshness window; the app tells the model which
parts are perishable instead.

## How loading works

1. On every draft, intake, and plan request, the app loads all active playbooks.
2. `selectPlaybooks` scores each playbook by trigger-keyword hits against the incoming
   message, thread title, and client name. Maximum two playbooks attach, and only with
   at least one hit.
3. Attached playbooks are trimmed to the first 4,500 characters and placed in a
   "## Operating knowledge for this request" section inside the voice prompt. The
   section explicitly tells the model: use these as operating knowledge, not scripts,
   and follow the voice and rules above them on any conflict.
4. No hits means no knowledge section. Baseline behaviour is unchanged.

## Time-sensitive content

Each playbook with perishable facts declares a `## Research refresh` section: at most
two concrete research queries plus a `window_days` value in the table row.

| Window | Content type |
|---|---|
| 14 days | Ad platform policies, tool pricing, platform rules |
| 30 days | Platform best practices, algorithm behaviour |
| 90 days | Design trends, benchmarks |

`freshnessState` compares `last_researched_at` with the window and labels each playbook
`current`, `stale`, or `unverified`. The knowledge block tells the model which attached
playbooks are out of date and to verify perishable claims with research before advising
on them. The Knowledge page shows the same badge and offers a Refresh button that runs
the playbook's own research queries and stores the verified findings as a dated note at
the top of the content (bumps the version too).

## Editing and lifecycle

- The Knowledge page (header link "Knowledge") lists every playbook with version,
  status, and freshness. Owner only, like everything else.
- Edit: textarea on the card, server action `savePlaybookAction`. Version bumps by one,
  `updated_at` refreshes. No AI, no side effects.
- Shelve/restore: toggles `is_active`. Shelved playbooks stop loading everywhere
  immediately.
- Playbooks are rows in the `playbooks` table (migration 0006), not files. The markdown
  sources stay in `docs/playbooks/` as the seed of truth.
- Seeding: `node --env-file=.env.local scripts/seed-playbooks.mjs`. Insert-only: it
  never touches existing rows, so edits and versions survive re-seeding.

## Files

| Path | Role |
|---|---|
| `docs/playbooks/*.md` | The nine source playbooks |
| `scripts/seed-playbooks.mjs` | One-shot seeder (insert-only) |
| `lib/ai/knowledge.ts` | Selection, freshness, refresh queries, block assembly (pure) |
| `lib/data/knowledge.ts` | Playbook reads |
| `app/actions/knowledge.ts` | Save, toggle, refresh actions |
| `app/(app)/knowledge/page.tsx` + `components/playbook-card.tsx` | The page |
| `tests/knowledge.test.ts` | Selection, freshness, refresh parsing tests |

## What was verified at ship time

- Unit: selection (hit/no-hit, cap at two, tie-break), freshness states, refresh query
  parsing, verified-note stripping, stale marker in block. 153 tests pass.
- Harness 82/82 including: /knowledge rejects anonymous and non-owner, owner sees the
  empty state on a fresh database.
- Live: seeded into production, owner loads /knowledge and sees all nine playbooks with
  badges; refresh on a seeded playbook writes a dated verified note.
