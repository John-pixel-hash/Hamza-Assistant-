# 17. Project Delivery Mode

Phase 6. The delivery half of the assistant: projects planned and tracked to a
professional standard, where nothing is assumed and nothing is advised without
research.

The rule the whole mode is built on: missing information becomes a question,
never a silent guess. And when the deadline does not fit the scope, the
assistant says so plainly instead of agreeing politely and failing later.

## What is live now

### Intake (step 1)

Projects tab, New project button, one screen. Paste the brief in your own
words, link the client if there is one, add deliverables, deadline and budget
if known. On submit:

1. The project row is saved first. A slow or failed AI pass can never lose
   the brief.
2. The intake engine (flash lite, flash as repair) restates the brief into
   goal, deliverables, constraints, success criteria and the single next
   step.
3. If the deadline does not fit the scope, it says why in a deadline risk
   warning at the top of the project page.

### Gap questions (step 2)

The same pass writes three to six questions, most important first, each with
why it matters. They target the gaps that actually change the plan: who
writes the copy, who owns hosting and domain access, how many revisions, what
happens if the client delays content, is tracking configured, what is the
real pressure behind the deadline.

Question lifecycle: open, sent, answered, dismissed. Copy sends the wording
to the client as is. Recording an answer feeds the planner later. The page
counts what is still open, because the plan is built from answers, not
assumptions.

## What comes next in this phase

- Research wiring: the method is researched through the live Tavily engine
  before any plan is written, and the notes attach to the project
  (migration 0007 adds the link column).
- The step planner: ordered steps with method, the research behind it, time
  estimates and a quality checklist per step. Steps must be executable,
  never vague.
- Tracking: steps move through not started, in progress, review, done, or
  blocked with a named reason. Done is refused until the checklist passes.
- The client status update draft, in your voice, from real progress.

## Design notes

- One model call for intake plus questions, inside the 60 second serverless
  budget. The engine verifies live at about 15 seconds on flash lite.
- Free tier models only, like everywhere else.
- The plan section on the project page tells the truth about its state:
  while questions are open it points at them, and until the planner ships it
  says so rather than faking a button.
- Migration 0007 only adds a nullable project id to research notes, so the
  app runs fine before it is applied. The research query tolerates the
  missing column.

## Verified live on 2026-10-12

A deliberately vague brief (beauty salon site, no pages listed, no budget,
"needs it this month") went through the whole intake on production: project
created, brief restated, deadline risk flagged unprompted, four sharp
questions with reasons, plan section honest. Question lifecycle checked on
the same project: mark sent worked, recording an answer updated the chip and
the counter. Test project deleted afterwards.

The intake engine itself is verified against the real model with
scripts/verify-intake.mjs: restatement, deadline risk on a too small budget,
four questions, no dashes, 15.5 seconds on flash lite.

Harness checks: intake form reachable and honest, projects page offers it in
one tap, both pages closed to signed out visitors. Unit tests cover the
payload parser: goal required, junk questions dropped, duplicates removed,
cap of six, deadline risk carried through, model repair path.
