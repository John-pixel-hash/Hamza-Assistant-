# Instagram history import

This document covers what was in the Instagram archive, what the import does,
what it deliberately refuses to do, and how to run it.

## 1. What was analysed

You shared an Instagram data export in Google Drive. It was downloaded,
unzipped, and parsed. The numbers below are counts from the file, nothing is
estimated.

| Fact | Value |
| --- | --- |
| Conversations | 393 |
| Messages | 1769 |
| Date range | 21 August 2026 to 7 October 2026 |
| Group conversations | 0 |
| Messages with no text (a like, a missed call) | 3 |
| Conversations where the other person replied at least once | 39 (10%) |
| Conversations with no reply | 354 (90%) |
| Conversations where they replied twice or more | 22 |
| Conversations you opened | 385 of 393 (98%) |
| Conversations waiting on a reply from you | 9 |

The distribution matters more than the totals:

| Messages in the conversation | Conversations |
| --- | --- |
| 1 | 17 |
| 2 to 4 | 352 |
| 5 to 9 | 7 |
| 10 to 24 | 8 |
| 25 to 99 | 8 |
| 100 or more | 1 |

Most of the archive is one or two messages: an introduction and silence. That
is normal for cold outreach, and it is why a plain "import everything" would
have been the wrong default.

## 2. The conversations that actually went somewhere

These are the ones where a person engaged. Message counts are `yours / theirs`.

| Person | Messages | Span | Last activity |
| --- | --- | --- | --- |
| Joel.GILL_13 | 216 (88 / 128) | 24 days | 7 Oct 2026 |
| Invictus | 81 (36 / 45) | 18 days | 7 Oct 2026 |
| B NOVA | 62 (19 / 43) | 6 days | 27 Sep 2026 |
| GhostedFun | 53 (25 / 28) | 4 days | 2 Oct 2026 |
| Notorious | 39 (18 / 21) | 37 days | 1 Oct 2026 |
| Instagram User (unidentified) | 37 (22 / 15) | 10 days | 4 Oct 2026 |
| sheep.8931998 | 28 (15 / 13) | 5 days | 3 Oct 2026 |
| thefool6956 | 27 (14 / 13) | 10 days | 24 Sep 2026 |
| Drop_In_Pak | 26 (12 / 14) | 9 days | 5 Oct 2026 |
| Instagram User (unidentified) | 22 (10 / 12) | 4 days | 6 Oct 2026 |
| xelvunan | 18 (9 / 9) | 1 day | 2 Oct 2026 |
| chemsou.shop3746939 | 14 (7 / 7) | 7 days | 2 Oct 2026 |
| \_luxoriamart\_ | 13 (7 / 6) | 2 days | 24 Sep 2026 |
| Kendall57684 | 11 (6 / 5) | 14 days | 5 Oct 2026 |
| Onaolapo Istijabah | 11 (7 / 4) | 9 days | 5 Oct 2026 |
| lumajunior | 11 (7 / 4) | 6 days | 21 Sep 2026 |
| Fahad Khan | 10 (4 / 6) | 10 days | 23 Aug 2026 |
| VELOURA | 8 (5 / 3) | 3 days | 5 Oct 2026 |
| Nyca store | 7 (3 / 4) | 1 day | 12 Sep 2026 |
| jozy_ember | 5 (3 / 2) | 1 day | 7 Oct 2026 |
| angel.dloza | 4 (2 / 2) | 4 days | 19 Sep 2026 |
| arlonorth | 2 (0 / 2) | 1 day | 29 Sep 2026 |

Two of these are worth reading properly, because the pattern in them is not
visible in a count:

**Invictus** is the closest thing in the archive to a live deal. You reviewed
his store, he fixed what he could, he added you as a Shopify collaborator, you
went in, and the thread ends with him hesitating over the cost of a DTF machine.
There is real purchase intent, a real blocker, and no closed loop.

**Joel.GILL_13** is a 216 message conversation where the person repeatedly asked
how to invest with you and repeatedly asked how he could trust you. That is not
a store build conversation. It is a trust and terms conversation, and it stayed
open for 24 days.

## 3. Nine conversations are waiting on you

These end with a message from them and no reply from you.

| Person | Messages | Last from them |
| --- | --- | --- |
| Kendall57684 | 11 | 5 Oct 2026 |
| Hank Cruz | 1 | 3 Oct 2026 |
| Instagram User (unidentified) | 4 | 2 Oct 2026 |
| arlonorth | 2 | 29 Sep 2026 |
| utkarshjaiswal | 1 | 28 Sep 2026 |
| trendstore | 2 | 28 Sep 2026 |
| juniortravisgoitseone | 3 | 22 Sep 2026 |
| sorenchen | 2 | 21 Sep 2026 |
| Fahad Khan | 10 | 23 Aug 2026 |

## 4. Two things the archive revealed

### Fifteen different people are called "instagramuser"

Instagram withheld the username for some accounts and reused a single
placeholder for all of them. In this archive that placeholder appears 15 times
against 15 different folders, which are 15 different people.

