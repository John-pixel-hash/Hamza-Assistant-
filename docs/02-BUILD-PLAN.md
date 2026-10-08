# Build Plan

Nine phases. Each one ends with a real world acceptance test using your actual clients. Nothing moves forward until the previous phase passes that test. Speed is not the goal. A system you trust with real client communication is the goal.

Time estimates below are working sessions, not calendar days. They assume we build in sequence with review between phases.

---

## Phase 0: Foundation decisions

**Do:** Confirm the four open decisions (AI provider, hosting, research API, your business focus). Create the repository, the Supabase project, and the environment configuration. Approve the data model.

**Deliverable:** Approved schema, running empty app deployed to a URL you can open on your phone.

**Acceptance test:** You can open the deployed URL on your phone and see the app shell.

**Why first:** Every later phase depends on the data model and the provider choice. Changing them after building is expensive.

---

## Phase 1: Auth and security

**Do:** Supabase Auth with email and password. Single account. Signup disabled and an email allowlist enforced in middleware. Row level security policies written and tested on every table. Server side session verification on all protected routes.

**Deliverable:** A locked private app.

**Acceptance test:** You log in on both laptop and phone. A second email address is rejected at every route, including direct URL access and API routes. Verify this deliberately, do not assume it.

**Why this early:** A private client system with weak auth is worse than no system. This gets tested before any client data exists.

---

## Phase 2: Client Hub, without AI

**Do:** Clients, threads, message log, attachments, search. Create a client, start a thread, paste a message, upload a screenshot, tag stage and value, search past conversations by keyword.

**Deliverable:** A working client database.

**Acceptance test:** Enter three real clients with their real history from the past month. Close the app, come back, find any past message in under ten seconds.

**Why before AI:** If memory and structure are not solid, the AI output will be built on sand. Also, entering real history now means the assistant has context from its first AI day.

---

## Phase 3: AI core

**Do:** Provider adapter, model registry seeded from live provider model lists, prompt composer with the layered design, guardrail layer including the em dash blocker and the tone scorer, streaming responses, per thread model switching, telemetry logging.

**Deliverable:** The assistant answers, in your voice, with the rules enforced.

**Acceptance test:** Draft three replies to real clients. Check: zero em dashes, no filler openings, under the length budget, one clear next step, sounds like a competent human. Then switch the model mid thread and confirm quality holds and the switch is visible in telemetry.

**Risk to watch:** Tone is subjective. Expect to flag two or three drafts in week one. Those flags become calibration material, and the prompt layer gets tuned.

---

## Phase 4: Memory engine

**Do:** Fact extraction with structured output after each exchange. Rolling client summaries regenerated on a schedule. Fact review and edit UI on the client page. Embeddings and pgvector semantic search over messages.

**Deliverable:** Real memory, not a chat window.

**Acceptance test:** After a week of real conversations, ask "what are this client's main concerns and what did I promise them". The answer must be correct, sourced from facts and summary, and consistent with the actual history. Then ask a question about something mentioned once three weeks ago and confirm semantic search finds it.

**Why it matters:** This is the feature that makes the system feel like a partner rather than a tool.

---

## Phase 5: Research engine

**Do:** Search provider integration behind a `SearchProvider` interface. Pre answer classification of research need. Research caching with expiry policy. Source storage and display. The honest "I need to check this" path.

**Deliverable:** Current, sourced answers, and clean refusal to guess.

**Acceptance test:** Two tests, both required.
1. Ask about something that changed recently in one of your fields (for example a current Meta ads policy or a platform feature). The answer must include sources and dates.
2. Ask about something obscure and unverifiable. It must refuse to guess and say exactly what it would need to check.

**Why both tests:** Passing only the first test means you have a search tool. Passing the second means you have a system that will not embarrass you in front of a client.

---

## Phase 6: Project Delivery mode

**Do:** Project intake, gap question generation with reasoning, research before planning, step planner with per step quality checklists, dependency and blocker tracking, project status view.

**Deliverable:** Projects planned and tracked to a professional standard.

**Acceptance test:** Run one real project end to end through the system. Before advising on method, it must research. Missing information must produce intelligent questions, not silent assumptions.

---

## Phase 7: Knowledge modules

**Do:** Write the eight playbooks as practical operating knowledge with checklists and decision trees. Load them selectively by request domain. Mark time sensitive content for research refresh.

**Deliverable:** Expert level domain depth, tunable without code changes.

**Acceptance test:** Ask a hard, specific question in each of the eight domains. The answer should read like an experienced practitioner wrote it, and it should not contain a single claim that is out of date or unverifiable.

---

## Phase 8: Hardening, documentation, ownership

**Do:** Cost dashboard from telemetry. Nightly data export you control. Error handling and retry everywhere. Rate limiting verified. Mobile layout polish. Written user guide. Documented recovery steps if a key or the database has a problem.

**Deliverable:** A system you can run and recover without help.

**Acceptance test:** You spend a full working week using it for real client work. Any friction, ambiguity, or annoying behavior goes on a fix list and gets fixed.

---

## Standing rules through every phase

- If information is missing, the system asks rather than assumes. Same applies to me during the build.
- No placeholder work. Every phase ships something functional.
- Every phase has a documented test. Untested means unfinished.
- Your real client work is the test data, entered by you, so nothing lives only in a demo.
- Nothing that touches a client is ever automatic. Drafts only, your approval always.

---

## What I need from you to start Phase 0

1. Which AI provider key you can create first (Anthropic, OpenAI, Google, or more than one).
2. Where the system should live: cloud so it works from your phone daily, or local first.
3. Which web research API to use, or whether I should pick at build time.
4. A short description of your business: what you sell most, typical client, typical price range.

Answer those and Phase 0 starts immediately.
