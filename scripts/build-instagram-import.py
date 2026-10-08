#!/usr/bin/env python3
"""
Build a pasteable SQL file that imports the parsed Instagram export into the
Hamza Assistant database.

Why SQL and not an API script: the database has no credentials in this
workspace yet, and a pasteable file keeps the import reviewable. Once the
Supabase keys exist, scripts/import-instagram-api.mjs can do the same job over
the network. Both write identical rows.

Usage:
  python3 scripts/build-instagram-import.py --selection engaged
  python3 scripts/build-instagram-import.py --selection all
  python3 scripts/build-instagram-import.py --selection handles \
      --handles joelgill_13,invictus,bnova

Selections:
  engaged  only threads where the other person replied at least once.
           This is the valuable subset and is the default recommendation.
  awaiting threads with no reply from you yet. Highest urgency, small.
  all      every thread, including the hundreds of unanswered introductions.
  handles  an explicit comma separated list of handles.

The generated file is idempotent. Running it twice will not create duplicates
and will not touch clients that already exist.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_SOURCE = Path("/home/user/ig_parsed")
OUT_DIR = Path(__file__).resolve().parent

# Instagram prints the newest message first. The parser already reverses this.
# Roles map onto the assistant's vocabulary: their words are client messages,
# yours are me messages.
ROLE_THEM = "client"
ROLE_ME = "me"

# Messages that carry no text (a like, a missed call) cannot be replayed as
# conversation, so they are counted and reported rather than silently turned
# into fake text.
SKIPPED_KINDS = {"like", "call", "media"}


def load_index(source: Path) -> list[dict]:
    index_path = source / "index.json"
    if not index_path.exists():
        sys.exit(f"No index.json in {source}. Run parse-instagram-export.py first.")
    return json.loads(index_path.read_text(encoding="utf-8"))


def load_thread(source: Path, folder: str) -> dict:
    path = source / "threads" / f"{folder}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def choose(index: list[dict], selection: str, handles: list[str]) -> list[dict]:
    if selection == "engaged":
        picked = [t for t in index if t["their_count"] >= 1]
    elif selection == "awaiting":
        picked = [t for t in index if t["awaiting_my_reply"]]
    elif selection == "all":
        picked = list(index)
    elif selection == "handles":
        wanted = {h.strip().lower().lstrip("@") for h in handles if h.strip()}
        picked = [t for t in index if t["handle"].lower() in wanted]
        missing = wanted - {t["handle"].lower() for t in picked}
        if missing:
            print(f"warning: no such handle in the export: {', '.join(sorted(missing))}")
    else:
        sys.exit(f"Unknown selection: {selection}")
    return sorted(picked, key=lambda t: t["last_at"] or "", reverse=True)


# Instagram omits the username for some accounts, and every one of those
# exports carries the same placeholder. Fifteen different people in this archive
# are called "instagramuser". They are not the same person and their
# conversations must never be merged, so they are labelled as unidentified and
# numbered apart.
ANON_HANDLES = {"instagramuser", "instagram_user", "unknown"}


def base_name(thread: dict, messages: list[dict]) -> tuple[str, bool]:
    """Return the best available name plus whether it is an unidentified person."""
    if thread["handle"].lower() in ANON_HANDLES:
        return "Instagram User", True
    for m in messages:
        if not m["is_me"] and m["sender"]:
            sender = m["sender"].strip()
            if sender and sender.lower() not in ANON_HANDLES and sender.lower() != "instagram user":
                return sender, False
    return thread["handle"], False


def disambiguate(payload: list[dict]) -> None:
    """Append a number to any name used by more than one person.

    Payload must be in the order it will be presented (most recent first), so
    the numbering is stable between runs and matches what the user sees.
    """
    counts: dict[str, int] = {}
    for item in payload:
        counts[item["name"]] = counts.get(item["name"], 0) + 1
    seen: dict[str, int] = {}
    for item in payload:
        name = item["name"]
        if counts[name] > 1:
            seen[name] = seen.get(name, 0) + 1
            item["name"] = f"{name} {seen[name]}"
            item["tags"].append("unidentified" if item["anon"] else "shared-name")


def factual_summary(thread: dict) -> str:
    """Only counts and dates. Nothing here is inferred about the person."""
    first = (thread["first_at"] or "")[:10]
    last = (thread["last_at"] or "")[:10]
    if thread["handle"].lower() in ANON_HANDLES:
        head = "Instagram withheld this account name"
    else:
        head = f"@{thread['handle']}"
    bits = [f"{head}. {thread['message_count']} messages between {first} and {last}"]
    if thread["their_count"] == 0:
        bits.append("no reply received")
    else:
        bits.append(f"{thread['their_count']} from them")
    return ". ".join(bits) + ". Imported from the Instagram export."


def build_payload(index: list[dict], source: Path) -> tuple[list[dict], int, int]:
    payload: list[dict] = []
    total_messages = 0
    skipped = 0

    for thread in index:
        full = load_thread(source, thread["folder"])
        keep: list[dict] = []
        for m in full["messages"]:
            if m.get("kind") in SKIPPED_KINDS and not m.get("text"):
                skipped += 1
                continue
            keep.append(
                {
                    "role": ROLE_ME if m["is_me"] else ROLE_THEM,
                    "content": (m["text"] or "").strip(),
                    "sent_at": m["sent_at"],
                    "sender": m["sender"],
                    "kind": m.get("kind") or "text",
                }
            )

        keep = [m for m in keep if m["content"]]
        if not keep:
            continue

        total_messages += len(keep)
        name, anon = base_name(thread, full["messages"])
        payload.append(
            {
                "handle": thread["handle"],
                "folder": thread["folder"],
                "name": name[:120],
                "anon": anon,
                "summary": factual_summary(thread),
                # Anyone who wrote back is a lead. Anyone who did not is still
                # outreach until you decide otherwise.
                "stage": "lead" if thread["their_count"] >= 1 else "outreach",
                "tags": ["instagram", "engaged" if thread["their_count"] >= 1 else "outreach"],
                "first_at": thread["first_at"],
                "last_at": thread["last_at"],
                "messages": keep,
            }
        )

    disambiguate(payload)
    return payload, total_messages, skipped


SQL_TEMPLATE = """\
-- ============================================================================
-- Instagram history import for Hamza Assistant
--
-- Generated by scripts/build-instagram-import.py on {today}
-- Selection        : {selection}
-- Conversations    : {thread_count}
-- Messages         : {message_count}
-- Skipped (no text): {skipped}
--
-- HOW TO RUN
--   1. Open your assistant Supabase project, then SQL Editor, then New query.
--   2. Paste this whole file and run it once.
--   3. It is safe to run twice. Existing conversations are left alone.
--
-- WHAT IT DOES
--   Creates one client per conversation, one thread per client, and every
--   message in order. Conversations where the person replied are staged as
--   leads. Conversations with no reply are staged as outreach, so they stay out
--   of your follow up list until you move them yourself.
--
--   Each conversation is keyed on its export folder, not on the Instagram
--   handle. Instagram withheld the username for some accounts and reused one
--   placeholder for all of them, so handle based matching would merge different
--   people into a single client. Those people are named "Instagram User 1",
--   "Instagram User 2" and so on, and tagged unidentified, so they are never
--   confused for one another.
--
-- WHAT IT DOES NOT DO
--   It writes no notes, no deal values and no assumptions about anyone. The
--   only summary text is a message count and a date range.
-- ============================================================================