This changed the import design. Matching conversations on the Instagram handle
would have merged strangers into one client and given the assistant a false
memory, where something one person said would be attributed to another. The
import is keyed on the export folder instead, which is unique, and those people
are named "Instagram User 1", "Instagram User 2" and so on and tagged
`unidentified` so they are never confused for one another.

### Most of your pipeline is cold, not stalled

354 of 393 conversations never received a reply. A pipeline where 90% of the
rows are unanswered introductions is not a lead list, and treating it as one
would bury the 39 conversations that are real. The import therefore puts
conversations with a reply into the `lead` stage and conversations without one
into a new `outreach` stage. Outreach clients are excluded from the follow up
list on the Today screen, so that list stays meaningful.

## 5. What the import writes

For each selected conversation:

- one **client**, named from the person's own display name where Instagram
  provided one, otherwise their handle, otherwise "Instagram User N"
- one **thread**, titled `Instagram: <handle>`
- every **message** in order, with its real timestamp, stored as `me` or
  `client`, tagged with the channel `instagram`
- both activity timestamps: `last_message_at` from the last message in either
  direction, `last_contact_at` only from their messages
- a factual one line summary: handle, message count, date range

## 6. What the import refuses to do

- It writes no notes.
- It writes no deal values. Nothing in an Instagram export tells you what
  someone might pay.
- It infers nothing about anyone: no budget, no objections, no intent, no
  location, no timezone.
- It does not merge two conversations because the names look similar.
- It does not alter message text. Dashes, emoji and typos are copied exactly,
  because this is a record of what was really said. The house rule against
  dashes applies to text the app writes, not to history.

## 7. Running it

Files are generated by `scripts/build-instagram-import.py`.

```bash
python3 scripts/build-instagram-import.py --selection engaged   # 39 conversations, 762 messages
python3 scripts/build-instagram-import.py --selection awaiting  # the 9 waiting on you
python3 scripts/build-instagram-import.py --selection all       # 393 conversations, 1769 messages
python3 scripts/build-instagram-import.py --selection handles --handles invictus,joelgill_13,bnova
```

That writes `scripts/import-instagram-<selection>.sql`.

### The easy way, no SQL editor

```bash
python3 scripts/import-via-api.py --file scripts/import-instagram-engaged.sql --dry-run
python3 scripts/import-via-api.py --file scripts/import-instagram-engaged.sql
```

This does the identical work through the REST API with the server secret key
from `.env.local`. It exists because the SQL file is 173 KB and pasting that into
the SQL editor from a phone is miserable. It follows the SQL step for step,
including the idempotency rule, so the two methods can be used interchangeably
and neither one duplicates the other's work.

### The SQL editor way

Open the SQL editor in your assistant Supabase project, paste the file, run it
once.

It is safe to run twice. Existing conversations are left untouched, and the
script reports how many it created and how many it skipped. It also refuses to
run if there is more than one account in the project, rather than attach your
history to the wrong person.

The last statement prints a confirmation:

| Column | Meaning |
| --- | --- |
| `instagram_clients` | conversations created |
| `awaiting_reply` | how many are sitting in the outreach stage |
| `got_a_reply` | how many are real conversations |
| `imported_messages` | messages written |
| `unidentified_people` | how many accounts Instagram would not name |

## 8. What was verified

- The importer was run against a real Postgres 17 database with the full schema
  applied. Result: 39 conversations, 762 messages, exactly matching the archive.
- A second run created 0 conversations and wrote 0 messages, so re-running is
  genuinely a no-op.
- The imported data was read back through the app's own views. The client list
  orders live work above outreach, thread pages return the conversation oldest
  first, and full text search returns hits with highlights.
- `tests/03_phase2_1_smoke_test.sql` covers the new stage, the two timestamps,
  the follow up filter and ownership, as the authenticated role rather than as
  the superuser.
- The generated SQL contains zero dashes in the text written by the importer.
  The 11 that remain in the file are dashes you actually sent in real messages.

## 9. The import into the live project, 2026-10-08

Done, through the API route, against project `qtsndukhlchymsldvuet`.

| Check | Result |
| --- | --- |
| Clients created | 39 |
| Threads created | 39 |
| Messages written | 762 |
| Messages on any other channel | 0, so nothing was overwritten |
| Second run | 0 created, 39 skipped, 0 written |

Read back from the live database afterwards, so this is the app's real state and
not the importer's own report:

- The follow up list shows 12 people worth a nudge, led by Fahad Khan at 46 days.
  They are marked `nudge`, not `follow_up_overdue`, because the client replied
  last and the ball is in their court rather than yours.
- Full text search over the imported history returns real hits across languages,
  including Urdu in Roman script and Italian, exactly as those conversations
  happened.
- Threads are titled `Instagram: <handle>`, one per client, ready for the reply
  panel.

One thing to know about the imported text: your own messages are stored exactly
as you sent them, dashes and typos included. The no dash rule applies to what the
assistant writes, not to a record of what you already said. History is not
rewritten.

## 10. Still available

The archive has 393 conversations. Only the 39 with a real reply are in. The
other 354 never replied to anything, so importing them would fill the app with
people who are not leads. They stay in `ig_parsed` and can be brought in later
with `--selection all` or by naming handles, if you ever want them.
