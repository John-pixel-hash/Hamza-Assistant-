import type { Metadata } from 'next';
import Link from 'next/link';
import { SetupChecklist } from '@/components/setup-checklist';
import { EmptyState } from '@/components/empty-state';
import { PageHeading } from '@/components/page-heading';
import { StageBadge, StatTile } from '@/components/ui';
import { getOverview } from '@/lib/data/overview';
import { latestThreadIdsForClients } from '@/lib/data/threads';
import { serverConfigStatus } from '@/lib/env';
import { FOLLOWUP_LABELS, STAGE_LABELS } from '@/lib/domain';
import { humaniseInterval, preview } from '@/lib/text/snippet';

export const metadata: Metadata = { title: 'Today' };
export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const [overview, config] = await Promise.all([
    getOverview(),
    Promise.resolve(serverConfigStatus()),
  ]);
  const followUpThreads = await latestThreadIdsForClients(
    overview.followUps.map((followUp) => followUp.client_id),
  );

  const checklist = [
    { label: 'Supabase project connected', done: config.supabaseUrl && config.supabaseKey },
    { label: 'Owner email locked', done: config.allowedEmail },
    { label: 'Database schema installed', done: overview.schemaReady },
    { label: 'Secret key set (server only)', done: config.secretKey },
    { label: 'Google Gemini key set', done: config.googleKey },
    { label: 'Research live once a free Tavily key is in Settings', done: Boolean(config.tavilyKey) },
  ];
  const remaining = checklist.filter((item) => !item.done).length;

  return (
    <>
      <PageHeading
        eyebrow={todayLine()}
        title="Today"
        description="Your clients, follow-ups, and projects in one place."
        actions={(
          <>
            <Link className="btn btn-primary" href="/chat">Open chat</Link>
            <Link className="btn btn-quiet" href="/clients/new">Add client</Link>
            <Link className="btn btn-quiet" href="/research">Research</Link>
            <Link className="btn btn-quiet" href="/knowledge">Playbooks</Link>
          </>
        )}
      />

      {overview.connected && !overview.schemaReady && (
        <div className="alert alert-warn mb-5">
          Supabase is connected but the tables are missing. Run the migration files in order, then reload.
        </div>
      )}

      <SetupChecklist items={checklist} remaining={remaining} />

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Clients" value={overview.counts.clients} href="/clients" />
        <StatTile label="Open projects" value={overview.counts.activeProjects} href="/projects" />
        <StatTile label="Your messages this week" value={overview.counts.messagesThisWeek} />
        <StatTile label="Open questions" value={overview.counts.openQuestions} />
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h2">Needs attention</h2>
          <Link className="text-[13px] font-medium text-brand" href="/clients?stage=negotiating">
            Live deals
          </Link>
        </div>
        {overview.followUps.length === 0 ? (
          <EmptyState
            title="Nobody is waiting on you"
            body="Anyone who has gone quiet after a quote, or is due a nudge, shows up here first."
          />
        ) : (
          <ul className="card divide-y divide-line">
            {overview.followUps.map((followUp) => (
              <li key={followUp.client_id}>
                <Link
                  className="flex items-center justify-between gap-3 p-4"
                  href={followUpThreads.get(followUp.client_id)
                    ? `/threads/${followUpThreads.get(followUp.client_id)}`
                    : `/clients/${followUp.client_id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{followUp.name}</p>
                    <p className="text-[13px] text-warn">
                      {FOLLOWUP_LABELS[followUp.followup_state] ?? followUp.followup_state}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-faint">
                    {humaniseInterval(followUp.since_last_contact)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h2">Recent clients</h2>
          <Link className="text-[13px] font-medium text-brand" href="/clients">
            All clients
          </Link>
        </div>
        {overview.recentClients.length === 0 ? (
          <EmptyState
            title="No clients yet"
            body="Add a client, start a thread, and paste the last thing they said. The history is what makes everything else work."
          />
        ) : (
          <ul className="card divide-y divide-line">
            {overview.recentClients.map((client) => (
              <li key={client.id}>
                <Link className="flex items-center justify-between gap-3 p-4" href={`/clients/${client.id}`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{client.name}</p>
                    <p className="truncate text-[13px] muted">
                      {client.company ?? 'No company'}
                      {client.last_message ? ` · ${preview(client.last_message, 60)}` : ''}
                    </p>
                  </div>
                  <StageBadge
                    stage={client.stage}
                    label={STAGE_LABELS[client.stage as keyof typeof STAGE_LABELS] ?? client.stage}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="disclosure card section-block">
        <summary>
          <span>Build notes</span>
          <span className="text-[12px] font-medium text-ink-faint">Private to you</span>
        </summary>
        <div className="border-t border-line p-4">
          <ul className="space-y-2 text-[14px]">
            {BUILD_STEPS.map((step) => (
              <li key={step.label} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={
                    step.done
                      ? 'mt-[3px] h-4 w-4 shrink-0 rounded-full bg-brand text-center text-[10px] leading-4 text-white'
                      : step.current
                        ? 'mt-[3px] h-4 w-4 shrink-0 rounded-full border-2 border-gold'
                        : 'mt-[3px] h-4 w-4 shrink-0 rounded-full border border-line-strong'
                  }
                >
                  {step.done ? '\u2713' : ''}
                </span>
                <span className={step.done ? 'muted' : ''}>
                  {step.label}
                  {step.current && <span className="font-semibold text-gold"> · current</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-ink-faint">
            {overview.counts.playbooksWritten} of 9 knowledge modules written. Phase 8 adds the usage
            dashboard, data export, and the written guides.
          </p>
        </div>
      </details>
    </>
  );
}

const BUILD_STEPS: { label: string; done: boolean; current?: boolean }[] = [
  { label: 'Phase 0 · Architecture, schema, verified against Postgres', done: true },
  { label: 'Phase 1 · Private sign in, guarded routes, mobile shell', done: true },
  { label: 'Phase 2 · Client hub: threads, messages, screenshots, search', done: true },
  { label: 'Phase 3 · AI core: model switching, guardrails, telemetry', done: true },
  { label: 'Phase 4 · Memory engine: facts, summaries, semantic recall', done: true },
  { label: 'Phase 5 · Research engine: sourced answers, no guessing', done: true },
  { label: 'Phase 6 · Project delivery mode', done: true },
  { label: 'Phase 7 · The nine domain playbooks', done: true },
  { label: 'Phase 8 · Hardening, cost dashboard, documentation', done: false, current: true },
];

function todayLine(): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Lagos',
  }).format(new Date());
}
