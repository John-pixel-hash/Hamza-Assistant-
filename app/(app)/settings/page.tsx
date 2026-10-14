import type { Metadata } from 'next';

import { PageHeading } from '@/components/page-heading';
import { ResearchKeyForm } from '@/components/research-key-form';
import { todayUsage } from '@/lib/ai/telemetry';
import { DEFAULT_ROUTING } from '@/lib/ai/routing';
import { getStoredTavilyKey } from '@/lib/data/secrets';
import { getSystemStatus } from '@/lib/data/status';
import { serverConfigStatus } from '@/lib/env';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: { key: string; label: string; help: string }[] = [
  { key: 'supabaseUrl', label: 'Database address', help: 'NEXT_PUBLIC_SUPABASE_URL' },
  { key: 'supabaseKey', label: 'Database public key', help: 'Supabase publishable or anon key' },
  { key: 'secretKey', label: 'Database server key', help: 'Server only, never sent to the browser' },
  { key: 'allowedEmail', label: 'Owner sign-in lock', help: 'Only the allowed email can sign in' },
  { key: 'googleKey', label: 'Gemini key', help: 'Powers chat, planning, and memory' },
  { key: 'tavilyKey', label: 'Research key', help: 'Powers live search and sources' },
];

export default async function SettingsPage() {
  const [status, config, usage, storedTavily] = await Promise.all([
    getSystemStatus(),
    Promise.resolve(serverConfigStatus()),
    todayUsage(),
    getStoredTavilyKey(),
  ]);
  const configured = STATUS_LABELS.filter((row) => Boolean(config[row.key as keyof typeof config])).length;

  return (
    <>
      <PageHeading
        eyebrow="Workspace"
        title="Settings"
        description="Check service health, research access, and AI usage."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4 sm:p-5" aria-labelledby="service-health-title">
          <div className="section-heading">
            <div>
              <h2 id="service-health-title" className="h2">Service health</h2>
              <p className="mt-1 text-[13px] text-ink-faint">{configured} of {STATUS_LABELS.length} settings ready</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${configured === STATUS_LABELS.length ? 'bg-brand-soft text-brand-ink' : 'bg-warn-soft text-warn'}`}>
              {configured === STATUS_LABELS.length ? 'Ready' : 'Check setup'}
            </span>
          </div>
          <ul className="divide-y divide-line">
            {STATUS_LABELS.map((row) => {
              const done = Boolean(config[row.key as keyof typeof config]);
              return (
                <li key={row.key} className="flex min-w-0 items-start gap-3 py-3 first:pt-1 last:pb-0">
                  <span
                    aria-hidden="true"
                    className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? 'bg-brand text-white' : 'border border-line-strong text-ink-faint'}`}
                  >
                    {done ? '✓' : ''}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">{row.label}</p>
                    <p className="break-words text-[12px] text-ink-faint">{row.help}</p>
                  </div>
                  <span className={`shrink-0 pt-0.5 text-[12px] font-medium ${done ? 'text-brand-ink' : 'text-warn'}`}>
                    {done ? 'Ready' : 'Missing'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card p-4 sm:p-5" aria-labelledby="usage-title">
          <div className="section-heading">
            <div>
              <h2 id="usage-title" className="h2">AI use today</h2>
              <p className="mt-1 text-[13px] text-ink-faint">Provider calls recorded since midnight</p>
            </div>
            <p className="figure text-3xl font-bold text-ink">{usage.calls}</p>
          </div>

          {usage.byModel.length > 0 ? (
            <ul className="divide-y divide-line">
              {usage.byModel.map((row) => (
                <li key={row.modelId} className="flex min-w-0 items-center justify-between gap-3 py-3">
                  <span className="min-w-0 break-all text-[13px] text-ink-soft">{row.modelId}</span>
                  <span className="figure shrink-0 text-[13px] font-semibold">{row.calls}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-canvas p-3 text-[13px] text-ink-soft">No model calls recorded yet today.</p>
          )}

          <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-faint">
            {usage.guardrailHits === 0
              ? 'No reply drafts needed a quality repair today.'
              : `${usage.guardrailHits} reply ${usage.guardrailHits === 1 ? 'draft needed' : 'drafts needed'} a quality repair today.`}
          </p>
        </section>
      </div>

      <section className="section-block" aria-labelledby="research-key-title">
        <div className="section-heading">
          <div>
            <h2 id="research-key-title" className="h2">Live research</h2>
            <p className="mt-1 text-[13px] text-ink-faint">Your Tavily key is stored privately for your account.</p>
          </div>
        </div>
        <ResearchKeyForm
          hasStoredKey={Boolean(storedTavily)}
          hasEnvKey={Boolean(config.tavilyKey)}
        />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <details className="disclosure card">
          <summary>
            <span>Models and routing</span>
            <span className="text-[12px] font-medium text-ink-faint">{status.models.length} registered</span>
          </summary>
          <div className="border-t border-line p-4">
            {status.models.length === 0 ? (
              <div className="alert alert-warn">
                No models are registered. Run <code>scripts/seed-config.sql</code> in Supabase.
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {status.models.map((model) => (
                  <li key={`${model.provider}:${model.model_id}`} className="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="break-words text-[14px] font-semibold">{model.label}</p>
                      <p className="break-all text-[12px] text-ink-faint">{model.model_id}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[12px] text-ink-soft">{model.role ?? 'Model'}</p>
                      {model.input_cost_per_mtok !== null && (
                        <p className="mt-1 text-[11px] text-ink-faint">
                          ${model.input_cost_per_mtok} in / ${model.output_cost_per_mtok} out per Mtok
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-5 border-t border-line pt-4 text-[13px] font-semibold">Task routing</h3>
            <ul className="mt-2 divide-y divide-line">
              {Object.entries(DEFAULT_ROUTING).map(([task, route]) => (
                <li key={task} className="flex min-w-0 items-start justify-between gap-3 py-2">
                  <span className="text-[13px] text-ink-soft">{task}</span>
                  <span className="min-w-0 break-all text-right text-[12px] text-ink-faint">{route.modelId}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>

        <details className="disclosure card">
          <summary>
            <span>Knowledge modules</span>
            <span className="text-[12px] font-medium text-ink-faint">{status.playbooks.length} available</span>
          </summary>
          <div className="border-t border-line p-4">
            {status.playbooks.length === 0 ? (
              <p className="text-[13px] text-ink-soft">No modules are registered yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {status.playbooks.map((playbook) => (
                  <li key={playbook.slug} className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{playbook.title}</p>
                      <p className="truncate text-[12px] text-ink-faint">{playbook.slug}</p>
                    </div>
                    <span className="shrink-0 text-[12px] text-ink-faint">
                      {playbook.words > 40 ? `${playbook.words} words` : 'Not written'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[12px] text-ink-faint">
              Edit a playbook on the Playbooks screen. Time-sensitive guidance should be rechecked regularly.
            </p>
          </div>
        </details>
      </div>

      <details className="disclosure card section-block">
        <summary>
          <span>Planned improvements</span>
          <span className="text-[12px] font-medium text-ink-faint">Not active yet</span>
        </summary>
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
          <div>
            <p className="text-[14px] font-semibold">Data export</p>
            <p className="mt-1 text-[13px] text-ink-faint">A private backup of clients, conversations, and saved facts.</p>
          </div>
          <div>
            <p className="text-[14px] font-semibold">Usage reporting</p>
            <p className="mt-1 text-[13px] text-ink-faint">A clearer breakdown of provider use by task and model.</p>
          </div>
        </div>
      </details>
    </>
  );
}
