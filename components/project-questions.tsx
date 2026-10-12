'use client';

import { useActionState, useState } from 'react';

import { updateQuestionAction, type ProjectFormState } from '@/app/actions/projects';
import type { ProjectQuestion } from '@/lib/data/projects';

const initialState: ProjectFormState = { error: null };

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-line text-ink-soft',
  sent: 'bg-brand-soft text-brand-ink',
  answered: 'bg-gold-soft text-ink',
  dismissed: 'bg-line text-ink-faint line-through',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-quiet btn-small"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function QuestionCard({ question }: { question: ProjectQuestion }) {
  const [state, formAction, pending] = useActionState(updateQuestionAction, initialState);
  const [answering, setAnswering] = useState(false);

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-medium">{question.question}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[question.status] ?? STATUS_STYLE.open}`}
        >
          {question.status}
        </span>
      </div>

      <p className="mt-1.5 text-[13px] text-ink-soft">
        <span className="font-medium">Why it matters: </span>
        {question.why_it_matters}
      </p>

      {question.status === 'answered' && question.answer && (
        <p className="mt-2 rounded-lg border border-gold-line bg-gold-soft p-3 text-[13px]">
          <span className="font-medium">Their answer: </span>
          {question.answer}
        </p>
      )}

      {state.error && (
        <div className="alert alert-error mt-2" role="alert">
          {state.error}
        </div>
      )}

      {question.status !== 'dismissed' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CopyButton text={question.question} />
          {question.status !== 'answered' && (
            <form action={formAction} className="contents">
              <input type="hidden" name="question_id" value={question.id} />
              {question.status === 'open' && (
                <button
                  className="btn btn-quiet btn-small"
                  name="intent"
                  value="sent"
                  type="submit"
                  disabled={pending}
                >
                  Mark sent
                </button>
              )}
              <button
                className="btn btn-quiet btn-small"
                type="button"
                onClick={() => setAnswering((value) => !value)}
              >
                {answering ? 'Close' : 'Record answer'}
              </button>
              <button
                className="btn btn-quiet btn-small text-ink-faint"
                name="intent"
                value="dismissed"
                type="submit"
                disabled={pending}
              >
                Dismiss
              </button>
            </form>
          )}
        </div>
      )}

      {answering && question.status !== 'answered' && (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="question_id" value={question.id} />
          <textarea
            className="field"
            name="answer"
            rows={2}
            required
            placeholder="What did they say? One line is enough."
          />
          <button
            className="btn btn-primary btn-small mt-2"
            name="intent"
            value="answered"
            type="submit"
            disabled={pending}
          >
            {pending ? 'Saving...' : 'Save answer'}
          </button>
        </form>
      )}
    </li>
  );
}

export function ProjectQuestions({ questions }: { questions: ProjectQuestion[] }) {
  const openCount = questions.filter((q) => q.status === 'open' || q.status === 'sent').length;

  if (questions.length === 0) {
    return (
      <div className="card p-5">
        <p className="font-medium">No questions yet</p>
        <p className="mt-1 text-[14px] muted">
          The intake pass found nothing missing. If the brief changes, the planner will ask again.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-[13px] text-ink-soft">
        {openCount === 0
          ? 'All questions closed. The planner has what it needs.'
          : `${openCount} still ${openCount === 1 ? 'needs' : 'need'} an answer before the plan is built. Copy the ones worth sending, record what comes back.`}
      </p>
      <ul className="space-y-3">
        {questions.map((question) => (
          <QuestionCard key={question.id} question={question} />
        ))}
      </ul>
    </div>
  );
}
