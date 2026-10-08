# Architecture

## 1. What this system actually is

A private web app, reachable from your laptop and phone, that holds your client memory and drafts your client and project work. Single user. No public signup. All AI calls happen on the server so no key ever touches a browser.

Three modes of use:

| Mode | You bring | You get |
| --- | --- | --- |
| Client Reply | A pasted message or a screenshot | A reply draft in your voice, a recommended next step, follow up timing, risk flags |
| Project Delivery | A project brief or a rough description | Missing questions, a researched plan, a tracked step list you work through |
| Ask | Any question about your business, a platform, a client | A researched answer with sources, or an honest "I need to check this" |

## 2. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js (App Router) + TypeScript | One codebase for UI and server. Server components keep logic and secrets off the client. Deploys anywhere. |
| Styling | Tailwind CSS + a small set of shadcn style primitives | Fast to build, mobile first, no design debt. |
| Database | Supabase Postgres | Real relational DB. You own the data. Free tier is enough for single user volume. |
| Auth | Supabase Auth, email + password, single account | Built in, handles session refresh properly with the `@supabase/ssr` package. |
| File storage | Supabase Storage, private bucket | Client screenshots and docs. Access only through short lived signed URLs. |
| Vectors | pgvector on the same Postgres | Semantic search over past conversations without adding another service. |
| AI layer | Vercel AI SDK (`ai` package) with provider packages | One interface for OpenAI, Anthropic, Google, and others. Swapping a model is a config change, not a rewrite. Handles streaming, tool calling, and structured output with Zod schemas. |
| Web research | Tavily by default, Brave as a drop in alternative | Search results plus clean extracted content in one call. Both are cheap and both have a free tier. |
| Hosting | Vercel, or any Node host | One click deploys, free tier covers one user, gives you an HTTPS URL for your phone. |

### Why this combination and not something else

- Supabase over a hand rolled Postgres: you get auth, storage, row level security, and now vector search in one place, with a real SQL database underneath. That is exactly the shape of this project.
- Vercel AI SDK over calling each provider directly: your requirement is "switch models later." The SDK makes that a one line change and gives streaming and tool calling for free. If we hardcoded one provider's SDK, switching models would mean touching the whole AI layer.
- No LangChain. This system is not a chain of autonomous agents. It is a small number of well defined workflows. Extra framework layers would add failure modes without adding value.

## 3. System layers

```
Browser (Next.js client components)
    |
    |  HTTPS, session cookie
    v
Next.js server: route handlers + server actions   <-- the trust boundary
    |
    +--> Auth guard (session check on every request)
    +--> Rate limiter
    |
    +--> Domain services
    |      ConversationService   (client hub: threads, replies, next steps)
    |      ProjectService        (intake, gap questions, plans, step tracking)
    |      MemoryService         (facts, summaries, semantic search)
    |      ResearchService       (search, fetch, cite, cache)
    |      PromptComposer        (assembles the final prompt from layers)
    |      Guardrails            (style and safety enforcement on output)
    |
    +--> AI Provider Adapter  -->  Anthropic | OpenAI | Google
    |
    +--> Repository layer  -->  Supabase (Postgres, Storage)
    |
    +--> Telemetry  -->  every AI call logged: model, tokens, cost, latency, guardrail actions
```

Two rules about this diagram:

- The browser never talks to an AI provider or an API key directly. Everything sensitive lives behind the server boundary.
- Domain services hold the business logic. Route handlers are thin. This keeps features testable and prevents the classic mess where logic is scattered across components.

## 4. Data model

Tables. Every table carries `user_id` and a row level security policy of `user_id = auth.uid()`, so even a bug in the app cannot leak data.

**Core**

