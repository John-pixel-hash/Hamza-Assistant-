# Phase 3: the conversation hub

This is the phase where the app starts doing the thing it was built for: a real
client message goes in, and a reply comes out that sounds like Hamza and closes.

Nothing here is built yet. This is the plan, and it needs a yes before code.

## The acceptance test

Phase 3 is done when this works, on a real conversation, on the phone:

1. Paste a real client message, or upload a screenshot of the chat.
2. Pick the platform. Fiverr, Instagram, WhatsApp, email, Facebook, TikTok.
3. Get a draft that matches their tone, asks at most one question, contains no
   chase phrasing, no list, and no em dash, and sits inside the length budget.
4. Get one suggested next step aimed at moving the deal.
5. Edit it if needed, copy it, send it, then tap "this is what I sent".
6. That final version is remembered against the client and the thread.

If any of those six steps is missing, the phase is not finished.

## What is in, and what waits

**In:** reply drafting, tone matching, next-step suggestion, screenshot reading,
client memory inside the prompt, research grounding where a fact is needed, and
capturing what was actually sent so the assistant improves.

**Waits:** sending emails from the app, any auto-sending, Fiverr integration,
campaign analytics, invoicing. None of those help close the next deal.

## Architecture

Five small modules, each with one job, plus the UI. The reason for the split is
that the part which must sound human is a prompt, and the part which must never
break is code, so they are kept apart where possible.

### 1. `lib/ai/provider.ts` (new)

The only place in the codebase that knows which model is being used.

- Reads `task_routing` for the signed-in user, falls back to the seed values.
- Exposes `getModel(task)` returning a model handle, so switching provider
  later is a row change, not a code change.
- Exposes `logRun()`, which writes to the existing `ai_runs` table, including
  the guardrail flags under `guardrail_actions`.

Your model choice stands: `gemini-3.5-flash` for drafting, `gemini-3.1-flash-lite`
for classification and extraction, free tier, no billing switch.

### 2. `lib/ai/voice.ts` (done)

The behaviour contract, as text. Built from `09-ASSISTANT-BEHAVIOUR-SPEC.md` and
`10-VOICE-AND-METHOD.md` plus the approved shortlist in `11-GOLD-EXAMPLES.md`.

- The one follow up rule, the no chase rule, the one question rule, the no list
  rule, the register, and what never to claim.
- Tone instructions per detected tone, and per platform.
- The reference examples, loaded as a generated TypeScript file so they ship
  with the build and cannot go stale unnoticed.

The examples are reference, not templates. The instruction around them says so
explicitly, because pasting someone's old words into a new conversation is
exactly the robotic failure being avoided.

### 3. `lib/ai/context.ts` (done)

Pure functions that assemble what the model is told. No model calls, so it is
fully testable.

- Client profile, stage, and the facts recorded about them.
- The last messages in the thread, oldest first, with roles, capped so a long
  conversation does not blow the context window or the quota.
- The project details, if this thread has one.
- Which platform, which tone, and what the client actually said this time.
- Keyed on the thread id, never on the handle. Fifteen different people share
  `instagramuser` in the real archive, so the handle is not an identity.

### 4. `lib/ai/draft-core.ts` and `lib/ai/draft.ts` (done)

The hot path, and the only function the UI calls.

```
build the prompt
  -> generate with gemini-3.5-flash
  -> run enforceStyleWithTelemetry
  -> if it reports a chase, more than one question, a list, a banned opener,
     or being over budget: regenerate once, quoting the exact failure back
  -> guard the second draft as well
  -> if it still fails, return it with the failures attached and say so in the UI
  -> never silently hand over a draft that breaks a rule
```

One regeneration maximum. That protects the free tier, and it means the second
draft is a repair, not a lottery.

### 5. `app/actions/drafts.ts` and the UI (new)

- `draftReply()` server action, guarded by the same owner check as everything else.
- `markSent()`, which stores what he actually sent, edited or untouched.
- The panel lives on the **thread page**, not the client page, because a thread
  is one conversation with one client and that is where the history already is.
  Paste box, platform picker, tone picker, an optional instruction, the draft in
  an editable box with a word and question count, a copy button, and one tap to
  record what was sent. Mobile first, because that is where this gets used.
- It is server rendered and asserted in the auth harness with a seeded thread, so
  a broken panel fails the suite rather than being discovered on the phone.

The screenshot path adds `app/actions/vision.ts`: Gemini reads the image into
structured messages, then the normal draft pipeline runs. The image itself is
extracted and discarded, not stored. Fewer copies of a client's private chat
sitting around is simply the better default.

## How the assistant gets better over time

Three mechanisms, all boring and inspectable. No self-modification, no
fine-tuning, nothing that changes rules behind your back.

1. **Run telemetry.** Every draft records which flags fired. After a few weeks
   that answers "does the model keep trying to chase" with a number.
