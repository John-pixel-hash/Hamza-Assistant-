import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { SearchBar, StageFilter } from '@/components/search-bar';
import { StageBadge } from '@/components/ui';
import { getClients } from '@/lib/data/clients';
import { STAGES, STAGE_LABELS, isStage } from '@/lib/domain';
import { formatMoney, humaniseInterval, preview } from '@/lib/text/snippet';

export const metadata: Metadata = { title: 'Clients' };
export const dynamic = 'force-dynamic';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string }>;
}) {
  const { q, stage } = await searchParams;
  const activeStage = stage && isStage(stage) ? stage : undefined;
  const { clients, ready } = await getClients({ q, stage: activeStage });

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Client memory</p>
          <h1 className="h1 mt-1">Clients</h1>
          <p className="mt-1 text-[14px] muted">
            {ready
              ? `${clients.length} ${clients.length === 1 ? 'client' : 'clients'}${q || activeStage ? ' matching' : ''}`
              : 'Not connected'}
          </p>
        </div>
        <Link className="btn btn-primary btn-small shrink-0" href="/clients/new">
          Add client
        </Link>
      </div>

      <div className="mb-3">
        <SearchBar
          action="/clients"
          defaultValue={q ?? ''}
          placeholder="Search names and companies"
          hidden={activeStage ? { stage: activeStage } : {}}
        />
      </div>

      <div className="mb-5">
        <StageFilter
          basePath="/clients"
          stages={STAGES}
          labels={STAGE_LABELS}
          current={activeStage}
          query={q}
        />
      </div>

      {!ready ? (
        <div className="alert alert-warn">
          The database is not reachable, so client memory cannot load. Check the checklist on Today.
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          title={q || activeStage ? 'Nothing matched that' : 'No clients yet'}
          body={
            q || activeStage
              ? 'Try fewer words, or clear the filter to see everyone.'
              : 'Add your first client and paste the last thing they said to you. The history is what makes the assistant useful later.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {clients.map((client) => {
            const deal = formatMoney(client.deal_value_estimate, client.currency);
            const overdue =
              (client.stage === 'quoted' || client.stage === 'negotiating') &&
              client.last_contact_at !== null &&
              Date.now() - new Date(client.last_contact_at).getTime() > 7 * 24 * 60 * 60 * 1000;

            return (
              <li key={client.id}>
                <Link className="card block p-4" href={`/clients/${client.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-semibold">{client.name}</p>
                      <p className="truncate text-[13px] muted">
                        {client.company ?? 'No company'}
                        {client.country ? ` · ${client.country}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StageBadge stage={client.stage} label={STAGE_LABELS[client.stage as keyof typeof STAGE_LABELS] ?? client.stage} />
                      {deal && <p className="figure mt-1 text-[13px] font-semibold text-gold">{deal}</p>}
                    </div>
                  </div>

                  {client.last_message && (
                    <p className="mt-3 line-clamp-2 text-[13px] text-ink-soft">
                      <span className="font-medium text-ink-faint">
                        {client.last_message_role === 'client' ? 'They said: ' : 'You said: '}
                      </span>
                      {preview(client.last_message, 140)}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-faint">
                    <span>
                      {client.last_contact_at
                        ? `Last contact ${humaniseInterval(relativeInterval(client.last_contact_at))}`
                        : 'No contact recorded yet'}
                    </span>
                    {client.client_message_count > 0 && <span>{client.client_message_count} messages</span>}
                    {client.open_projects > 0 && <span className="text-brand">{client.open_projects} open project</span>}
                    {overdue && <span className="font-semibold text-warn">Follow up due</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** Turns a timestamp into the Postgres interval style string the helper reads. */
function relativeInterval(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  return `${days} days ${hours % 24}:00:00`;
}
