#!/usr/bin/env python3
"""
Runs the Instagram import against the live Supabase project through the REST
API, using the server secret key.

Why this exists: the generated SQL file has to be pasted into the Supabase SQL
editor, and that file is 173 KB, which is painful on a phone. The payload inside
that SQL file is just JSON, and every write it performs is an ordinary insert, so
the same import can be done through the API with no SQL editor involved.

It follows the SQL step for step, including the idempotency rule: a conversation
that already exists is skipped, matched on the export folder stored in the client
notes, never on the Instagram handle, because fifteen different people in this
archive share one placeholder handle.

Usage:
    python3 scripts/import-via-api.py --file scripts/import-instagram-engaged.sql
    python3 scripts/import-via-api.py --file scripts/import-instagram-engaged.sql --dry-run
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV = ROOT / ".env.local"

FOLDER_MARKER = "Export folder: "


def load_env() -> dict:
    values = {}
    for line in ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


class Api:
    def __init__(self, url: str, key: str) -> None:
        self.url = url.rstrip("/")
        self.key = key

    def call(self, method: str, path: str, body=None, prefer: str | None = None):
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.url + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read().decode()
                return response.status, (json.loads(raw) if raw.strip() else None)
        except urllib.error.HTTPError as error:
            detail = error.read().decode()
            raise RuntimeError(f"{method} {path} failed: {error.code} {detail[:400]}") from None

    def get(self, path: str):
        return self.call("GET", path)[1]


def extract_payload(sql_text: str) -> list:
    start = sql_text.index("$json$") + len("$json$")
    end = sql_text.index("$json$::jsonb")
    return json.loads(sql_text[start:end])


def existing_folders(api: Api, user_id: str) -> set:
    """Folders already imported, read from the client notes the import writes."""
    rows = api.get(
        f"/rest/v1/clients?select=notes&user_id=eq.{user_id}&source=eq.instagram"
    ) or []
    folders = set()
    for row in rows:
        notes = row.get("notes") or ""
        for chunk in notes.splitlines():
            if chunk.startswith(FOLDER_MARKER):
                folders.add(chunk[len(FOLDER_MARKER) :].strip())
    return folders


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="scripts/import-instagram-engaged.sql")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    env = load_env()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        print("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required in .env.local")
        return 1

    api = Api(url, key)

    users = api.get("/auth/v1/admin/users").get("users", [])
    if len(users) == 0:
        print("No account exists yet. Sign in to the app once, then run this again.")
        return 1
    if len(users) > 1:
        print(f"{len(users)} accounts exist. This import is written for a single owner account.")
        for user in users:
            print("  ", user["email"])
        return 1
    user_id = users[0]["id"]
    print(f"Owner: {users[0]['email']} ({user_id})")

    sql_path = ROOT / args.file
    conversations = extract_payload(sql_path.read_text(encoding="utf-8"))
    print(f"Conversations in {args.file}: {len(conversations)}")

    already = existing_folders(api, user_id)
    print(f"Already imported: {len(already)}")

    created_clients = 0
    skipped = 0
    written_messages = 0

    for conversation in conversations:
        folder = conversation["folder"]
        if folder in already:
            skipped += 1
            continue

        messages = conversation.get("messages", [])
        if args.dry_run:
            print(f"  would import {conversation['handle']}: {len(messages)} messages")
            created_clients += 1
            written_messages += len(messages)
            continue

        notes = (
            f"Instagram handle: {conversation.get('handle') or 'withheld'}\n"
            f"{FOLDER_MARKER}{folder}\n"
            "Imported from the Instagram export."
        )

        _, rows = api.call(
            "POST",
            "/rest/v1/clients",
            [
                {
                    "user_id": user_id,
                    "name": conversation["name"],
                    "source": "instagram",
                    "channel": "instagram",
                    "stage": conversation["stage"],
                    "tags": conversation.get("tags", []),
                    "notes": notes,
                    "summary": conversation.get("summary"),
                }
            ],
            prefer="return=representation",
        )
        client_id = rows[0]["id"]

        _, thread_rows = api.call(
            "POST",
            "/rest/v1/threads",
            [
                {
                    "user_id": user_id,
                    "client_id": client_id,
                    "title": f"Instagram: {conversation['handle']}",
                    "mode": "client_reply",
                }
            ],
            prefer="return=representation",
        )
        thread_id = thread_rows[0]["id"]

        payload = [
            {
                "user_id": user_id,
                "thread_id": thread_id,
                "role": message["role"],
                "content": message["content"],
                "channel": "instagram",
                "sent_at": message["sent_at"],
                "meta": {
                    "imported_from": "instagram_export",
                    "sender": message.get("sender"),
                    "source_kind": message.get("kind"),
                    "export_folder": folder,
                },
            }
            for message in messages
            if (message.get("content") or "").strip()
        ]
        for start in range(0, len(payload), 100):
            api.call("POST", "/rest/v1/messages", payload[start : start + 100])
        written_messages += len(payload)

        # The two activity facts, so nothing shows as never contacted.
        has_client_message = any(m.get("role") == "client" for m in messages)
        api.call(
            "PATCH",
            f"/rest/v1/clients?id=eq.{client_id}",
            {
                "last_message_at": conversation["last_at"],
                "last_contact_at": conversation["last_at"] if has_client_message else None,
            },
        )

        created_clients += 1
        print(f"  {conversation['handle']:<28} {len(payload):>3} messages  {conversation['stage']}")

    print()
    print(
        f"{'Would import' if args.dry_run else 'Imported'} {created_clients} conversations, "
        f"skipped {skipped}, wrote {written_messages} messages."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
