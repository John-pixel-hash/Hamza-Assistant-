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
