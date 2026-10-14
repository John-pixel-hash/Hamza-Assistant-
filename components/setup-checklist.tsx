export type ChecklistItem = { label: string; done: boolean };

/**
 * Shows only while something is still missing. Disappears on its own once the
 * system is fully configured, so it never becomes permanent clutter.
 */
export function SetupChecklist({
  items,
  remaining,
}: {
  items: ChecklistItem[];
  remaining: number;
}) {
  if (remaining === 0) return null;

  return (
    <section className="card mb-6 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Finish setup</h2>
        <span className="text-[12px] text-ink-faint">{remaining} left</span>
      </div>
      <ul className="space-y-2 text-[14px]">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-3">
            <span
              aria-hidden
              className={
                item.done
                  ? 'mt-[3px] h-4 w-4 shrink-0 rounded-full bg-brand text-center text-[10px] leading-4 text-white'
                  : 'mt-[3px] h-4 w-4 shrink-0 rounded-full border border-line'
              }
            >
              {item.done ? '✓' : ''}
            </span>
            <span className={item.done ? 'text-ink-soft' : ''}>{item.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] text-ink-faint">
        Steps are in <code>docs/04-SETUP.md</code>. Only the first three are needed to use
        the system. The rest unlock AI replies and research.
      </p>
    </section>
  );
}
