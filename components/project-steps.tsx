'use client';

import { useActionState, useState } from 'react';

import { updateStepAction, type ProjectFormState } from '@/app/actions/projects';
import type { ProjectStep } from '@/lib/data/projects';

const initialState: ProjectFormState = { error: null };

const STATUS_STYLE: Record<string, string> = {
  not_started: 'bg-line text-ink-soft',
  in_progress: 'bg-brand-soft text-brand-ink',
  review: 'bg-gold-soft text-ink',
  blocked: 'bg-danger-soft text-danger',
  done: 'bg-brand text-white',
};

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  review: 'In review',
  blocked: 'Blocked',
  done: 'Done',
};

function formatEstimate(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function StepCard({ step }: { step: ProjectStep }) {
  const [state, formAction, pending] = useActionState(updateStepAction, initialState);
  const [blocking, setBlocking] = useState(false);

  const passed = step.quality_checklist.filter((item) => item.done).length;
  const total = step.quality_checklist.length;
  const estimate = formatEstimate(step.estimate_minutes);

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-medium">
          {step.position}. {step.title}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[step.status] ?? STATUS_STYLE.not_started}`}
        >
          {STATUS_LABEL[step.status] ?? step.status}
        </span>
      </div>

      {step.detail && <p className="mt-1 text-[13px] text-ink-soft">{step.detail}</p>}
      {step.method && (
        <p className="mt-1 text-[13px] text-ink-soft">
          <span className="font-medium">Method: </span>
          {step.method}
          {step.method_source && (
            <>
              {' '}
              <a className="text-brand" href={step.method_source} target="_blank" rel="noreferrer">
                source
              </a>
            </>
          )}
        </p>
      )}
      {estimate && <p className="mt-1 text-[12px] text-ink-faint">Estimate: {estimate}</p>}

      {step.status === 'blocked' && step.blocked_reason && (
        <p className="mt-2 rounded-lg border border-danger-line bg-danger-soft p-2 text-[13px] text-danger">
          <span className="font-medium">Blocked by: </span>
          {step.blocked_reason}
        </p>
      )}

      {total > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-medium text-ink-soft">
            Quality checklist · {passed}/{total} passed
          </p>
          <ul className="mt-1 space-y-1">
            {step.quality_checklist.map((item, index) => (
              <li key={item.item} className="flex items-start gap-2">
                <form action={formAction} className="contents">
                  <input type="hidden" name="step_id" value={step.id} />
                  <input type="hidden" name="intent" value="toggle" />
                  <input type="hidden" name="check_index" value={index} />
                  <button
                    type="submit"
                    disabled={pending || step.status === 'done'}
                    aria-pressed={item.done}
                    aria-label={`${item.done ? 'Uncheck' : 'Check'} ${item.item}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-strong text-[14px] text-white disabled:opacity-50"
                    style={item.done ? { background: '#1d4ed8', borderColor: '#1d4ed8' } : undefined}
                    title={step.status === 'done' ? 'Checklist locked, step is done' : 'Toggle this check'}
                  >
                    {item.done ? '✓' : ''}
                  </button>
                </form>
                <span className={`text-[13px] ${item.done ? 'text-ink-faint line-through' : 'text-ink-soft'}`}>
                  {item.item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.error && (
        <div className="alert alert-warn mt-3" role="alert">
          {state.error}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {step.status === 'not_started' && (
          <form action={formAction} className="contents">
            <input type="hidden" name="step_id" value={step.id} />
            <button className="btn btn-quiet btn-small" name="intent" value="start" type="submit" disabled={pending}>
              Start
            </button>
          </form>
        )}
        {step.status === 'in_progress' && (
          <form action={formAction} className="contents">
            <input type="hidden" name="step_id" value={step.id} />
            <button className="btn btn-quiet btn-small" name="intent" value="review" type="submit" disabled={pending}>
              Send to review
            </button>
          </form>
        )}
        {(step.status === 'in_progress' || step.status === 'review') && (
          <>
            <form action={formAction} className="contents">
              <input type="hidden" name="step_id" value={step.id} />
              <button className="btn btn-primary btn-small" name="intent" value="done" type="submit" disabled={pending}>
                Mark done
              </button>
            </form>
            <button
              className="btn btn-quiet btn-small text-danger"
              type="button"
              onClick={() => setBlocking((value) => !value)}
            >
              Block
            </button>
          </>
        )}
        {step.status === 'blocked' && (
          <form action={formAction} className="contents">
            <input type="hidden" name="step_id" value={step.id} />
            <button className="btn btn-quiet btn-small" name="intent" value="unblock" type="submit" disabled={pending}>
              Unblock
            </button>
          </form>
        )}
        {step.status === 'done' && (
          <p className="text-[12px] text-ink-faint">Passed its checklist. Locked.</p>
        )}
      </div>

      {blocking && (step.status === 'in_progress' || step.status === 'review') && (
        <form action={formAction} className="mt-2">
          <input type="hidden" name="step_id" value={step.id} />
          <textarea
            className="field"
            name="blocked_reason"
            rows={2}
            required
            placeholder="What is blocking it? Waiting on client copy, no hosting access..."
          />
          <button className="btn btn-quiet btn-small mt-2 text-danger" name="intent" value="block" type="submit" disabled={pending}>
            {pending ? 'Saving...' : 'Block this step'}
          </button>
        </form>
      )}
    </li>
  );
}

export function ProjectSteps({ steps }: { steps: ProjectStep[] }) {
  return (
    <ul className="space-y-3">
      {steps.map((step) => (
        <StepCard key={step.id} step={step} />
      ))}
    </ul>
  );
}
