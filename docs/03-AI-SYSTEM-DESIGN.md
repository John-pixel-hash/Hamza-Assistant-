# AI System Design

This document is about how the assistant thinks. The architecture doc covered the plumbing. This covers behavior, which is where most AI tools fail.

## 1. Prompt composition: layered, not one giant prompt

A single large system prompt becomes unmaintainable and it wastes tokens by loading everything on every request. Instead the prompt is assembled per request from layers, in this order:

| Layer | Contents | Loaded when |
| --- | --- | --- |
| 1. Identity and standards | Who it is, who you are, how it writes, non-negotiables | Always |
| 2. Mode instruction | What this specific task requires (reply, plan, research) | Always, varies by mode |
| 3. Domain playbooks | Expert knowledge for the relevant field, for example Shopify development or Meta Ads | Only for the domains this request actually touches |
| 4. Client memory | Structured facts plus rolling summary for this client | When a client is in context |
| 5. Project context | Brief, deliverables, current step, open questions | In project mode |
| 6. Retrieved context | Research notes and semantically similar past messages | When relevant |
| 7. Task instruction | The actual request and the required output format | Always |

Why this matters: a request about a Shopify scope question loads the ecommerce and web development playbooks and that client's facts. It does not load ad strategy or email marketing. Faster, cheaper, and sharper answers.

## 2. The voice rules, made concrete

"Never sound robotic" needs to be translated into rules a model can follow and a checker can verify.

Write like this:

- Short sentences. One idea each. Most client replies under 120 words unless the topic requires detail.
- Plain words. "Use" not "utilise". "Start" not "commence".
- Answer the actual question in the first line, then add context. Never open with a pleasantry you did not need.
- One clear next step per message. Not three options that push the decision back to the client.
- Specific over general. "Delivery in 9 working days, first draft Thursday" beats "we will deliver soon".
- Confidence with honesty. "That is doable, here is how" or "I need to check one thing first, you will have it today".
- Match the client's register. A casual Fiverr buyer does not get proposal language. A corporate buyer does not get emoji.

Never write like this:

- Em dashes and en dashes. As a hard rule, since you asked for it. Replaced mechanically with a comma or a full stop.
- Filler openings: "I hope this email finds you well", "Thanks for reaching out", "Great question".
- Hedging stacks: "I think maybe we could possibly". Say it or check it.
- Corporate padding: "leverage", "synergy", "circle back", "touch base", "dive deep".
- Apology loops. Apologise once if warranted, then move to the fix.
- Emoji unless the client uses them first.
- Long paragraphs. Nothing over four lines on a phone screen.

## 3. Client Reply mode

Input: pasted text, or a screenshot which is read by a vision model (extracted text shown to you for correction before use).

Pipeline:

1. Read intent. Classify what the client actually wants or is worried about: price objection, scope creep, timeline pressure, low trust, ghosting recovery, upsell opening, complaint, simple question.
2. Check memory. Pull the facts and past promises for that client. If the client was promised something two weeks ago, the draft must be consistent with it.
3. Research if needed. Anything involving platform specifics, current pricing, or policy goes through the research gate first.
4. Draft. Produces two versions, not one: a short direct version and a warmer version with more context. Same substance, different temperature. You pick in one click.
5. Add the next step. A specific recommended action and why it moves the deal: ask for the deposit now, propose a call before sending the proposal, send the scope document, wait five days and follow up with proof of work.
6. Flag risks. Scope creep in the message, an unrealistic deadline, a payment risk signal, a promise made earlier that this reply would break.
7. Log. The message, the client, the mode, the model, the cost, and the guardrail results all land in the database, and facts are extracted for future recall.

Output shape you see on screen: the client message, the read on it, two drafts, the next step, risk flags, then one button to save the reply to the client thread.

## 4. Project Delivery mode

Input: a brief, or a rough description of a project.

