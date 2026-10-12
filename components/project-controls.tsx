'use client';

import { useActionState } from 'react';

import {
  planProjectAction,
  researchProjectAction,
  type ProjectFormState,
} from '@/app/actions/projects';

const initialState: ProjectFormState = { error: null };

function formatEta(seconds: number): string {
  return `about ${seconds} seconds`;
}

/**
 * The two taps that move a project from brief to plan. Research first, plan
 * second, and the copy says so: method advice is never guessed.
 */
export function ProjectControls({
  projectId,
  hasResearch,
  hasPlan,
}: {
  projectId: string;
  hasResearch: boolean;
  hasPlan: boolean;
}) {
  const [researchState, researchAction, researching] = useActionState(
    researchProjectAction,
    initialState,
  );
  const [planState, planAction, planning] = useActionState(planProjectAction, initialState);

  return (
    <div className="card p-4">
      <h2 className="h2">Method and plan</h2>

      <div className="mt-3 space-y-3">
        <form action={researchAction}>
          <input type="hidden" name="project_id" value={projectId} />
          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={researching || planning}
          >
            {researching ? 'Searching and reading sources...' : 'Research the method'}
          </button>
          <p className="mt-1 text-[12px] text-ink-faint">
            {researching
              ? `Two searches, sources saved to the project. Takes ${formatEta(30)}. Stay on this screen.`
              : hasResearch
                ? 'Research saved. The sources are listed below the plan section.'
                : 'Runs two searches on the how: tools, prices, pitfalls. Nothing is advised without it.'}
          </p>
        </form>

        <form action={planAction}>
          <input type="hidden" name="project_id" value={projectId} />
          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={researching || planning || (!hasResearch && !hasPlan)}
          >
            {planning ? 'Writing the steps...' : hasPlan ? 'Plan built' : 'Build the plan'}
          </button>
          <p className="mt-1 text-[12px] text-ink-faint">
            {planning
              ? `Steps with estimates and quality checklists. Takes ${formatEta(20)}.`
              : hasPlan
                ? 'The plan exists. Track it below.'
                : hasResearch
                  ? 'Writes ordered steps from your answers and the research, each with its checklist.'
                  : 'Unlocks after the research. The plan cites what it found.'}
          </p>
        </form>
      </div>

      {(researchState.error || planState.error) && (
        <div className="alert alert-warn mt-3" role="alert">
          {researchState.error ?? planState.error}
        </div>
      )}
    </div>
  );
}
