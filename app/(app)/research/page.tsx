import { PageHeading } from '@/components/page-heading';
import { ResearchForm } from '@/components/research-form';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const metadata = { title: 'Research · Hamza Assistant' };

export default function ResearchPage() {
  return (
    <>
      <PageHeading
        eyebrow="Live sources"
        title="Research"
        description="Check technical or strategic questions against current sources before you advise."
      />
      <ResearchForm />
    </>
  );
}
