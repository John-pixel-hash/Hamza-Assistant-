import Link from 'next/link';
import type { Segment } from '@/lib/text/snippet';

/** Stage chip. Blue carries live deals, gold marks a repeat buyer, grey is history. */
export function StageBadge({ stage, label }: { stage: string; label: string }) {
  const style =
    stage === 'repeat'
      ? 'bg-gold-soft text-gold border-gold-line'
      : stage === 'quoted' || stage === 'negotiating' || stage === 'active'
        ? 'bg-brand-soft text-brand-ink border-[#cfdcfb]'
        : 'bg-canvas text-ink-soft border-line';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${style}`}>
      {label}
    </span>
  );
}

export function RoleTag({ role, label }: { role: string; label: string }) {
  const style =
    role === 'client'
      ? 'bg-brand-soft text-brand-ink'
      : role === 'me'
        ? 'bg-canvas text-ink-soft'
        : role === 'note'
          ? 'bg-gold-soft text-gold'
          : 'bg-canvas text-ink-faint';

  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style}`}>
      {label}
    </span>
  );
}

/** Renders a search snippet. Highlighted words become elements, never HTML. */
export function Highlight({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.marked ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>,
      )}
    </>
  );
}

export function StatTile({
  label,
  value,
  href,
  accent = false,
}: {
  label: string;
  value: string | number;
  href?: string;
  accent?: boolean;
}) {
  const body = (
    <div className="card h-full p-4">
      <p className={`figure text-2xl font-semibold ${accent ? 'text-gold' : 'text-ink'}`}>{value}</p>
      <p className="mt-1 text-[13px] muted">{label}</p>
    </div>
  );

  return href ? (
    <Link className="block h-full" href={href}>
      {body}
    </Link>
  ) : (
    body
  );
}

export function InlineLinks({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">{children}</div>;
}

/** A labelled row for facts and metadata, used on the client page. */
export function FactRow({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <li className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
        <p className="mt-0.5 break-words">{value}</p>
        {note && <p className="mt-0.5 text-[12px] text-ink-faint">{note}</p>}
      </div>
    </li>
  );
}
