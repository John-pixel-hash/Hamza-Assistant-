import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientForm } from '@/components/client-form';
import { PageHeading } from '@/components/page-heading';
import { getClientDetail } from '@/lib/data/clients';

export const metadata: Metadata = { title: 'Edit client' };
export const dynamic = 'force-dynamic';

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, ready } = await getClientDetail(id);

  if (!ready) {
    return <div className="alert alert-warn">The database is not reachable right now.</div>;
  }
  if (!client) notFound();

  return (
    <>
      <Link className="page-back-link" href={`/clients/${client.id}`}>
        Back to {client.name}
      </Link>
      <PageHeading
        eyebrow="Client details"
        title="Edit client"
        description="Update the record and save your changes."
      />

      <ClientForm
        defaults={{
          id: client.id,
          name: client.name,
          company: client.company,
          stage: client.stage,
          source: client.source,
          channel: client.channel,
          country: client.country,
          deal_value:
            client.deal_value_estimate === null ? '' : String(client.deal_value_estimate / 100),
          currency: client.currency ?? 'USD',
          tags: client.tags ?? [],
          notes: client.notes,
        }}
      />
    </>
  );
}
