# Chat: screenshots to reply

One screen, two taps. Select up to 10 ordered screenshots from a client
conversation and get one ready-to-copy reply, with the conversation filed under
the right client.

## The flow

1. The browser uploads each image straight to the private `attachments` bucket
   under `{user_id}/chat/`. Images are limited to 8 MB each and 12 MB per set.
   The combined limit leaves room for base64 encoding under Gemini's documented
   20 MB inline-request limit (see [Image understanding](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding)).
2. One form post calls `chatCaptureAction`, which runs
   `captureChatScreenshots` in `lib/chat/capture.ts`:
   - validate the ordered upload manifest and download the images server side,
   - read the images together with vision (`lib/ai/vision.ts`) to identify the
     platform, visible client name, message text, tone, and the screenshots
     containing each message,
   - use the configured free Gemini model chain only, with a 26-second vision
     ceiling and a 12-second cap per model attempt,
   - match an existing client by normalised name (exact, then contained),
     create one only when there is no match,
   - continue the freshest thread on that platform, creating one only when
     needed,
   - save new messages and link each screenshot to the messages it shows,
   - draft once from the combined thread on the fast free model. The provider
     budget is capped at 18 seconds and shortens if earlier work takes longer,
     leaving time before the 60-second Hobby limit.
3. The result screen shows the reply with a Copy button, an Open client link,
   and the extracted messages in conversation order. A separate request runs the
   memory pass after a successful reply.

The picker accepts PNG, JPEG, and WebP. Users can add images in multiple
selections, review their order, move them earlier or later, and remove them
before sending.

## Multiple screenshots and overlap

The vision prompt treats the selected images as one conversation in the order
shown. It asks the model to return an overlapping bubble once and list every
screenshot where that bubble appears. The server merges repeated bubbles as a
second check, retains their source-image indices, and links the original image
to each relevant saved message. If all messages already exist, the images can
still be linked to that history. For a multi-image read, a message without a
valid screenshot index is rejected instead of guessing which image it came from.

Existing thread messages and existing image links are checked before writing.
A retry does not create a second thread, duplicate an already-saved message, or
add the same screenshot link twice. An unreadable batch creates no partial
message writes.

## Appending to existing threads, without doubling

A capture lands on the freshest thread that already carries the detected
platform, so a client with an imported Instagram history gets the new
screenshot appended to that same thread. A new thread is only created when
the platform has none. Every extracted line is checked against the thread's
existing messages (same speaker, same words, case and spacing folded) and
skipped when already saved, so the overlap between history and screenshot
disappears. The result screen states how many new messages were added, or
that nothing was new and the reply came from history.

Verified live on 2026-10-11 with a seeded thread: first capture added exactly
the one new line, second capture added zero, thread count stayed one.

## Deliberate fallbacks

- No visible name in the screenshots: the same screen asks for the name once
  and retries with the same ordered set. Nothing nameless is ever created.
- Vision unreadable: a plain error, no partial message writes.
- Vision or draft model unavailable: try the other allowed free models. If the
  draft still fails, keep the saved conversation and screenshots for the reply panel.
- Unexpected capture failures return a recoverable form state instead of a
  server-action crash.

## Entry points

- Chat tab in the bottom navigation, second position.
- A Chat button next to Add client on the Today page. Add client stays, for
  the times the full details are already known.

## Verified live on 2026-10-11

A synthetic Instagram screenshot with the name Sara Malik and two messages
went through the whole chain: platform instagram, name read from the header,
both messages extracted word for word, client and thread created, facts and
relationship summary written, both messages embedded, and a reply that quoted
the budget back. Test rows were deleted afterwards.

## Saved thread pages read like a chat (2026-10-12)

Every thread page renders its history as bubbles, the same visual language as
the Chat screen: what the client sent sits on the left in grey, what you sent
sits on the right in blue, and your private notes sit on the left in gold with
a dashed edge so they can never be mistaken for something the client saw.

The side and the colour say who spoke, so the role tags are gone. Each bubble
carries its date and platform underneath it, in small type. Screenshots stay
attached to the message they belong to.

The composer at the bottom is now the same bar as on the Chat screen: round
attach, text, round send. The role chips (Client, You, Note) sit above it,
with the platform picker next to them. What it submits is unchanged, so the
data written is identical to the old card form.

The Write a reply panel stays above the history, as before, because the draft
is the point of opening a thread.

Four harness checks now hold this in place: client messages render left, sent
messages render right, the bar is the chat style bar, and the bar sits under
the conversation.

## Draft retry state and empty threads (2026-10-13)

A previous failure is hidden while a retry is running, so the panel cannot say
both "writing" and "failed" at once. The pending button keeps its contrast,
shows a spinner, and changes its message if the run takes longer than usual.
Thread-load errors are caught by the action and returned as a safe form state,
not an unhandled server-action failure. The empty-thread hint is compact and
explains that the pasted client message enters history when the sent reply is
approved and saved.

Quota, timeout, and transient network or provider failures move to the next
allowed free Gemini model within the 40 second budget. Permanent request errors
do not spend extra attempts. If every attempt fails, the server records a
non-sensitive error category in `ai_runs` and the panel shows a short, useful
message without losing the pasted text.
