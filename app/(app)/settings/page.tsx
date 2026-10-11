import type { Metadata } from 'next';
import { getSystemStatus } from '@/lib/data/status';
import { serverConfigStatus } from '@/lib/env';
import { signOut } from '@/app/actions/auth';
import { ResearchKeyForm } from '@/components/research-key-form';
import { getStoredTavilyKey } from '@/lib/data/secrets';
import { todayUsage } from '@/lib/ai/telemetry';
import { DEFAULT_ROUTING } from '@/lib/ai/routing';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: { key: string; label: string; help: string }[] = [
  { key: 'supabaseUrl', label: 'Supabase URL', help: 'NEXT_PUBLIC_SUPABASE_URL' },
  { key: 'supabaseKey', label: 'Supabase public key', help: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or the older NEXT_PUBLIC_SUPABASE_ANON_KEY' },
  { key: 'secretKey', label: 'Supabase secret key', help: 'Server only. SUPABASE_SECRET_KEY, or the older SUPABASE_SERVICE_ROLE_KEY.' },
  { key: 'allowedEmail', label: 'Owner email lock', help: 'ALLOWED_EMAIL. Only this address can sign in.' },
  { key: 'googleKey', label: 'Google Gemini key', help: 'Powers replies, planning, vision and embeddings.' },
  { key: 'tavilyKey', label: 'Tavily research key', help: 'Powers live research with sources.' },
];

export default async function SettingsPage() {
  const [status, config, usage, storedTavily] = await Promise.all([
    getSystemStatus(),
    Promise.resolve(serverConfigStatus()),
    todayUsage(),
    getStoredTavilyKey(),
  ]);

  return (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-[14px] text-ink-soft">
          System status, model registry and knowledge modules.
        </p>
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-[15px] font-semibold">Configuration</h2>
        <ul className="card divide-y divide-line">
          {STATUS_LABELS.map((row) => {
            const done = Boolean(config[row.key as keyof typeof config]);
            return (
              <li key={row.key} className="flex items-start gap-3 p-4">
                <span
                  aria-hidden
                  className={
                    done
                      ? 'mt-[3px] h-4 w-4 shrink-0 rounded-full bg-accent text-center text-[10px] leading-4 text-white'
                      : 'mt-[3px] h-4 w-4 shrink-0 rounded-full border border-line'
                  }
                >
                  {done ? '✓' : ''}
                </span>
                <div>
                  <p className="text-[14px] font-medium">{row.label}</p>
                  <p className="text-[12px] text-ink-faint">{row.help}</p>
                </div>
                <span className="ml-auto shrink-0 text-[12px] text-ink-faint">
                  {done ? 'set' : 'missing'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-[15px] font-semibold">Research key</h2>
        <ResearchKeyForm
          hasStoredKey={Boolean(storedTavily)}
          hasEnvKey={Boolean(config.tavilyKey)}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-[15px] font-semibold">Today's AI use</h2>
        <div className="card p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] text-ink-soft">
              Calls today, free tier. The daily limit is per model and is not published
              with confidence, so this count is how we find the real ceiling from use.
            </p>
          </div>
          <p className="figure mt-2 text-2xl font-semibold text-gold">{usage.calls}</p>
          {usage.byModel.length > 0 && (
            <ul className="mt-2 space-y-1">
              {usage.byModel.map((row) => (
                <li key={row.modelId} className="flex justify-between text-[12px]">
                  <span className="text-ink-faint">{row.modelId}</span>
                  <span className="text-ink-soft">{row.calls}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-faint">
            {usage.guardrailHits === 0
              ? 'No draft has needed a guardrail fix today.'
              : `${usage.guardrailHits} draft${usage.guardrailHits === 1 ? '' : 's'} needed a guardrail fix today.`}
          </p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-[15px] font-semibold">Model registry</h2>
        {status.models.length === 0 ? (
          <div className="alert alert-warn">
            No models registered yet. Run <code>scripts/seed-config.sql</code> in the
            Supabase SQL editor after signing in. Phase 3 adds a script that reads each
            provider's live model list so nothing is taken from memory.
          </div>
        ) : (
          <ul className="card divide-y divide-line">
            {status.models.map((m) => (
              <li key={`${m.provider}:${m.model_id}`} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{m.label}</p>
                  <p className="truncate text-[12px] text-ink-faint">{m.model_id}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12px] text-ink-soft">{m.role ?? 'model'}</p>
                  {m.input_cost_per_mtok !== null && (
                    <p className="text-[12px] text-ink-faint">
                      ${m.input_cost_per_mtok} in / ${m.output_cost_per_mtok} out per Mtok
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[13px] text-ink-faint">
          Which model serves which job, on your free tier. Light jobs go to the lite
          model so the drafting model keeps its daily allowance.
        </p>
        <ul className="card mt-3 divide-y divide-line">
          {Object.entries(DEFAULT_ROUTING).map(([task, route]) => (
            <li key={task} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[13px] text-ink-soft">{task}</span>
              <span className="shrink-0 text-[12px] text-ink-faint">{route.modelId}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-[15px] font-semibold">Knowledge modules</h2>
        <ul className="card divide-y divide-line">
          {status.playbooks.map((p) => (
            <li key={p.slug} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium">{p.title}</p>
                <p className="truncate text-[12px] text-ink-faint">{p.slug}</p>
              </div>
              <span className="shrink-0 text-[12px] text-ink-faint">
                {p.words > 40 ? `${p.words} words` : 'not written yet'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-ink-faint">
          These are written in Phase 7, as practical operating knowledge. Until then the
          assistant relies on general capability plus live research.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-[15px] font-semibold">Routine tasks</h2>
        <ul className="card divide-y divide-line">
          <li className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-[14px] font-medium">Nightly data export</p>
              <p className="text-[12px] text-ink-faint">
                Your clients, threads, messages and facts exported to a file you keep.
              </p>
            </div>
            <span className="shrink-0 text-[12px] text-ink-faint">Phase 8</span>
          </li>
          <li className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-[14px] font-medium">Cost report</p>
              <p className="text-[12px] text-ink-faint">
                Spend per model and per task, from the telemetry table.
              </p>
            </div>
            <span className="shrink-0 text-[12px] text-ink-faint">Phase 8</span>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Session</h2>
        <div className="card p-4">
          <p className="text-[14px]">
            Signed in as <span className="font-medium">{status.email ?? 'unknown'}</span>
          </p>
          <form action={signOut} className="mt-3">
            <button className="btn btn-quiet" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
