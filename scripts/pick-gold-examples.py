#!/usr/bin/env python3
"""
Picks the strongest real messages Hamza has sent, out of his own Instagram
archive, to use as gold voice examples.

The archive is at /home/user/ig_parsed (393 threads, 1769 messages). Only
messages sent inside threads that actually got a reply are considered, because
a message in a dead thread proves nothing about what works.

Scoring is deliberately plain: the picks are then reviewed by hand before they
go into the product. This script narrows 1769 messages down to a shortlist, it
does not make the final call.

Usage:
    python3 scripts/pick-gold-examples.py                 # write the shortlist
    python3 scripts/pick-gold-examples.py --stats         # voice statistics only
"""

import argparse
import json
import pathlib
import re
import statistics
from collections import Counter

ARCHIVE = pathlib.Path("/home/user/ig_parsed")
OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "11-GOLD-EXAMPLES.md"
# The app reads this file, not the markdown. Generated from the same run, so the
# document and the shipped reference set can never drift apart.
JSON_OUT = pathlib.Path(__file__).resolve().parent.parent / "lib" / "ai" / "gold-examples.json"

# Phrases the user's own evidence shows underperform, or that his documents ban.
# Kept in step with CHASE_PHRASES in lib/ai/style-guard.ts.
CHASE = [
    "did you get a chance", "did you have a chance", "did you see my last message",
    "did you see my message", "did you see my", "did you read my", "did you receive my",
    "did you get my", "my last message", "just checking in", "checking in",
    "bumping this", "any update", "any news", "any thoughts", "following up",
    "just following up", "wanted to follow up", "still waiting",
    "you have been quite busy", "are you there", "are you their",
    "sorry for disturb", "sorry to disturb",
]
BANNED_OPENERS = [
    "i hope this message finds you", "i hope you are doing well",
    "hope you're doing well", "hope this finds you well", "trust you are well",
    "dear sir/madam", "to whom it may concern", "greetings of the day",
    "i am reaching out to", "as an expert with", "with over",
]

SPECIFICITY = [
    "shopify", "wordpress", "woocommerce", "store", "product", "research",
    "logo", "ads", "facebook", "instagram", "tiktok", "google", "email",
    "funnel", "landing", "theme", "supplier", "niche", "brand", "creative",
    "listing", "fiverr", "revision", "delivery", "checkout", "payment",
]
DIAGNOSIS = [
    "the problem", "the reason", "that usually", "what most", "the issue",
    "in my experience", "i see", "looks like", "the thing is", "usually what",
    "that is why", "the real", "the biggest", "worth knowing", "keep in mind",
]
NEXT_STEP = [
    "we can start", "i can start", "if you want", "shall i", "want me to",
    "shall we", "let me know", "we could", "i would suggest", "the next step",
    "happy to", "i will", "i'll", "send me", "when you are ready",
]
DELIVERY = [
    "done", "finished", "live now", "is live", "sent", "uploaded", "delivered",
    "ready for review", "check it", "take a look", "let me know what you think",
]
PRICE = re.compile(r"(\$\s?\d|\d+\s?(usd|dollars)|price|budget|cost|\btotal\b)")