- `profiles` one row, your account, settings, default model, voice preferences.
- `clients` name, company, source (Fiverr, referral, Instagram, cold email), country, timezone, stage (lead, quoted, negotiating, active, delivered, repeat), deal value estimate, tags, notes, last contact date.
- `client_facts` structured memory. Columns: `client_id`, `key` (for example "budget_signal", "decision_maker", "preferred_channel", "promise_made_on_2026_09_14"), `value`, `confidence`, `source_message_id`, `updated_at`. This is what makes the assistant feel like it remembers, without stuffing a hundred messages into the prompt.
- `threads` `client_id`, title, mode (client_reply, project, internal), status, default model.
- `messages` `thread_id`, role, content, `model_used`, token counts, cost, `research_note_id`, guardrail flags, created at.
- `attachments` `message_id`, storage path, kind (image, pdf), extracted text from vision or parsing.

**Work**

- `projects` `client_id`, title, brief, deliverables, deadline, budget, status, `brief_json`.
- `project_steps` `project_id`, order, title, method and why, status, owner, blocked by, quality checklist, deliverable link.
- `project_questions` `project_id`, question, why it matters, status, answer. These are the intelligent questions the system must ask before planning.

**Knowledge and intelligence**

- `research_notes` query, `sources` (jsonb array of url, title, publisher, date), summary, confidence, `expires_at`, tags. Cached so repeated questions cost nothing and so the assistant can show its sources.
- `playbooks` the eight domain knowledge modules. Columns: slug, title, version, content (markdown), `last_researched_at`, active. Editable from the UI so the assistant's expertise can be improved without a code deploy.
- `model_registry` provider, model id, label, strengths, cost per million input and output tokens, context window, enabled, default for which task type.
- `ai_runs` telemetry for every call: mode, model, latency, tokens, cost, whether research was used, guardrail actions taken. This is how you know what it costs and where it fails.

## 5. Memory design

The part most systems get wrong. A naive build pastes the whole conversation history into every request. That is expensive, slow, and it degrades as history grows. This system uses four tiers:

| Tier | What it is | When it is used |
| --- | --- | --- |
| 1. Raw transcript | Every message, stored forever | Full text search, audit, export |
| 2. Structured facts | Extracted key values with source message and confidence | Always injected. Small, dense, high value |
| 3. Rolling summary | 150 to 250 word summary per client, regenerated after every 8 to 12 new messages using a cheap model | Always injected for that client |
| 4. Semantic recall | Embeddings over messages in pgvector | Retrieved only when the current request needs it (search for related past context) |

Result: a client you have talked to for six months costs roughly the same per request as a client you met yesterday, and the assistant still recalls the specifics.

Fact extraction runs after each exchange using a structured output schema, so facts land in tidy rows rather than free text. You can edit or delete any fact from the client page. If the assistant learned something wrong, you fix it in two clicks and it stops being wrong.

## 6. Model strategy

Design: a registry, not a hardcoded model.

- Each task type has a default model. Heavy thinking (reply drafting, project planning, research synthesis) uses a frontier model. Light work (intent classification, fact extraction, summaries, the style scorer) uses a small fast model at a fraction of the cost.
- Per thread override. If a negotiation is delicate, you switch that thread to the strongest model from a dropdown.
- Fallback chain. If the primary provider errors or rate limits, the request retries on the next provider in your configured order, and the UI tells you it happened.
- Current model IDs are seeded from each provider's live model list endpoint at setup, not typed from memory. Third party pricing pages disagree with each other, so the app reads the truth from the source and you see what you are actually paying.

Starting lineup, to be confirmed live during Phase 3:

| Role | Anthropic | OpenAI | Google |
| --- | --- | --- | --- |
| Heavy reasoning and drafting | Opus class | GPT-5 flagship class | Gemini Pro class |
| Balanced everyday | Sonnet class | GPT-5 workhorse class | Gemini Flash class |
| Fast and cheap routing | Haiku class | mini or nano class | Flash Lite class |

You do not have to sign up for all three. One provider is enough to start, and the adapter means adding a second later is configuration, not development.

## 7. Research layer

Requirement: research properly instead of assuming, and never guess technical or strategic facts.

How it works in practice:

