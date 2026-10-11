import { ResearchForm } from '@/components/research-form';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const metadata = { title: 'Research · Hamza Assistant' };

export default function ResearchPage() {
  return (
    <>
      <p className="eyebrow">Research</p>
      <h1 className="h1 mt-1">Check before you advise</h1>
      <p className="mt-2 text-[14px] muted">
        Ask anything technical or strategic. The answer comes from live search
        results and shows its sources, so nothing here is a guess.
      </p>
      <div className="mt-4">
        <ResearchForm />
      </div>
    </>
  );
}
