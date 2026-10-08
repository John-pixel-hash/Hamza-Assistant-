import type { Metadata } from 'next';
import { EmptyState } from '@/components/empty-state';
import { getProjects } from '@/lib/data/projects';

export const metadata: Metadata = { title: 'Projects' };
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

export default async function ProjectsPage() {
  const { projects, ready } = await getProjects();

  return (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-[14px] text-ink-soft">
          {ready
            ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} tracked`
            : 'Not connected yet'}
        </p>
      </div>

      {!ready ? (
        <div className="alert alert-warn mb-5">
          The database schema is not installed yet. Run the migrations first.
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          body="Phase 6 adds project intake, the intelligent questions, researched plans, and step tracking with quality checklists."
        />
      ) : (
        <ul className="card divide-y divide-line">
          {projects.map((p) => {
            const done = p.steps.filter((s) => s.status === 'done').length;
            const total = p.steps.length;
            return (
              <li key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="truncate text-[13px] text-ink-soft">
                      {p.clients?.name ?? 'No client'} · {STATUS_LABEL[p.status] ?? p.status}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-faint">
                    {total > 0 ? `${done}/${total} steps` : 'no steps yet'}
                  </span>
                </div>
                {p.deadline && (
                  <p className="mt-2 text-[12px] text-ink-faint">
                    Due {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(p.deadline))}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
