# 17. Project Delivery Mode

Phase 6, complete. The delivery half of the assistant: projects planned and
tracked to a professional standard, where nothing is assumed and nothing is
advised without research.

The rules the whole mode is built on: missing information becomes a question,
never a silent guess. Method advice is researched before it is given. The
deadline that does not fit the scope is flagged plainly instead of agreed to
politely. And nothing is marked done until its quality checklist passes.

## The flow

Projects tab, New project button, one screen. Paste the brief in your own
words, link the client if there is one, add deliverables, deadline and budget
if known. The project saves first, so a slow AI pass can never lose the brief.

### 1. Intake and gap questions

The intake engine (flash lite, flash as repair, one call) restates the brief
into goal, deliverables, constraints, success criteria and the single next
step, and writes three to six gap questions, most important first, each with
why it matters. They target the gaps that change the plan: who writes the
copy, who owns hosting and domain access, revisions, what happens when the
client delays content, tracking, the real pressure behind the deadline.

If the deadline does not fit the scope, a deadline risk warning sits at the
top of the project page.

Question lifecycle: open, sent, answered, dismissed. Copy sends the wording
to the client as is. Answers feed the planner; open questions become listed
assumptions in the plan, visible, never hidden.

### 2. Research the method

One tap derives at most two search questions about the how (tools, prices,
pitfalls) and runs them through the live research engine. Notes attach to the
project through the project_id column added by migration 0007, with sources
and a summary. Partial saves on purpose: whatever completed before a slow
network is kept. A tighter synth timeout keeps the whole tap inside the
60 second serverless budget.

### 3. Build the plan

Refused without research. The planner (flash lite, flash as repair) writes
three to ten ordered steps from brief plus answers plus research. Each step
carries detail specific enough to execute, a method, the research url behind
that method (it may only cite urls the research returned), an honest estimate
in minutes, and a two to six item quality checklist. Open questions become a
visible assumptions list on the plan.

### 4. Track

Steps move not started, in progress, review, done, or blocked with a named
blocker. Done is refused server side while any checklist item is unchecked.
Checklists lock once the step is done. The project status follows the steps:
planned, active once work starts, delivered once every step passes, so the
dashboard never lies.

### 5. Client update

Written from the tracker only: what is done, what is in flight, what is
blocked and why, and the one thing the client needs to do next. Editable
before copying, in his voice, no invented progress.

## Design notes

- Every AI pass is one model call chain, inside the 60 second budget, free
  tier models only.
- Research notes query tolerates a database without migration 0007, so the
  page renders before it runs.
- The plan section tells the truth about its state at every stage.
- The intake and planner parsers are pure and unit tested; the harness walks
  a fixture project through the whole tracker screen.

## Verified live on 2026-10-12

One real project ran end to end through the system on production, on a
deliberately vague brief (gym landing page, logo only, ten days, around 200
dollars):

- Intake restated the brief and flagged the ten day turnaround as tight
  before any planning.
- Research saved two notes with sources; during a Gemini quota spike the
  synthesis honestly fell back to the raw sources instead of guessing.
- The plan arrived as six steps with checklists and estimates.
- Marking a step done before its checklist was refused with a plain reason;
  after ticking the checks, done went through.
- A second step was blocked with a named reason, shown on the page, then
  unblocked.
- The client update draft quoted the real done step and the real blocker,
  nothing invented.

Test projects and their notes were deleted afterwards. The intake engine and
the planner parsers are also verified directly against the models with
scripts/verify-intake.mjs and the unit suite.

Harness: 78 checks, including the fixture project page asserting the
checklist gates, the visible assumptions, the research riding with the plan,
and the update drafted from the tracker.
