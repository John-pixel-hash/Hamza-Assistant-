# Chat: screenshot to reply

One screen, two taps. Upload a screenshot of a client conversation from any
platform and get back a ready to copy reply, with the conversation filed under
the right client.

## The flow

1. The browser uploads the image straight to the private `attachments` bucket
   under `{user_id}/chat/`, the same pipe the thread composer uses.
2. One form post calls `chatCaptureAction`, which runs
   `captureChatScreenshot` in `lib/chat/capture.ts`:
   - download the image server side,
   - read it with vision (`lib/ai/vision.ts`): platform, client name, who said
     what, tone. Vision runs gemini-3.5-flash with automatic fallback to
     gemini-3.1-flash-lite on 429/503, because the free tier spikes,
   - match an existing client by normalised name (exact, then contained),
     create one only when there is no match,
   - keep one thread per platform per client, titled like "Instagram chat",
   - save the client's messages with the screenshot attached,
   - run the memory pass so facts, the summary and embeddings update before
     the reply is written,
   - draft the reply with the same platform aware pipeline as the reply panel.
3. The result screen shows the reply with a Copy button, an Open client link,
   and the extracted text in a details box so nothing is a black box.

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

- No visible name in the screenshot: the same screen asks for the name once
  and retries with the same upload. Nothing nameless is ever created.
- Vision unreadable: a plain error, no partial writes.
- Vision models busy: flash to lite fallback, then a "try again" message.
- Every layer never throws, matching the rest of the app.

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
