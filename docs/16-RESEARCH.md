# Phase 5: the research engine

Ask anything technical or strategic on /research. The answer is written from
live search results and shows its sources, so nothing in the app is a guess.

## How it retrieves

1. Tavily, when `TAVILY_API_KEY` is set. Free tier, made for agent search,
   about 1000 searches a month. The settings page has the slot.
2. Gemini Google Search grounding as the fallback. Verified on 2026-10-11:
   Google quota locks grounding on every free tier model (429 with the search
   tool, 200 without), so the path exists but stays dormant until the account
   has grounding allowance.

## How it answers

The lite model synthesises the retrieved snippets only, cites them with [n],
and must label anything beyond the sources as general guidance. If retrieval
found nothing, the app says so instead of inventing. If the synth models are
busy but sources were found, the sources still render.

## Entry points

- Research button next to Chat and Add client on the Today page.
- /research page with a question box, the answer, and the source list.

## Verified

Unit tests cover Tavily parsing, grounding parsing, the provider hop and the
synth hop. The live grounding lock was proven against the real API: 429 with
the google_search tool on all models, 200 without it.
