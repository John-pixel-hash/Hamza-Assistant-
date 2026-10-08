import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientForm } from '@/components/client-form';
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
      <Link className="text-[13px] font-medium text-brand" href={`/clients/${client.id}`}>
        Back to {client.name}
      </Link>

      <div className="mt-3 mb-5">
        <p className="eyebrow">Edit</p>
        <h1 className="h1 mt-1">{client.name}</h1>
        <p className="mt-1 text-[14px] muted">Update anything that has changed. Save and go straight back.</p>
      </div>

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