1. Understand before planning. It restates the project in its own words: goal, deliverable, constraints, and what success looks like. You confirm or correct.
2. Find the gaps. It asks the intelligent questions that separate a professional from a beginner: who writes the copy, who owns hosting and domain access, how many revisions are included, what happens if the client delays content, is tracking configured, what is the actual deadline pressure behind the date. Questions appear in a list with why each one matters, so you can pick which to send to the client.
3. Research the method first. Before recommending a process it checks current best practice for that specific job (for example the current recommended Shopify theme development workflow, or the current correct way to set up Meta pixel and Conversions API for a small store). It never recommends a process from stale memory.
4. Plan. Phases, steps, tools, time estimates, who does what, dependencies, and a quality checklist per step. Steps are specific enough to execute: "Install and configure the pixel and test one purchase event end to end" not "do tracking".
5. Track. Steps move through not started, in progress, review, done. Blocked steps name what is blocking them. Nothing is marked done without passing its checklist.
6. Own the outcome. The mode is instructed to behave as the party responsible for delivery, which means flagging a bad plan or an impossible deadline rather than agreeing politely and failing later.

## 5. Research gate

The rule is: never guess technical or strategic information. Enforced in three places.

- Pre answer classification. A cheap model decides whether this request depends on facts that change. If yes, search runs before the answer.
- Tool use. The model has a `research` tool with a schema. When it calls the tool, the sources are saved and attached to the answer.
- Honest fallback. If the model cannot verify something material, it must return a specific message naming what it needs to check and why, rather than a confident guess. This is tested deliberately in Phase 5 with questions whose answers the model cannot know.

Freshness policy:

| Fact type | Reuse window |
| --- | --- |
| Ad platform policies, feature rollouts, tool pricing | 14 days |
| Platform best practices, algorithm behavior | 30 days |
| Design trends, market benchmarks | 90 days |
| Fundamentals (how HTTPS works, what a sales funnel is) | no research needed |

## 6. Domain knowledge: the eight playbooks

Each is an expert module stored in the `playbooks` table, versioned and editable, refreshed by the research engine, and loaded only when relevant.

| Playbook | Contains |
| --- | --- |
| Web design and development | Discovery process, scope definition, Shopify and WordPress workflows, custom build standards, performance targets, handover checklist, common client disputes and how to prevent them |
| Graphic design | Brief structure, revision policy that protects margin, file delivery standards, brand consistency checks |
| Meta ads | Account structure, creative testing frameworks, pixel and Conversions API setup, budget pacing, diagnosis trees for "no sales" and "high CPM", policy risk avoidance |
| Google ads | Search intent mapping, keyword and negative strategy, conversion tracking, waste reduction |
| Digital marketing strategy | Positioning, channel selection by budget and margin, funnel design, measurement that is actually implementable for small businesses |
| Ecommerce and dropshipping | Product selection criteria, supplier and shipping reality checks, store conversion essentials, returns and support handling, unit economics |
| Email marketing | List building, deliverability basics, flows that matter for small stores, subject lines and copy that do not look automated |
| Fiverr and client management | Gig positioning, inbox response strategy, negotiation without discounting value, scope protection, review management, converting one off buyers to repeat clients |
| Sales psychology and closing | Objection handling by type, price anchoring, deposit and commitment mechanics, follow up cadence, when to walk away |

Each playbook is written as practical operating knowledge with checklists and decision trees, not as an essay. Where a claim depends on current platform behavior, the playbook flags it for the research engine rather than stating it as fixed truth.

## 7. Model switching, designed in

- Every request is routed by task type to a configured default model.
- Any thread can override to a specific model from the UI, and the override is stored on the thread.
- Adding a new provider is: install the provider package, add the key, add rows to the registry. No changes to the reply logic.
- The telemetry view shows cost and quality signals per model so switching is an informed decision, not a guess.

## 8. Quality control loop

- Every draft is scored before you see it.
- Every draft you edit is stored with the original, so improvements are visible over time.
- The first two weeks of use are calibration. Any draft that sounds off gets flagged, and those examples get folded into the prompt layer as reference style.
- Monthly review: cost per mode, models used, guardrail interceptions, research usage. This tells us where to route cheaper models and where quality is worth paying for.

## 9. What the assistant will refuse to do

Stated plainly so it is designed in from the start:

- It will not send anything to a client on its own.
- It will not invent a technical detail, a price, a deadline, or a policy.
- It will not agree to a scope, timeline, or discount on your behalf.
- It will not pretend to remember something that is not in memory. It will ask.
- It will not produce a long answer when a short one is what the situation needs.
