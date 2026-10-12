import type { Metadata } from 'next';

import { PlaybookCard } from '@/components/playbook-card';
import { getAllPlaybooks } from '@/lib/data/knowledge';

export const metadata: Metadata = { title: 'Knowledge · Hamza Assistant' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function KnowledgePage() {
  const { playbooks, ready } = await getAllPlaybooks();

  return (
    <>
      <p className="eyebrow">Operating knowledge</p>
      <h1 className="h1 mt-1">Playbooks</h1>
      <p className="mt-2 text-[14px] muted">
        The expert modules the assistant loads when a request matches them: checklists and
        decision trees, not essays. Time sensitive ones rot on a schedule, and the research
        engine re-verifies their numbers. Edit them and they version.
      </p>

      {!ready ? (
        <div className="alert alert-warn mt-4">
          The database is not connected yet, so the library cannot load.
        </div>
      ) : playbooks.length === 0 ? (
        <div className="card mt-4 p-5">
          <p className="font-medium">No playbooks yet</p>
          <p className="mt-1 text-[14px] muted">
            Run the seed once and the nine modules land here, ready to read and edit.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {playbooks.map((playbook) => (
            <PlaybookCard key={playbook.id} playbook={playbook} />
          ))}
        </ul>
      )}
    </>
  );
}
