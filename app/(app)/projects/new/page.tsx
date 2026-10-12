import type { Metadata } from 'next';
import Link from 'next/link';

import { ProjectIntakeForm } from '@/components/project-intake-form';
import { getClients } from '@/lib/data/clients';

export const metadata: Metadata = { title: 'New project · Hamza Assistant' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function NewProjectPage() {
  const { clients } = await getClients({ limit: 200 });

  return (
    <>
      <Link className="text-[13px] font-medium text-brand" href="/projects">
        Back to projects
      </Link>

      <p className="eyebrow mt-3">Project intake</p>
      <h1 className="h1 mt-1">Start a project</h1>
      <p className="mt-2 text-[14px] muted">
        Paste the brief. The assistant restates it, flags a deadline that does not fit, and
        writes the questions a professional asks before planning. Nothing is sent to the
        client.
      </p>

      <div className="mt-4">
        <ProjectIntakeForm
          clients={clients.map((client) => ({ id: client.id, name: client.name }))}
        />
      </div>
    </>
  );
}
