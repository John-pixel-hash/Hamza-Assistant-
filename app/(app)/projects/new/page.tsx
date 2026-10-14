import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/page-heading';
import { ProjectIntakeForm } from '@/components/project-intake-form';
import { getClients } from '@/lib/data/clients';

export const metadata: Metadata = { title: 'New project · Hamza Assistant' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function NewProjectPage() {
  const { clients } = await getClients({ limit: 200 });

  return (
    <>
      <Link className="page-back-link" href="/projects">Back to projects</Link>

      <PageHeading
        eyebrow="Project intake"
        title="Start a project"
        description="Paste the brief. I will restate it, flag deadline risks, and write questions before planning. Nothing is sent to the client."
      />

      <div className="mt-4">
        <ProjectIntakeForm
          clients={clients.map((client) => ({ id: client.id, name: client.name }))}
        />
      </div>
    </>
  );
}
