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

## 4.3 Then: rolling summaries and semantic recall

A maintained summary of each relationship, and embedding based search over the
history for the questions keyword search misses.
