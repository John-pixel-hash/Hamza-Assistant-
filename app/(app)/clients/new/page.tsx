import type { Metadata } from 'next';
import Link from 'next/link';
import { ClientForm } from '@/components/client-form';

export const metadata: Metadata = { title: 'Add client' };
export const dynamic = 'force-dynamic';

export default function NewClientPage() {
  return (
    <>
      <Link className="text-[13px] font-medium text-brand" href="/clients">
        Back to clients
      </Link>

      <div className="mt-3 mb-5">
        <p className="eyebrow">New client</p>
        <h1 className="h1 mt-1">Who are they</h1>
        <p className="mt-1 text-[14px] muted">
          Only the name matters now. Everything else can be filled in as you learn it.
        </p>
      </div>

      <ClientForm />
    </>
  );
}