1. Classify. Before answering, a cheap model decides whether the request depends on facts that change over time (platform features, ad policies, pricing, algorithm behavior, competitor practices, tool capabilities).
2. If yes, research. The system runs one to three targeted searches, extracts the relevant passages, and stores them in `research_notes` with URLs and dates.
3. Answer with sources. The reply includes what it found and where. Claims that could not be verified are labeled as unverified rather than stated as fact.
4. If it cannot verify something important, it says so plainly: "I need to check this before I advise you," followed by exactly what it will check. It does not invent a confident answer.

Caching: research results are reused for 14 days for fast moving facts (ad policies, platform features, tool pricing) and 90 days for fundamentals. Repeat questions cost nothing.

Provider abstraction: a `SearchProvider` interface with Tavily implemented first and Brave as an alternative. Swapping is a config change.

## 8. Guardrails: rules that cannot be broken

Prompt instructions get ignored. So the non-negotiables are enforced after generation:

| Rule | Enforcement |
| --- | --- |
| Never use em dashes | Regex pass removes any em dash or en dash from output before you see it, and replaces it with a comma or full stop. Every interception is logged so we can see if the model keeps trying. |
| Never sound robotic | A small model scores each draft 1 to 10 on human tone, brevity, specificity, and clear next step. Below threshold, one automatic rewrite with the specific weakness named. |
| Never spam, never over-long | Per channel length budgets (Fiverr message, email, WhatsApp, proposal). Anything over budget is flagged with a shorter alternative. |
| Never assume | Research gate above, plus a hard rule that any technical or strategic claim not in memory and not researched must be marked as needing verification. |
| High professional standard | Banned phrases list (opening pleasantries that waste a line, "as an AI", filler like "I hope this finds you well"), plus a checklist per mode. |

Nothing is ever sent automatically. The system drafts, you approve. That stays true permanently, because an AI that emails clients on your behalf without review is a liability, not an assistant.

## 9. Security and privacy

- Single account. Signup disabled at the app level, plus an email allowlist check in middleware. Any other identity is rejected before it reaches a page.
- Row level security on every table, scoped to your user id.
- All provider keys server side only, in environment variables, never in the client bundle.
- Client screenshots in a private storage bucket, accessible only via short lived signed URLs.
- Auth via `@supabase/ssr` with HTTP only cookies and server side session verification on every protected request.
- Rate limiting on AI routes so a stuck loop cannot drain your API balance.
- Audit trail: every AI run and every research query is logged.
- Backup: nightly export of your data (clients, threads, messages, facts, projects) to a JSON file you keep, so you are never locked in and never dependent on one provider's retention.

## 10. Cost expectation

Realistic monthly estimates for daily single user use:

| Item | Estimate |
| --- | --- |
| AI usage, mixed frontier and small models | 8 to 30 USD per month |
| Web research API | free tier likely enough, 5 to 30 USD if heavy |
| Supabase | free tier, 25 USD per month for Pro if you want no idle pausing and guaranteed backups |
| Vercel | free tier |
| Domain, optional | about 12 USD per year |

The telemetry table shows actual spend per model, so this becomes a measured number after the first week rather than a guess. If cost becomes a concern, the fix is routing more tasks to smaller models, which the registry makes easy.

## 11. Known risks and honest tradeoffs

| Risk | Mitigation |
| --- | --- |
| Provider model IDs and pricing change every few months | Registry is data, seeded from live provider endpoints. No model id is hardcoded from memory or from a blog. |
| Free tier idle pausing on Supabase | Verified at setup time. If it threatens daily use, we move to Pro, since the whole point is that this is always available. |
| Tone scoring is subjective | The scorer plus your own feedback loop. First two weeks of use is calibration: you flag any draft that sounds off, and those examples become few shot references in the prompt layer. |
| Screenshot reading errors | Use a vision model, not generic OCR, and always show the extracted text next to the image so you can correct it in one click before it is used. |
| Over-reliance on the assistant | The system is built to advise and draft, never to send or commit. You keep the decision on every message and every scope change. |
| Feature creep | The build plan is ordered, and each phase has an acceptance test. Nothing moves forward until the previous phase works on your real clients. |
