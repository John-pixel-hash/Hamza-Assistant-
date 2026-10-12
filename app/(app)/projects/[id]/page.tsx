import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProjectControls } from '@/components/project-controls';
import { ProjectQuestions } from '@/components/project-questions';
import { ProjectSteps } from '@/components/project-steps';
import { ProjectUpdateDraft } from '@/components/project-update-draft';
import { getProject } from '@/lib/data/projects';

export const metadata: Metadata = { title: 'Project · Hamza Assistant' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  intake: 'Intake',
  planned: 'Planned',
  active: 'Active',
  review: 'In review',
  delivered: 'Delivered',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const doneSteps = project.steps.filter((step) => step.status === 'done').length;
  const answered = project.questions.filter((q) => q.status === 'answered').length;
  const openQuestions = project.questions.filter(
    (q) => q.status === 'open' || q.status === 'sent',
  ).length;

  return (
    <>
      <Link
        className="text-[13px] font-medium text-brand"
        href={project.client ? `/clients/${project.client.id}` : '/projects'}
      >
        {project.client ? `Back to ${project.client.name}` : 'Back to projects'}
      </Link>

      <header className="card mt-3 p-4">
        <p className="eyebrow">{STATUS_LABEL[project.status] ?? project.status}</p>
        <h1 className="h1 mt-1">{project.title}</h1>
        <p className="mt-1 text-[13px] muted">
          {project.client?.name ?? 'No client linked'}
          {project.deadline
            ? ` · due ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(project.deadline))}`
            : ' · no deadline set'}
          {project.budget_amount
            ? ` · ${(project.budget_amount / 100).toLocaleString('en-GB')} ${project.currency ?? 'USD'}`
            : ''}
        </p>
        {project.steps.length > 0 && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-line" role="presentation">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.round((doneSteps / project.steps.length) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[12px] text-ink-faint">
              {doneSteps} of {project.steps.length} steps done
            </p>
          </div>
        )}
      </header>

      {project.brief_json?.deadline_risk && (
        <div className="alert alert-warn mt-3" role="alert">
          <span className="font-medium">Deadline risk: </span>
          {project.brief_json.deadline_risk}
        </div>
      )}

      <section className="card mt-4 p-4">
        <h2 className="h2">The brief, restated</h2>
        {project.brief_json ? (
          <div className="mt-2 space-y-3 text-[14px]">
            <p>
              <span className="font-medium">Goal: </span>
              {project.brief_json.goal}
            </p>
            {project.brief_json.deliverables && project.brief_json.deliverables.length > 0 && (
              <div>
                <p className="font-medium">Deliverables</p>
                <ul className="mt-1 list-disc pl-5 text-ink-soft">
                  {project.brief_json.deliverables.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {project.brief_json.constraints && project.brief_json.constraints.length > 0 && (
              <div>
                <p className="font-medium">Constraints</p>
                <ul className="mt-1 list-disc pl-5 text-ink-soft">
                  {project.brief_json.constraints.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {project.brief_json.success && project.brief_json.success.length > 0 && (
              <div>
                <p className="font-medium">Success looks like</p>
                <ul className="mt-1 list-disc pl-5 text-ink-soft">
                  {project.brief_json.success.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {project.brief_json.next_step && (
              <p>
                <span className="font-medium">Next step: </span>
                {project.brief_json.next_step}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2">
            <div className="alert alert-warn" role="status">
              The AI pass did not land, so this is your raw brief only. Nothing was lost.
            </div>
            {project.brief && (
              <p className="mt-2 whitespace-pre-wrap text-[14px] text-ink-soft">{project.brief}</p>
            )}
          </div>
        )}
      </section>

      <section className="mt-5">
        <h2 className="h2">
          Questions before planning{' '}
          <span className="text-[13px] font-normal text-ink-faint">
            {answered}/{project.questions.length} answered
          </span>
        </h2>
        <div className="mt-2">
          <ProjectQuestions questions={project.questions} />
        </div>
      </section>

      <section className="mt-5">
        <h2 className="h2">The plan</h2>
        {project.steps.length === 0 ? (
          <>
            {openQuestions > 0 && (
              <p className="mt-1 text-[13px] text-ink-soft">
                {openQuestions} open {openQuestions === 1 ? 'question' : 'questions'} above will
                become listed assumptions in the plan. Answer them and the plan gets sharper.
              </p>
            )}
            <div className="mt-2">
              <ProjectControls
                projectId={project.id}
                hasResearch={project.research.length > 0}
                hasPlan={false}
              />
            </div>
          </>
        ) : (
          <>
            {Array.isArray(project.brief_json?.planning_assumptions) &&
              (project.brief_json?.planning_assumptions?.length ?? 0) > 0 && (
                <div className="alert alert-warn mt-2" role="status">
                  <span className="font-medium">Assumed, not confirmed: </span>
                  <ul className="mt-1 list-disc pl-5 text-[13px]">
                    {project.brief_json?.planning_assumptions?.map((assumption) => (
                      <li key={assumption}>{assumption}</li>
                    ))}
                  </ul>
                </div>
              )}
            <div className="mt-2">
              <ProjectSteps steps={project.steps} />
            </div>
          </>
        )}
      </section>

      {project.steps.length > 0 && (
        <section className="mt-5">
          <ProjectUpdateDraft projectId={project.id} />
        </section>
      )}

      {project.research.length > 0 && (
        <section className="mt-5">
          <h2 className="h2">Research behind the method</h2>
          <ul className="mt-2 space-y-3">
            {project.research.map((note) => (
              <li key={note.id} className="card p-4">
                <p className="text-[13px] font-medium">{note.query}</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink-soft">{note.summary}</p>
                <ul className="mt-2 space-y-0.5">
                  {note.sources.map((source) => (
                    <li key={source.url} className="text-[12px]">
                      <a className="text-brand" href={source.url} target="_blank" rel="noreferrer">
                        {source.title ?? source.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
