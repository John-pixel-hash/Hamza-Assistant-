'use client';

import { useActionState, useState } from 'react';

import { researchAction, type ResearchState } from '@/app/actions/research';

const INITIAL: ResearchState = { question: '', answer: null, sources: [], error: null };

export function ResearchForm() {
  const [state, formAction, pending] = useActionState(researchAction, INITIAL);
  const [question, setQuestion] = useState('');

  return (
    <div>
      <form
        action={async (formData: FormData) => {
          await formAction(formData);
        }}
        className="card rounded-3xl p-3"
      >
        {state.error && (
          <div className="alert alert-error mb-2" role="alert">
            {state.error}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            name="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={2}
            required
            className="input flex-1 resize-none"
            placeholder="What should I check? Example: what does a 5 page WordPress site cost in 2026"
          />
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"
            type="submit"
            disabled={pending || question.trim().length === 0}
            title="Research"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.2 4.2 1.4-1.4-4.2-4.2A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z" />
            </svg>
          </button>
        </div>
      </form>

      {pending && (
        <p className="mt-4 text-center text-[13px] text-ink-faint">Searching and reading sources...</p>
      )}

      {(state.answer || state.sources.length > 0) && (
        <div className="card mt-4 p-4">
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
            {state.question}
          </p>
          {state.answer && <p className="whitespace-pre-wrap text-[14px]">{state.answer}</p>}
          {state.sources.length > 0 && (
            <details className="mt-4 text-[13px]" open>
              <summary className="cursor-pointer font-semibold text-ink-faint">
                Sources ({state.sources.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {state.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      className="text-brand underline"
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