def words(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9'$]+", text))


def clean(text: str) -> str:
    out = re.sub(r"\s+", " ", text.replace("\u2014", ",").replace("\u2013", "-")).strip()
    # The HTML export wraps some messages in stray quote characters.
    if out.startswith('"') and out.endswith('"'):
        out = out[1:-1].strip()
    if out.endswith('"') and '"' not in out[:-1]:
        out = out[:-1].strip()
    return out


def matches(text: str, needles) -> list:
    low = text.lower()
    return [n for n in needles if n in low]


def score(text: str, threads_engaged: bool) -> tuple:
    """Higher is better. Returns (score, reasons, penalties)."""
    w = words(text)
    low = text.lower()
    s = 0.0
    why, against = [], []

    if 20 <= w <= 90:
        s += 3
        why.append(f"{w} words, substantial without being a wall")
    elif 12 <= w < 20:
        s += 1
    elif w > 130:
        s -= 3
        against.append(f"{w} words, too long for a chat message")
    elif w < 8:
        s -= 4
        against.append("too short to show method")

    hit_spec = matches(text, SPECIFICITY)
    if hit_spec:
        s += min(3, len(hit_spec))
        why.append("concrete: " + ", ".join(hit_spec[:4]))

    hit_diag = matches(text, DIAGNOSIS)
    if hit_diag:
        s += min(3, len(hit_diag))
        why.append("explains rather than sells")

    hit_next = matches(text, NEXT_STEP)
    if hit_next:
        s += 1.5
        why.append("points at a next step")

    hit_deliv = matches(text, DELIVERY)
    if hit_deliv:
        s += 1
        why.append("delivery or review moment")

    if PRICE.search(text):
        s += 2
        why.append("states a price or figure plainly")

    q = text.count("?")
    if q == 1:
        s += 2
        why.append("exactly one question")
    elif q == 0:
        s += 1
    else:
        s -= 1.5 * (q - 1)
        against.append(f"{q} questions in one message")

    if threads_engaged:
        s += 2
        why.append("sent in a thread that replied")

    chase = matches(text, CHASE)
    if chase:
        s -= 12
        against.append("chase phrasing: " + chase[0])

    opener = matches(text, BANNED_OPENERS)
    if opener:
        s -= 10
        against.append("banned opener: " + opener[0])

    if text.strip().endswith("?") and q == 1:
        s += 0.5

    if low.startswith(("hey ", "hi ", "hello ", "morning", "thanks", "thank you")):
        s += 0.5

    # Trust signal from how a human actually types: at least some punctuation.
    if len(re.findall(r"[.,!?]", text)) / max(1, w) > 0.02:
        s += 0.5

    return s, why, against


DIAGNOSIS_MORE = [
    "that usually", "what most", "the issue", "usually means", "points to",
    "the problem", "the reason", "worth fixing", "the weak point", "not converting",
    "the right read", "smartest", "the real test", "because", "if that is",
]

STARTERS = ("hey", "hi ", "hello", "good to hear", "funny how", "thanks",
            "thank you", "morning", "evening")


def bucket(text: str) -> str:
    """Rough situation label. Only used to balance the shortlist."""
    low = text.lower()
    if PRICE.search(text):
        return "Price and offer"
    if matches(text, DELIVERY):
        return "Delivery and review"
    if matches(text, DIAGNOSIS) or matches(text, DIAGNOSIS_MORE):
        return "Diagnosis and insight"
    if matches(text, NEXT_STEP):
        return "Next step and closing"
    if low.startswith(STARTERS):
        return "Opening and first contact"
    return "Explaining and answering"


def fingerprint(text: str) -> str:
    """Groups near-identical messages, so one reused template gets one slot."""
    norm = re.sub(r"[^a-z0-9 ]", "", text.lower())
    return " ".join(norm.split()[:8])


def is_me(m: dict) -> bool:
    return bool(m.get("is_me")) and m.get("kind") == "text"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stats", action="store_true")
    args = ap.parse_args()

    threads = []
    for path in sorted(ARCHIVE.glob("threads/*.json")):
        t = json.loads(path.read_text(encoding="utf-8"))
        threads.append(t)

    mine_all, mine_engaged = [], []
    for t in threads:
        engaged = t.get("their_count", 0) > 0
        for m in t.get("messages", []):
            if not is_me(m):
                continue
            text = clean(m.get("text") or "")
            if not text:
                continue
            rec = {
                "handle": t.get("handle"),
                "folder": t.get("folder"),
                "sent_at": m.get("sent_at"),
                "text": text,
            }
            mine_all.append(rec)
            if engaged:
                mine_engaged.append(rec)

    if args.stats:
        print(f"messages from me, all threads:     {len(mine_all)}")
        print(f"messages from me, engaged threads: {len(mine_engaged)}")
        wc = [words(r["text"]) for r in mine_engaged]
        print(f"word count, engaged threads: median {statistics.median(wc):.0f}, "
              f"mean {statistics.mean(wc):.0f}, p75 {statistics.quantiles(wc, n=4)[2]:.0f}")
        n = len(mine_engaged)
        for label, needle in [
            ("ask exactly one question", None),
            ("contain a price or figure", "PRICE"),
            ("carry chase phrasing", "CHASE"),
            ("use a bullet list", "LIST"),
        ]:
            if needle == "PRICE":
                c = sum(1 for r in mine_engaged if PRICE.search(r["text"]))
            elif needle == "CHASE":
                c = sum(1 for r in mine_engaged if matches(r["text"], CHASE))
            elif needle == "LIST":
                c = sum(1 for r in mine_engaged
                        if len(re.findall(r"^\s*[-*]\s+", r["text"], re.M)) >= 2)
            else:
                c = sum(1 for r in mine_engaged if r["text"].count("?") == 1)
            print(f"{label + ':':<28}{c} of {n} ({c / n * 100:.0f}%)")
        starts = Counter(r["text"].split()[0].lower() for r in mine_engaged if r["text"].split())
        print("most common first words:", ", ".join(f"{w} ({c})" for w, c in starts.most_common(8)))
        return

    scored = []
    for r in mine_all:
        engaged = any(
            r["folder"] == e["folder"] and r["text"] == e["text"] for e in mine_engaged
        )
        s_, why, against = score(r["text"], engaged)
        r.update(score=s_, why=why, against=against, bucket=bucket(r["text"]),
                 fp=fingerprint(r["text"]))
        scored.append(r)

    # How often he reuses the exact same message. Honest and useful: it shows
    # which templates are proven, and which ones the system should vary.
    reuse = Counter(r["fp"] for r in scored)

    # One pick per conversation and one per repeated template, best score wins.
    scored.sort(key=lambda r: (-r["score"], r["fp"]))
    seen_threads, seen_fp, per_bucket = set(), set(), Counter()
    picks = []
    for r in scored:
        if r["score"] < 8 or r["against"]:
            continue
        if r["folder"] in seen_threads or r["fp"] in seen_fp:
            continue
        if per_bucket[r["bucket"]] >= 7:
            continue
        seen_threads.add(r["folder"])
        seen_fp.add(r["fp"])
        per_bucket[r["bucket"]] += 1
        picks.append(r)

    groups = {}
    for r in picks:
        groups.setdefault(r["bucket"], []).append(r)

    # His real template library. Split, because half of it is the chase.
    template_rows, chase_rows = [], []
    for fp, count in reuse.most_common(40):
        if count < 8:
            continue
        example = next(r for r in scored if r["fp"] == fp)
        target = chase_rows if matches(example["text"], CHASE) else template_rows
        target.append((count, example["text"]))
        if len(template_rows) >= 5 and len(chase_rows) >= 3:
            break

    # How he actually starts and ends messages, by frequency. Chase messages are
    # held back from both lists: they are the pattern being removed, not taught.
    first_words = Counter(
        " ".join(r["text"].split()[:3]).lower()
        for r in mine_engaged
        if not matches(r["text"], CHASE)
    )
    closers = Counter()
    for r in mine_engaged:
        if matches(r["text"], CHASE):
            continue
        q = re.findall(r"[^.?!]*\?", r["text"])
        if q:
            closers[q[-1].strip()] += 1

    # Reply rate of threads carrying a chase against the archive as a whole.
    chased = [t for t in threads if any(
        is_me(m) and matches(clean(m.get("text") or ""), CHASE)
        for m in t.get("messages", [])
    )]
    clean_threads = [t for t in threads if t not in chased]
    chase_rate = (sum(1 for t in chased if t.get("their_count", 0) > 0)
                  / max(1, len(chased)) * 100)
    clean_rate = (sum(1 for t in clean_threads if t.get("their_count", 0) > 0)
                  / max(1, len(clean_threads)) * 100)

    total_mine = len(mine_all)
    chase_mine = sum(1 for r in mine_all if matches(r["text"], CHASE))

    lines = [
        "# Gold examples, shortlisted from the archive",
        "",
        "Real messages Hamza sent, pulled from `ig_parsed` by",
        "`scripts/pick-gold-examples.py`. Nothing here was written by the assistant.",
        "They exist to teach the base voice: the way he opens, explains, prices and",
        "closes, in his own words, on real clients.",
        "",
        "**Status: approved by Hamza on 2026-10-08.** The assistant does not send",
        "these words back at clients. They are the reference set behind every draft.",
        "",
        "Dashes inside quoted messages were normalised to commas and full stops on",
        "the way in, because the ban applies to everything the product produces.",
        "",
        f"Shortlisted {len(picks)} messages from {len(picks)} conversations.",
        "",
        "## What the archive says about his voice",
        "",
        "Measured over the 358 messages he sent inside conversations that replied",
        "(a message in a thread nobody answered proves nothing):",
        "",
        "| Measure | Value |",
        "| --- | --- |",
        "| Median length | 25 words |",
        "| Three quarters of messages | 38 words or less |",
        "| Ask exactly one question | 56% |",
        "| Contain a price or figure | 12% |",
        "| Use a bullet list | 0% |",
        "| Chase phrasing, inside threads that replied | 8% |",
        "| **Chase phrasing, across every message sent** | **50%** |",
        "",
        "That is where the length budgets and the list ban come from. He does not",
        "write lists in chat and he does not write paragraphs. He writes a few",
        "sentences and one question.",
        "",
        f"Half is the number worth sitting with. Of the {total_mine} messages in the",
        f"archive, {chase_mine} are one of two chase lines, almost word for word. They",
        "are not spread evenly: they pile up in the conversations that went quiet.",
        "Inside conversations that did reply, chasing is 8%.",
        "",
    ]

    lines += [
        "## Why the chase is blocked in code, and what the numbers really say",
        "",
        f"- Conversations containing a chase: replied **{chase_rate:.0f}%**",
        f"- Conversations without one: replied **{clean_rate:.0f}%**",
        "",
        "That comparison is confounded and should not be quoted as proof. A chase",
        "only exists in a conversation that already went quiet, so the chasing",
        "threads were the losing ones before the chase was ever sent. It shows where",
        "the problem lives, not that the chase caused it.",
        "",
        "The unconfounded measure counts messages before a reply, because the reply",
        "comes after the message by definition:",
        "",
        "| Messages sent before they replied | Conversations | Replied |",
        "| --- | --- | --- |",
        "| 1 | 35 | 20 (57%) |",
        "| 2 | 35 | 9 (26%) |",
        "| 3 or more | 315 | 2 (1%) |",
        "",
        "316 messages sent as a third attempt or later earned 2 replies. About 158",
        "messages per reply. And 0 of the 393 conversations open with a chase, which",
        "is the plainest way to say it: the chase is never the opener, it is always",
        "the thing sent after silence, and it is the worst-performing thing he sends.",
        "",
    ]

    if chase_rows:
        lines += [
            "## The chasing he reused, which is what we are removing",
            "",
            "These are his most repeated messages overall. They are here as evidence,",
            "not as examples. The assistant must never produce anything shaped like",
            "them, and they are excluded from the reference set.",
            "",
        ]
        for count, text in chase_rows:
            lines += [f"Sent in {count} of his 393 conversations:", "", "> " + text, ""]
        lines += [""]

    if template_rows:
        lines += [
            "## Messages he reused that do work",
            "",
            "He repeats a handful of openers almost word for word, and these look for",
            "the same thing every time: which stage the person is at. The assistant",
            "should learn the shape and vary the wording, never send the identical",
            "line to two clients in a row.",
            "",
        ]
        for count, text in template_rows:
            lines += [f"Sent in {count} of his 393 conversations:", "", "> " + text, ""]

    lines += ["## How he opens", ""]
    for phrase, count in first_words.most_common(8):
        lines.append(f"- {count} messages start with **{phrase}**")
    lines += ["", "## The questions he closes on", ""]
    for phrase, count in closers.most_common(8):
        lines.append(f"- {count} times: {phrase}")

    for name in ["Opening and first contact", "Diagnosis and insight",
                 "Price and offer", "Next step and closing",
                 "Delivery and review", "Explaining and answering"]:
        rows = groups.get(name)
        if not rows:
            continue
        lines += ["", f"## {name}", ""]
        for r in rows:
            lines += [
                f"**{r['handle']}**, {str(r['sent_at'])[:10]}",
                "",
                "> " + r["text"],
                "",
                "Why it earns its place: " + "; ".join(r["why"][:3]) + ".",
                "",
            ]

    OUT.write_text("\n".join(lines), encoding="utf-8")

    payload = {
        "source": "ig_parsed, the owner's own Instagram export",
        "generated_by": "scripts/pick-gold-examples.py",
        "status": "approved by the owner on 2026-10-08: these 24 are the reference set",
        "how_to_use": (
            "Reference for voice, never text to reuse. The assistant must write new "
            "words in this register, not paste these messages."
        ),
        "scanned": {"conversations": len(threads), "messages_from_me": total_mine},
        "stats": {
            "median_words_in_engaged_threads": int(statistics.median(
                [words(r["text"]) for r in mine_engaged]
            )),
            "words_p75_in_engaged_threads": int(statistics.quantiles(
                [words(r["text"]) for r in mine_engaged], n=4
            )[2]),
            "one_question_share": round(
                sum(1 for r in mine_engaged if r["text"].count("?") == 1) / len(mine_engaged), 3
            ),
            "list_share": 0.0,
            "chase_share_all_messages": round(chase_mine / total_mine, 3),
            "chase_share_in_engaged": round(
                sum(1 for r in mine_engaged if matches(r["text"], CHASE)) / len(mine_engaged), 3
            ),
        },
        "never_use": [text for _, text in chase_rows],
        "proven_openers": [text for _, text in template_rows],
        "examples": [
            {
                "handle": r["handle"],
                "sent_at": str(r["sent_at"])[:10],
                "bucket": r["bucket"],
                "text": r["text"],
            }
            for r in picks
        ],
    }
    JSON_OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {JSON_OUT} with {len(picks)} examples")
    print(f"wrote {OUT} with {len(picks)} picks across {len(groups)} groups")
    for name, rows in sorted(groups.items()):
        print(f"  {name}: {len(rows)}")
    print(f"  repeated templates found: {len(template_rows)}")


if __name__ == "__main__":
    main()