do $import$
declare
  v_user_id uuid;
  v_payload  jsonb := $json${payload}$json$::jsonb;
  v_client   jsonb;
  v_message  jsonb;
  v_client_id uuid;
  v_thread_id uuid;
  v_created  int := 0;
  v_skipped  int := 0;
  v_msgs     int := 0;
begin
  -- The app is single user by design, so exactly one account should own the
  -- import. Count first and fail loudly rather than guess or attach the history
  -- to the wrong person.
  if (select count(*) from auth.users) = 0 then
    raise exception 'No account exists yet. Sign in to the app once, then run this again.';
  end if;

  if (select count(*) from auth.users) > 1 then
    raise exception 'More than one account exists (%). This import is written for a single owner account, so it stops rather than attach your history to the wrong person.', (select count(*) from auth.users);
  end if;

  select id into v_user_id from auth.users limit 1;

  for v_client in select * from jsonb_array_elements(v_payload)
  loop
    -- Idempotency is keyed on the export folder, not the handle. Instagram
    -- withheld the username for fifteen accounts in this archive and gave them
    -- all the same placeholder, so matching on the handle would silently merge
    -- strangers into one client. The folder id is unique. The newline in the
    -- pattern keeps one folder from matching a longer folder name.
    select c.id into v_client_id
      from public.clients c
     where c.user_id = v_user_id
       and c.notes like E'%%Export folder: ' || (v_client->>'folder') || E'\n%%'
     limit 1;

    if v_client_id is null then
      insert into public.clients (
        user_id, name, source, channel, stage, tags, notes, summary
      ) values (
        v_user_id,
        v_client->>'name',
        'instagram',
        'instagram',
        v_client->>'stage',
        array(select jsonb_array_elements_text(v_client->'tags')),
        coalesce('Instagram handle: ' || (v_client->>'handle'), 'Instagram handle: withheld')
          || E'\nExport folder: ' || (v_client->>'folder')
          || E'\nImported from the Instagram export.',
        v_client->>'summary'
      )
      returning id into v_client_id;
      v_created := v_created + 1;
    else
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.threads (user_id, client_id, title, mode)
    values (v_user_id, v_client_id, 'Instagram: ' || (v_client->>'handle'), 'client_reply')
    returning id into v_thread_id;

    for v_message in select * from jsonb_array_elements(v_client->'messages')
    loop
      insert into public.messages (user_id, thread_id, role, content, channel, sent_at, meta)
      values (
        v_user_id,
        v_thread_id,
        v_message->>'role',
        v_message->>'content',
        'instagram',
        (v_message->>'sent_at')::timestamptz,
        jsonb_build_object(
          'imported_from', 'instagram_export',
          'sender', v_message->>'sender',
          'source_kind', v_message->>'kind',
          'export_folder', v_client->>'folder'
        )
      );
      v_msgs := v_msgs + 1;
    end loop;

    -- Both activity facts are set from the real history, so nothing shows as
    -- "never contacted" when it has been.
    update public.clients c
       set last_message_at = (v_client->>'last_at')::timestamptz,
           last_contact_at = case
             when exists (
               select 1 from jsonb_array_elements(v_client->'messages') e
                where e->>'role' = 'client'
             ) then (v_client->>'last_at')::timestamptz
             else null
           end
     where c.id = v_client_id;
  end loop;

  raise notice 'Imported % new conversations, skipped % that already existed, wrote % messages.',
    v_created, v_skipped, v_msgs;
