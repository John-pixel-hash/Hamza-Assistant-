'use server';

import { researchQuestion } from '@/lib/ai/research';
import { getStoredTavilyKey } from '@/lib/data/secrets';

export type ResearchState = {
  question: string;
  answer: string | null;
  sources: { title: string; url: string }[];
  error: string | null;
};

/** Only async exports leave a use server file, on purpose. */
export async function researchAction(
  _prev: ResearchState,
  formData: FormData,
): Promise<ResearchState> {
  const question = String(formData.get('question') ?? '').trim();
  if (question.length < 8) {
    return {
      question,
      answer: null,
      sources: [],
      error: 'Type a fuller question so the research has something real to work with.',
    };
  }

  const storedKey = await getStoredTavilyKey();
  const result = await researchQuestion(question, { tavilyKey: storedKey ?? undefined });

  if (result.reason === 'no search provider') {
    return {
      question,
      answer: null,
      sources: [],
      error:
        'Live research needs a free search key. Open Settings, add a Tavily key (free, about 1000 searches a month), then ask again.',
    };
  }
  if (!result.answer) {
    return {
      question,
      answer: null,
      sources: result.sources,
      error:
        result.sources.length > 0
          ? 'The models are busy right now, so no summary, but the sources are below.'
          : 'The research services are busy right now. Try again in a minute.',
    };
  }

  return { question, answer: result.answer, sources: result.sources, error: null };
}
