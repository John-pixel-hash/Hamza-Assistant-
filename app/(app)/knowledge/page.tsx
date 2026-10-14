import type { Metadata } from 'next';

import { PageHeading } from '@/components/page-heading';
import { PlaybookCard } from '@/components/playbook-card';
import { getAllPlaybooks } from '@/lib/data/knowledge';

export const metadata: Metadata = { title: 'Knowledge · Hamza Assistant' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function KnowledgePage() {
  const { playbooks, ready } = await getAllPlaybooks();

  return (
    <>
      <PageHeading
        eyebrow="Your working knowledge"
        title="Playbooks"
        description="Practical checklists and decision guides the assistant can use. Review or update a module any time."
      />

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