end;
$import$;

-- Confirmation. Expect the client count to match the conversation count above.
select
  (select count(*) from public.clients where source = 'instagram') as instagram_clients,
  (select count(*) from public.clients where source = 'instagram' and stage = 'outreach') as awaiting_reply,
  (select count(*) from public.clients where source = 'instagram' and stage = 'lead') as got_a_reply,
  (select count(*) from public.messages where channel = 'instagram') as imported_messages,
  (select count(*) from public.clients
    where source = 'instagram' and 'unidentified' = any(tags)) as unidentified_people;

-- ============================================================================
-- End of import.
-- ============================================================================
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selection", default="engaged",
                    choices=["engaged", "awaiting", "all", "handles"])
    ap.add_argument("--handles", default="")
    ap.add_argument("--source", default=str(DEFAULT_SOURCE))
    args = ap.parse_args()

    source = Path(args.source)
    index = load_index(source)
    picked = choose(index, args.selection, args.handles.split(","))

    if not picked:
        sys.exit("Nothing matched that selection.")

    payload, message_count, skipped = build_payload(picked, source)

    sql = SQL_TEMPLATE.format(
        today=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        selection=args.selection,
        thread_count=len(payload),
        message_count=message_count,
        skipped=skipped,
        payload=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    )

    out = OUT_DIR / f"import-instagram-{args.selection}.sql"
    out.write_text(sql, encoding="utf-8")

    # The house rule bans dashes in text the app writes, not in a record of what
    # was actually sent. Historical messages are copied byte for byte. Only the
    # authored parts of the file, the comments and the SQL, are checked.
    marker = "$json$"
    first = sql.index(marker)
    second = sql.index("$json$::jsonb")
    authored = sql[: first + len(marker)] + sql[second:]
    prose_dashes = re.findall(r"[\u2013\u2014]", authored)
    payload_dashes = len(re.findall(r"[\u2013\u2014]", sql)) - len(prose_dashes)

    print(f"{len(payload)} conversations, {message_count} messages, {skipped} skipped")
    print(f"wrote {out}  ({out.stat().st_size / 1024:.0f} KB)")
    print(f"dashes: {len(prose_dashes)} in the SQL I wrote, "
          f"{payload_dashes} preserved from real messages")
    if prose_dashes:
        print("WARNING: the SQL text itself contains a dash. That breaks the house rule.")


if __name__ == "__main__":
    main()
