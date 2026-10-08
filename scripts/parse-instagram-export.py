#!/usr/bin/env python3
"""
Parse an Instagram data export (HTML format) into structured JSON.

The export gives one folder per conversation, each containing message_1.html.
Message blocks look like this:

  <div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder">
    <h2 class="_3-95 _2pim _a6-h _a6-i">SENDER</h2>
    <div class="_3-95 _a6-p">
      <div><div></div><div>MESSAGE TEXT</div><div></div><div></div></div>
    </div>
    <div class="_3-94 _a6-o">Sep 24, 2026 7:31 am</div>
  </div>

Output: one JSON file per thread plus an index, written to a target directory.

Usage:
  python3 scripts/parse-instagram-export.py <export_dir> <output_dir>
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, asdict, field
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup

# Sender names that mean "me" in this export. The account owner is identified by
# the profile name Instagram prints, plus the account handle from the folder.
ME_MARKERS = (
    "hamza",
    "ecom_legend",
)

# Message bodies Instagram writes for things that are not text.
SYSTEM_PATTERNS = [
    (re.compile(r"^liked a message$", re.I), "like"),
    (re.compile(r"^reacted .* to your message$", re.I), "reaction"),
    (re.compile(r"^reacted to .* message$", re.I), "reaction"),
    (re.compile(r"^sent an attachment\.?$", re.I), "attachment"),
    (re.compile(r"^sent a photo\.?$", re.I), "photo"),
    (re.compile(r"^sent a video\.?$", re.I), "video"),
    (re.compile(r"^sent a voice message\.?$", re.I), "voice"),
    (re.compile(r"^missed a voice call.*$", re.I), "missed_call"),
    (re.compile(r"^missed a video call.*$", re.I), "missed_call"),
    (re.compile(r"^you missed a .*call.*$", re.I), "missed_call"),
    (re.compile(r"^.* started an audio call.*$", re.I), "call"),
    (re.compile(r"^.* started a video call.*$", re.I), "call"),
    (re.compile(r"^.* added .* to the group\.?$", re.I), "group_event"),
    (re.compile(r"^.*left the group\.?$", re.I), "group_event"),
    (re.compile(r"^.*changed the group.*$", re.I), "group_event"),
]


@dataclass
class Message:
    sender: str
    is_me: bool
    text: str
    timestamp: str | None = None
    sent_at: str | None = None
    kind: str = "text"


@dataclass
class Thread:
    folder: str
    handle: str
    title: str
    participants: list[str] = field(default_factory=list)
    is_group: bool = False
    messages: list[Message] = field(default_factory=list)

    @property
    def message_count(self) -> int:
        return len(self.messages)

    @property
    def my_count(self) -> int:
        return sum(1 for m in self.messages if m.is_me)

    @property
    def their_count(self) -> int:
        return sum(1 for m in self.messages if not m.is_me)

    @property
    def first_at(self) -> str | None:
        stamps = [m.sent_at for m in self.messages if m.sent_at]
        return min(stamps) if stamps else None

    @property
    def last_at(self) -> str | None:
        stamps = [m.sent_at for m in self.messages if m.sent_at]
        return max(stamps) if stamps else None

    @property
    def last_message(self) -> Message | None:
        ordered = [m for m in self.messages if m.sent_at]
        if not ordered:
            return self.messages[-1] if self.messages else None
        return max(ordered, key=lambda m: m.sent_at or "")

    @property
    def awaiting_my_reply(self) -> bool:
        last = self.last_message
        return bool(last and not last.is_me)


def parse_timestamp(raw: str) -> str | None:
    """'Sep 24, 2026 7:31 am' -> ISO 8601. Returns None if unreadable."""
    cleaned = re.sub(r"\s+", " ", raw.strip())
    for fmt in ("%b %d, %Y %I:%M %p", "%B %d, %Y %I:%M %p", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(cleaned, fmt).isoformat()
        except ValueError:
            continue
    return None


def classify(text: str) -> str:
    stripped = text.strip()
    for pattern, kind in SYSTEM_PATTERNS:
        if pattern.match(stripped):
            return kind
    return "text"


def is_me(sender: str) -> bool:
    lowered = sender.lower()
    return any(marker in lowered for marker in ME_MARKERS)


def extract_body(container) -> str:
    """
    Pull the message text out of its wrapper. Instagram nests the real text in
    the second inner div and leaves empty divs around it, so the longest text
    block inside the container is the message.
    """
    parts: list[str] = []
    for div in container.find_all("div"):
        # Skip containers that hold other divs with text, we want the leaves.
        if div.find("div") is not None:
            continue
        text = div.get_text(" ", strip=True)
        if text:
            parts.append(text)

    if not parts:
        # Fall back to whatever text is in the block.
        fallback = container.get_text("\n", strip=True)
        return fallback

    # The longest leaf is the message body; the short ones are labels.
    return max(parts, key=len)


def parse_thread_file(path: Path) -> list[Message]:
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    messages: list[Message] = []

    for block in soup.find_all("div", class_="pam"):
        heading = block.find("h2")
        if heading is None:
            continue
        sender = heading.get_text(" ", strip=True)

        body_div = block.find("div", class_=lambda c: c and "_a6-p" in c)
        if body_div is None:
            continue

        text = extract_body(body_div).strip()
        if not text:
            continue

        stamp_div = block.find("div", class_=lambda c: c and "_a6-o" in c)
        raw_stamp = stamp_div.get_text(" ", strip=True) if stamp_div else ""

        messages.append(
            Message(
                sender=sender,
                is_me=is_me(sender),
                text=text,
                timestamp=raw_stamp or None,
                sent_at=parse_timestamp(raw_stamp) if raw_stamp else None,
                kind=classify(text),
            )
        )

    # Instagram prints newest first. Store oldest first so history reads properly.
    messages.reverse()
    return messages


def thread_from_folder(folder: Path) -> Thread | None:
    files = sorted(folder.glob("message_*.html"))
    if not files:
        return None

    messages: list[Message] = []
    for file in files:
        messages.extend(parse_thread_file(file))

    # Files are per conversation page. Keep chronological order overall.
    messages.sort(key=lambda m: m.sent_at or "")

    name = folder.name
    handle = name.rsplit("_", 1)[0] if "_" in name else name

    participants: list[str] = []
    for message in messages:
        if message.sender not in participants:
            participants.append(message.sender)

    return Thread(
        folder=name,
        handle=handle,
        title=handle,
        participants=participants,
        is_group=len([p for p in participants if not is_me(p)]) > 1,
        messages=messages,
    )


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2

    export_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    inbox = export_dir / "your_instagram_activity" / "messages" / "inbox"

    if not inbox.is_dir():
        print(f"No inbox found at {inbox}")
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)
    threads_dir = output_dir / "threads"
    threads_dir.mkdir(exist_ok=True)

    folders = sorted(p for p in inbox.iterdir() if p.is_dir())
    index: list[dict] = []
    failures: list[str] = []

    for folder in folders:
        try:
            thread = thread_from_folder(folder)
        except Exception as error:  # noqa: BLE001 - report and continue
            failures.append(f"{folder.name}: {error}")
            continue

        if thread is None or thread.message_count == 0:
            continue

        (threads_dir / f"{thread.folder}.json").write_text(
            json.dumps(
                {
                    "folder": thread.folder,
                    "handle": thread.handle,
                    "title": thread.title,
                    "participants": thread.participants,
                    "is_group": thread.is_group,
                    "message_count": thread.message_count,
                    "my_count": thread.my_count,
                    "their_count": thread.their_count,
                    "first_at": thread.first_at,
                    "last_at": thread.last_at,
                    "awaiting_my_reply": thread.awaiting_my_reply,
                    "messages": [asdict(m) for m in thread.messages],
                },
                ensure_ascii=False,
                indent=1,
            ),
            encoding="utf-8",
        )

        last = thread.last_message
        index.append(
            {
                "folder": thread.folder,
                "handle": thread.handle,
                "message_count": thread.message_count,
                "my_count": thread.my_count,
                "their_count": thread.their_count,
                "first_at": thread.first_at,
                "last_at": thread.last_at,
                "is_group": thread.is_group,
                "awaiting_my_reply": thread.awaiting_my_reply,
                "last_sender_is_me": bool(last and last.is_me),
                "last_text": (last.text[:280] if last else ""),
                "participants": thread.participants,
            }
        )

    index.sort(key=lambda row: row["last_at"] or "", reverse=True)
    (output_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    total_messages = sum(row["message_count"] for row in index)
    print(f"threads parsed: {len(index)}")
    print(f"messages total: {total_messages}")
    print(f"threads awaiting your reply: {sum(1 for r in index if r['awaiting_my_reply'])}")
    if failures:
        print(f"failures: {len(failures)}")
        for line in failures[:10]:
            print("  ", line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