2. **Drafts against reality.** When you mark what you actually sent, both
   versions are kept. The gap between the draft and your version is the single
   most useful signal in the system: it shows exactly where the assistant still
   sounds like an assistant. Once there are enough of them, your sent versions
   become the reference set, and the document wording matters less.
3. **Client facts.** When the assistant works something out about a client, it
   proposes it and you accept it. It never writes to your memory store silently.

## Decisions I am making, so you can overrule them now

- **Language follows the client.** If they write Italian, the draft is Italian.
  Your archive shows you doing this already, so it is your own behaviour, not my
  preference. No translation unless asked.
- **Screenshots are read and discarded**, never stored.
- **Nothing is ever sent automatically.** The app drafts and copies. You send.
- **One regeneration maximum**, to protect the free tier.
- **Research is used only when a draft needs a fact**, not on every draft, for
  the same reason. When the assistant cannot verify something, it says so
  instead of guessing, which is your own rule.

## Build order, each step verified before the next

| Step | What | How it is proven |
| --- | --- | --- |
| 3.1 | `routing.ts`, `provider.ts`, `telemetry.ts`, usage panel | **Done.** Two real calls on the live key, model ids and latency recorded |
| 3.2 | `voice.ts` and `context.ts` | **Done.** 11 tests on the assembled prompt, no model calls |
| 3.3 | `draft-core.ts`, `draft.ts` | **Done.** 10 tests on the loop, plus two real drafts on live conversations |
| 3.4 | The reply panel | **Done.** Five checks in the auth harness prove it renders for the owner on a real thread |
| 3.5 | Replay against the archive | **Done.** Nine real conversations replayed and set beside what was actually sent (docs/13). Owner verdict on 2026-10-10: "this is exactly how i would sound i love it" |
| 3.6 | Screenshot reading | A real screenshot from your phone, extracted, then drafted |
| 3.7 | Tone auto detection | **Done.** A pasted message is scored by the lite model and the picker preselects the read, unless he overrides it |
| 3.7 | The learning loop | Your sent version stored beside the draft, and the diff visible |

Step 3.5 is the honest one. It is the closest thing to a fair test that exists
before real use: ten real messages, and you judge whether the draft beats,
ties or loses to what you sent by hand.

## What the real drafts found, 2026-10-08

`scripts/verify-draft.mjs` ran the pipeline on real conversations from the
archive, up to a real client message. Three findings, in order of importance.

**The model invented a service.** Asked to help a client grow their pages, it
offered to "create video content for TikTok and Instagram". That is not on the
catalogue. This is the fabrication risk arriving in practice, not in theory, and
it is invisible to any guard that only checks phrasing. The fix is in the voice
contract: the catalogue and its prices are now listed as the complete set of
what he sells, with an explicit instruction that inventing a service is the
worst failure available here, because he has to deliver it afterwards.

**Two drafts came back clean on the first attempt.** Both stayed inside the
length budget, asked exactly one question, avoided lists and dashes. One handled
a Fiverr next step correctly by keeping it on the platform.

**Latency is 6 to 18 seconds** for a real draft with thinking enabled. Fine for
a reply he reviews before sending, and it is why the UI needs to show that it is
working rather than appear frozen.

## Verified on the live key, 2026-10-08

`node --env-file=.env.local --import tsx scripts/verify-ai-call.mjs` made two real
calls through the same code path the app uses:

| Task | Model | Result | Latency |
| --- | --- | --- | --- |
| reply_draft | gemini-3.5-flash | ok | 29,217 ms |
| tone_score | gemini-3.1-flash-lite | "Casual" | 3,533 ms |

One finding worth carrying forward: the drafting call reported 396 output tokens
and produced 11 words of visible text, because thinking tokens count against
`maxOutputTokens`. The drafting model needs a generous output budget, around
2,000 tokens, or the reply comes back cut in half while the telemetry looks
perfectly healthy. The reply itself also came back as a list opening, which is
exactly what the guard is there to catch.

## What I am watching for

- **Thinking tokens against the output budget.** See above. A draft that looks
  empty or truncated in Phase 3 is this, not a broken model.
- **Free tier quota.** Per model daily limits are not published with confidence,
  so Settings will show today's call count and which model served it. We find
  the ceiling from use, not from guessing.
- **Grounding output.** Research citations must inform the draft, never appear
  as a list of links in a message to a client.
- **The template trap.** The risk in this phase is not that the model writes
  badly. It is that it writes plausibly and generically. The guard flags catch
  the measurable cases, and step 3.5 is what catches the rest.

## What Phase 3 needs from you

Nothing except a yes. The Tavily question is settled, the model is chosen, the
rules are agreed, the examples are shortlisted. If the five decisions above are
acceptable, I start at 3.1.
