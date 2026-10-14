import type { Metadata } from 'next';
import Link from 'next/link';
import { ClientForm } from '@/components/client-form';
import { PageHeading } from '@/components/page-heading';

export const metadata: Metadata = { title: 'Add client' };
export const dynamic = 'force-dynamic';

export default function NewClientPage() {
  return (
    <>
      <Link className="page-back-link" href="/clients">Back to clients</Link>
      <PageHeading
        eyebrow="Client details"
        title="Add a client"
        description="Start with a name. You can add the rest as you go."
      />

      <ClientForm />
    </>
  );
}
