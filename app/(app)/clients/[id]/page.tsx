import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { NewThreadForm } from '@/components/new-thread-form';
import { PageHeading } from '@/components/page-heading';
import { StageBadge, RoleTag } from '@/components/ui';
import { getClientDetail, getClientFacts, getClientMessages } from '@/lib/data/clients';
import { getClientThreads } from '@/lib/data/threads';
import { deleteFactAction, togglePinFactAction } from '@/app/actions/facts';
import { RELATIONSHIP_SUMMARY_KEY } from '@/lib/ai/memory';
import { CHANNEL_LABELS, ROLE_LABELS, SOURCE_LABELS, STAGE_LABELS } from '@/lib/domain';
import { formatMoney, humaniseInterval, preview } from '@/lib/text/snippet';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { client } = await getClientDetail(id);
  return { title: client?.name ?? 'Client' };
}

const MODE_LABELS: Record<string, string> = {
  client_reply: 'Client conversation',
  project: 'Project work',
  internal: 'Internal only',
};

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, ready } = await getClientDetail(id);

  if (!ready) {
    return (
      <div className="alert alert-warn">
        The database is not reachable, so this client cannot load.
      </div>
    );
  }

  if (!client) {
    return (
      <EmptyState
        title="No such client"
        body="That client is not in your records. It may have been removed, or the link is wrong."
      />
    );
  }

  const [threads, messages, facts] = await Promise.all([
    getClientThreads(client.id),
    getClientMessages(client.id, 30),
    getClientFacts(client.id),
  ]);

  const deal = formatMoney(client.deal_value_estimate, client.currency);
  const followUpDue =
    (client.stage === 'quoted' || client.stage === 'negotiating') &&
    client.last_contact_at !== null &&
    Date.now() - new Date(client.last_contact_at).getTime() > 7 * 24 * 60 * 60 * 1000;

  return (
    <>
      <Link className="page-back-link" href="/clients">Back to clients</Link>

      <PageHeading
        eyebrow="Client record"
        title={client.name}
        description={`${client.company ?? 'No company'}${client.country ? ` · ${client.country}` : ''}`}
        actions={(
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <StageBadge
              stage={client.stage}
              label={STAGE_LABELS[client.stage as keyof typeof STAGE_LABELS] ?? client.stage}
            />
            <Link className="btn btn-quiet btn-small" href={`/clients/${client.id}/edit`}>Edit details</Link>
            <Link className="btn btn-quiet btn-small" href={`/search?q=${encodeURIComponent(client.name)}`}>Find messages</Link>
          </div>
        )}
      />

      <section className="card p-4 sm:p-5">
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-4">
          <div>
            <dt className="text-ink-faint">Deal value</dt>
            <dd className={`figure font-semibold ${deal ? 'text-gold' : 'text-ink-soft'}`}>
              {deal ?? 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-ink-faint">Came from</dt>
            <dd>{client.source ? SOURCE_LABELS[client.source as keyof typeof SOURCE_LABELS] ?? client.source : 'Not known'}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Talks on</dt>
            <dd>
              {client.channel
                ? CHANNEL_LABELS[client.channel as keyof typeof CHANNEL_LABELS] ?? client.channel
                : 'Not known'}
            </dd>
          </div>
          <div>
            <dt className="text-ink-faint">Last contact</dt>
            <dd>
              {client.last_contact_at ? humaniseInterval(relativeInterval(client.last_contact_at)) : 'None yet'}
            </dd>
          </div>
        </dl>

        {client.tags && client.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {client.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[12px] text-ink-soft">
                {tag}
              </span>
            ))}
          </div>
        )}

        {followUpDue && (
          <div className="alert alert-warn mt-4">
            They were quoted and it has been over a week. This is the stage where deals go quiet, so a
            short follow up with something concrete works better than a nudge.
          </div>
        )}

      </section>

      {/* Start a thread */}
      <section className="mt-5">
        <NewThreadForm clientId={client.id} />
      </section>

      {/* Threads */}
      <section className="mt-5">
        <h2 className="h2 mb-3">Conversations</h2>
        {threads.length === 0 ? (
          <EmptyState
            title="No conversation yet"
            body="Start a thread above, then paste what the client sent you. Every message you save becomes memory the assistant can use."
          />
        ) : (
          <ul className="card divide-y divide-line">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link className="flex items-center justify-between gap-3 p-4" href={`/threads/${thread.id}`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{thread.title}</p>
                    <p className="text-[12px] text-ink-faint">
                      {MODE_LABELS[thread.mode] ?? thread.mode} · {thread.message_count}{' '}
                      {thread.message_count === 1 ? 'message' : 'messages'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-faint">
                    {thread.last_message_at ? humaniseInterval(relativeInterval(thread.last_message_at)) : 'empty'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Memory */}
      <section className="mt-5">
        <h2 className="h2 mb-3">What I know about them</h2>
        {(() => {
          const summary =
            facts.find((fact) => fact.key === RELATIONSHIP_SUMMARY_KEY)?.value ?? null;
          const governable = facts.filter((fact) => fact.key !== RELATIONSHIP_SUMMARY_KEY);
          return (
            <>
              {summary && (
                <div className="card mb-3 p-4">
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
                    Relationship
                  </p>
                  <p className="mt-1 text-[14px]">{summary}</p>
                </div>
              )}
              {governable.length === 0 && !summary ? (
          <div className="card p-4 text-[14px] muted">
            Nothing remembered yet. Save a message on any thread and the memory engine pulls the
            durable facts from it: budget, country, store link, what was promised, what was refused.
          </div>
        ) : null}
              {governable.length > 0 && (
          <>
            <ul className="card divide-y divide-line">
              {governable.map((fact) => (
                <li key={fact.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
                      {fact.key}
                      {fact.is_pinned && (
                        <span className="ml-2 text-[11px] font-semibold normal-case text-gold">Pinned</span>
                      )}
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <form action={togglePinFactAction}>
                        <input name="fact_id" type="hidden" value={fact.id} />
                        <input name="client_id" type="hidden" value={client.id} />
                        <button className="btn btn-quiet btn-small" type="submit">
                          {fact.is_pinned ? 'Unpin' : 'Pin'}
                        </button>
                      </form>
                      <form action={deleteFactAction}>
                        <input name="fact_id" type="hidden" value={fact.id} />
                        <input name="client_id" type="hidden" value={client.id} />
                        <button className="btn btn-quiet btn-small text-danger" type="submit">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                  <p className="mt-1 break-words">{fact.value}</p>
                </li>
              ))}
            </ul>
              <p className="mt-2 text-[12px] text-ink-faint">
                Pinned facts survive every future extraction. A deleted fact stays deleted, because new
                facts come from the conversations, not from old memory.
              </p>
              </>
            )}
            </>
          );
        })()}
      </section>

      {/* Timeline */}
      <section className="mt-5">
        <h2 className="h2 mb-3">Recent history</h2>
        {messages.length === 0 ? (
          <EmptyState title="Nothing recorded" body="Saved messages appear here in order, with their real dates." />
        ) : (
          <ol className="space-y-3">
            {messages.map((message) => (
              <li key={message.message_id} className="card p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
                  <RoleTag role={message.role} label={ROLE_LABELS[message.role] ?? message.role} />
                  <span>{new Date(message.sent_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</span>
                  <span>in {message.thread_title}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[14px]">{preview(message.content, 600)}</p>
                <Link className="mt-2 inline-block text-[12px] font-medium text-brand" href={`/threads/${message.thread_id}`}>
                  Open thread
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {client.notes && (
        <section className="mt-5">
          <h2 className="h2 mb-3">Notes</h2>
          <div className="card whitespace-pre-wrap p-4 text-[14px]">{client.notes}</div>
        </section>
      )}
    </>
  );
}

function relativeInterval(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  return `${days} days ${hours % 24}:00:00`;
}
