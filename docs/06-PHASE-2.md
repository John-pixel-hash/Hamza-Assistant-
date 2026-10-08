# Phase 2: Client Hub

What was built, what was proven, and the acceptance test to run with your real clients.

## What you can do now

| Task | Where |
| --- | --- |
| Add a client with stage, deal value, source, channel, tags, notes | Clients, then Add client |
| Search clients by name or company | Clients, search field |
| Filter by stage with one tap | Clients, stage chips |
| Open a client and see everything about them in one place | Clients, then the client |
| Start a conversation thread for a topic | Client page, Start a conversation thread |
| Paste a client message, your own reply, or an internal note | Thread page, composer |
| Upload screenshots and PDFs with a message | Composer, Attach screenshot |
| Read the full history across every thread for a client | Client page, Recent history |
| Search every message you have ever saved | Search in the bottom navigation |
| See who has gone quiet after a quote | Today, Needs attention |

## How it is put together

- `lib/data/` holds every database read, in one place per subject: clients, threads, search, overview, status.
- `app/actions/` holds every write. Pages never talk to the database directly.
- `lib/validation/` holds the form rules as pure functions, which is why they can be tested without a browser.
- `lib/domain.ts` holds the vocabulary: stages, sources, channels, message types. One place, so no screen invents its own wording.
- `lib/text/snippet.ts` holds formatting: money, time gaps, message previews, and safe search highlighting.
- Screenshots upload straight from the browser into your private storage bucket. Only the file path is sent to the server, so a large image never passes through a form post and hits a size limit.

## Data model changes

`supabase/migrations/0003_phase2.sql` adds:

1. Message types that describe a real conversation: `client`, `me`, `note`, plus the AI ones for later.
2. `channel` and `sent_at`, so three weeks of old messages can be pasted with their real dates and still read in order.
3. A trigger that keeps `last_contact_at` and thread activity in sync automatically. It cannot go stale because someone forgot to update it in code.
4. `search_messages` and `client_messages` functions, so search runs in the database rather than in the app.
5. Search snippets use `[[[` and `]]]` markers rather than HTML tags. Your client messages are untrusted text, and highlighting must never become an injection.

**Run this migration in your Supabase project.** Open the SQL editor and run the contents of `supabase/migrations/0003_phase2.sql`. It is safe on a database that already has data: any older `user` rows are converted to `client`.

## Verified

| Check | Result |
| --- | --- |
| TypeScript strict | clean |
| Unit tests, pure logic | 49 of 49 pass |
| End to end access checks | 39 of 39 pass |
| Database tests against real Postgres 17 | 17 of 17 pass |

New in this phase:

- **Pure logic (23 new unit tests).** Money parsing from what people actually type (`1.5k`, `$1,500`, `1500 usd`), tag cleaning, form validation, note and channel defaults, message previews, human time gaps, and safe search highlighting. The last one includes a hostile input test: a client message containing a `<script>` tag must survive as text and never become markup.
- **Database behaviour (7 new SQL tests).** Conversation types and channels enforced, activity syncing on insert, and the important one: a message from you does not move your client's last contact date, only their messages do. Search returns highlights, handles blank input, respects ownership, and a different account sees nothing.
- **Access checks (28 new).** Every new route is private by default, including deep paths that do not exist yet. A client id that does not exist shows a clear message instead of an error.

Three bugs the testing caught and fixed:

1. **A migration that would have failed on live data.** The new message types rejected rows saved under the old naming. The migration now converts them first. This was found because the test ran the migration against a database that already had rows in it.
2. **Test data collision.** Two test files used a client with the same name, and Postgres resolved different rows for different statements, producing a failure that looked like an app bug. The tests are now self contained and look rows up by owner.
3. **A guardrail gap.** The em dash rule treated a dash surrounded by spaces differently from one jammed between two words, so a jammed dash became a comma where a full stop was correct. Both cases now use the same rule: judge by what follows.

## The em dash rule, enforced in code

You asked for no em dashes in the application. That is now guaranteed two ways:

1. **For the interface:** a test scans every file the user can read and fails the build if an em dash or en dash appears. It caught nothing in the app itself, and it will catch the first one that slips in.
2. **For AI drafts, ready for Phase 3:** `lib/ai/style-guard.ts` now exists with tested behaviour. A spaced dash, a jammed dash, a number range such as 2020 to 2024, and a stray minus sign are each handled correctly, filler openings are removed, and every interception is counted so you can see how often the model tried. Nineteen tests cover it.

## Brand

The system now runs on your palette: blue, white, black, and a touch of gold.

| Role | Colour | Where it is used |
| --- | --- | --- |
| Blue | `#1d4ed8` | Primary buttons, links, active navigation, live deal badges |
| Deep navy | `#0a1b4d` | The brand mark, high emphasis blocks |
| Black | `#0b0d12` | All text |
| White | `#ffffff` | Cards and surfaces |
| Canvas | `#f4f6fb` | Page background behind the cards |
| Gold | `#c08a2e` | Used sparingly: eyebrow labels, the active tab marker, deal value figures, pinned facts |

The gold stays a detail on purpose. Buttons and large fills are never gold, which is what keeps it feeling premium instead of decorative. Warning amber and error red are deliberately different colours from gold, so a warning can never be mistaken for a brand flourish.

To change any colour later, edit the tokens at the top of `app/globals.css`. Every screen picks the change up automatically. There are no stray hex codes in the components.

## Acceptance test for you

Run this with three real clients and their real history from the last month:

1. Add all three clients with their stage and your best deal value estimate.
2. For each one, start a thread and paste the last few messages, setting the type correctly: theirs, yours, or a note.
3. Upload one screenshot of a client conversation.
4. Close the app, come back, and find any past message in under ten seconds. Use the client page for a known client, and Search for one you only half remember.
5. Check the Today screen. Anyone quoted and quiet for over a week should be listed under Needs attention.

If any step is slow or awkward, write it down and tell me. Friction in daily use is the thing worth fixing, not a missing feature.

## Known limits at this point

- No AI yet. Nothing is drafted, summarised or extracted. That is Phase 3 and Phase 4.
- No editing or deleting a saved message yet. If you paste the wrong thing, add a note correcting it for now and I will add editing in Phase 4 alongside the fact review screen.
- OCR and reading text out of screenshots arrives with the vision work in Phase 3.
- Deleting a client is deliberately not built yet. Cascading deletes work at the database level, but I want an explicit confirmation flow before putting that button in front of you.
