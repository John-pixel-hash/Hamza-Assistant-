# Phase 4: the memory engine

Goal from the brief: the system remembers client names, conversation history,
project details and preferences, and searches over them. Phase 2 already stores
the history. Phase 4 makes the system *use* it without re reading everything.

## 4.1 Fact extraction, done 2026-10-10

After every saved message (the reply panel's save and the composer), one memory
pass runs over the last twelve messages of the thread:

1. The lite model extracts durable facts only, under a prompt that forbids
   inference: country, budget, currency, store link, niche, products, platform,
   deadline, what was promised, what was refused, constraints.
2. `parseFacts` tolerates fences and garbage, caps at eight facts, normalises
   keys and values.
3. `planFactWrites` merges into `client_facts`: pinned facts are never touched,
   a stored fact is only replaced by one at least as confident, and re saving
   the same value is a no-op.
4. The pass never throws. A failed memory pass must not fail a save, and it is
   recorded in telemetry as `extract_facts`.

The pure half lives in `lib/ai/memory.ts` and is unit tested. The live half in
`lib/ai/memory-live.ts` takes an injectable client and generator, so the exact
code was verified against the real database before shipping.

Verified on the live project: the Fahad Khan thread produced country Pakistan,
budget 3,000 to 4,000 PKR, dropshipping, no inventory, Shopify, all stated in
the conversation. A backfill then ran one pass over all 39 imported threads, so
every client starts with a real fact sheet. The drafts already read these
facts, because the context assembler injects them.

## 4.2 Next: the fact sheet on the client page

He must be able to see, pin and delete what the system thinks it knows. Memory
he cannot inspect is memory he cannot trust.

## 4.3a Done: rolling relationship summary

Every memory pass now writes a second small output: a rolling two or three
sentence summary of the relationship, stored as the reserved fact key
`relationship_summary`. It rides the same injection path into drafts, renders
as a Relationship paragraph on the client page instead of a governable row,
and replaces itself on each pass so it stays current. Backfilled across all
live threads on 2026-10-10: 36 of 39 threads summarized, the other three were
too small to summarize.

## 4.3b: semantic recall

Built and tested, waiting on one database step that only the SQL editor can do:

1. `supabase/migrations/0005_vector_search.sql` adds pgvector, a 768 dimension
   `messages.embedding` column, the `search_messages_semantic` function and an
   HNSW index. Paste it once in Supabase, SQL Editor, New query, Run.
2. `node --env-file=.env.local scripts/backfill-embeddings.mjs` embeds every
   existing message (762 of them). Safe to rerun, it skips rows that already
   have an embedding.
3. From then on every memory pass embeds the newest messages automatically,
   and search becomes hybrid: exact word matches first, meaning matches after.

Until step 1 is done the app behaves exactly as before, full text search only.
The embedding call itself was verified live on 2026-10-10: gemini-embedding-001
returns 768 dimensions on the free tier.
