import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchBar } from '@/components/search-bar';
import { Highlight, RoleTag } from '@/components/ui';
import { searchMessages } from '@/lib/data/search';
import { ROLE_LABELS } from '@/lib/domain';
import { splitHighlights } from '@/lib/text/snippet';

export const metadata: Metadata = { title: 'Search' };
export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();
  const results = query.length >= 2 ? await searchMessages(query, 40) : [];

  return (
    <>
      <div className="mb-4">
        <p className="eyebrow">Every conversation</p>
        <h1 className="h1 mt-1">Search</h1>
        <p className="mt-1 text-[14px] muted">
          All words must appear, the way a web search works. Use OR to widen it, and quotes for a phrase.
        </p>
      </div>

      <SearchBar action="/search" defaultValue={query} placeholder="quote, deposit, deadline, OR" />

      <div className="mt-5">
        {query.length < 2 ? (
          <div className="card p-5">
            <p className="font-medium">Type at least two characters</p>
            <p className="mt-1 text-[14px] muted">
              Search runs across every message you have saved, for every client, from the first one you
              ever recorded.
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="card p-5">
            <p className="font-medium">Nothing matched that</p>
            <p className="mt-1 text-[14px] muted">
              Try fewer words, check the spelling, or widen it with OR.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-ink-faint">
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </p>
            <ul className="space-y-3">
              {results.map((hit) => (
                <li key={hit.message_id} className="card p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
                    <RoleTag role={hit.role} label={ROLE_LABELS[hit.role] ?? hit.role} />
                    {hit.client_id ? (
                      <Link className="font-medium text-brand" href={`/clients/${hit.client_id}`}>
                        {hit.client_name ?? 'Client'}
                      </Link>
                    ) : (
                      <span>No client</span>
                    )}
                    <span>·</span>
                    <span>{new Date(hit.sent_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</span>
                  </div>

                  <p className="text-[14px] leading-relaxed">
                    <Highlight segments={splitHighlights(hit.snippet)} />
                  </p>

                  <Link className="mt-2 inline-block text-[12px] font-medium text-brand" href={`/threads/${hit.thread_id}`}>
                    Open {hit.thread_title}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
