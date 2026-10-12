/**
 * The research engine: retrieve, then synthesise, then show the sources.
 *
 * Retrieval order:
 *  1. Tavily, when a key is set. Free tier, made for agent search, and the
 *     settings page already has a slot for the key.
 *  2. Gemini Google Search grounding as a fallback. On the free tier Google
 *     currently quota locks it, but on any billed or future account it works,
 *     so the code path stays.
 *
 * The answer is then written by the lite model from the retrieved snippets
 * only, so nothing in it is a guess. Sources always ride along and render
 * under the answer.
 *
 * REST based, server-only free, never throws.
 */

export type ResearchSource = { title: string; url: string; snippet?: string };

export type ResearchResult = {
  answer: string | null;
  sources: ResearchSource[];
  modelId: string | null;
  reason?: string;
};

const SYNTH_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];
const GROUNDING_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];

export type TavilyHit = { title?: string; url?: string; content?: string };

/** Validates Tavily's search payload. Exported for tests. */
export function parseTavilyResponse(payload: unknown): ResearchSource[] {
  const results = (payload as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const sources: ResearchSource[] = [];
  for (const entry of results as TavilyHit[]) {
    if (!entry || typeof entry.url !== 'string' || !entry.url.startsWith('http')) continue;
    sources.push({
      title: typeof entry.title === 'string' && entry.title ? entry.title : entry.url,
      url: entry.url,
      snippet: typeof entry.content === 'string' ? entry.content.slice(0, 1500) : undefined,
    });
    if (sources.length >= 6) break;
  }
  return sources;
}

/** Pulls the answer text and web sources out of a grounding response. */
export function parseGroundingResponse(payload: unknown): {
  text: string | null;
  sources: ResearchSource[];
} {
  const root = payload as {
    candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: unknown }[];
  } | null;
  const candidate = root?.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  const meta = candidate?.groundingMetadata as {
    groundingChunks?: { web?: { uri?: string; title?: string } }[];
  } | undefined;

  const seen = new Set<string>();
  const sources: ResearchSource[] = [];
  for (const chunk of meta?.groundingChunks ?? []) {
    const url = chunk.web?.uri;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: chunk.web?.title || url, url });
  }

  return { text: text && text.length > 0 ? text : null, sources };
}

async function tavilySearch(
  question: string,
  doFetch: typeof fetch,
  tavilyKey?: string,
): Promise<ResearchSource[] | null> {
  const key = tavilyKey ?? process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const response = await doFetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: question, search_depth: 'basic', max_results: 6 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.error('[research] tavily http', response.status);
      return null;
    }
    return parseTavilyResponse(await response.json());
  } catch (error) {
    console.error('[research] tavily failed', error instanceof Error ? error.message : error);
    return null;
  }
}

async function groundingSearch(
  question: string,
  doFetch: typeof fetch,
): Promise<ResearchSource[] | null> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  for (const modelId of GROUNDING_MODELS) {
    try {
      const response = await doFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: question }] }],
            tools: [{ google_search: {} }],
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok) continue;
      const { sources } = parseGroundingResponse(await response.json());
      if (sources.length > 0) return sources;
    } catch {
      // try the next model
    }
  }
  return null;
}

function buildSynthPrompt(question: string, sources: ResearchSource[]): string {
  const blocks = sources
    .map(
      (source, index) =>
        `[${index + 1}] ${source.title}\n${source.snippet ?? '(no excerpt)'}`,
    )
    .join('\n\n');
  return [
    'You are the research engine inside a private assistant for a freelance',
    'web designer and digital marketer. Write the answer using ONLY the',
    'numbered sources below.',
    'Rules:',
    '- Cite with [n] after each fact that comes from a source.',
    '- Where the sources are thin, say what is generally true and label it as',
    '  general guidance, with no citation.',
    '- Practical and specific: numbers, steps, names, prices when available.',
    '- Plain words, tight list or short paragraphs, no dashes, max 250 words.',
    '',
    `Question: ${question}`,
    '',
    'Sources:',
    blocks,
  ].join('\n');
}

async function synthesize(
  question: string,
  sources: ResearchSource[],
  doFetch: typeof fetch,
  timeoutMs = 30000,
): Promise<{ text: string | null; modelId: string | null }> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return { text: null, modelId: null };
  for (const modelId of SYNTH_MODELS) {
    try {
      const response = await doFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildSynthPrompt(question, sources) }] }],
            generationConfig: { temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      if (response.status === 429 || response.status === 503) continue;
      if (!response.ok) return { text: null, modelId: null };
      const { text } = parseGroundingResponse(await response.json());
      if (text) return { text, modelId };
    } catch {
      // try the next model
    }
  }
  return { text: null, modelId: null };
}

export async function researchQuestion(
  question: string,
  overrides?: { fetchImpl?: typeof fetch; tavilyKey?: string; synthTimeoutMs?: number },
): Promise<ResearchResult> {
  const doFetch = overrides?.fetchImpl ?? fetch;

  let sources = await tavilySearch(question, doFetch, overrides?.tavilyKey);
  if (!sources || sources.length === 0) {
    sources = await groundingSearch(question, doFetch);
  }
  if (!sources || sources.length === 0) {
    return {
      answer: null,
      sources: [],
      modelId: null,
      reason: overrides?.tavilyKey || process.env.TAVILY_API_KEY ? 'search failed' : 'no search provider',
    };
  }

  const { text, modelId } = await synthesize(
    question,
    sources,
    doFetch,
    overrides?.synthTimeoutMs ?? 30000,
  );
  if (!text) {
    // Retrieval worked but both synth models are down: show the raw sources so
    // the research is still useful.
    return { answer: null, sources, modelId: null, reason: 'synth failed' };
  }
  return { answer: text, sources, modelId };
}
