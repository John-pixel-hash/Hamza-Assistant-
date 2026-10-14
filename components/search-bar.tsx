import Link from 'next/link';

/**
 * A plain GET form. Works with no JavaScript, and the query lands in the URL so
 * a search can be bookmarked or shared with yourself later.
 */
export function SearchBar({
  action,
  defaultValue = '',
  placeholder,
  hidden = {},
}: {
  action: string;
  defaultValue?: string;
  placeholder: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form action={action} method="get" className="flex min-w-0 gap-2">
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <input
        className="field min-w-0 flex-1"
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="search"
      />
      <button className="btn btn-primary min-w-[84px] shrink-0 px-4" type="submit">
        Search
      </button>
    </form>
  );
}

/** Stage filter chips. Each one is a link, so the filter is shareable too. */
export function StageFilter({
  basePath,
  stages,
  labels,
  current,
  query,
}: {
  basePath: string;
  stages: readonly string[];
  labels: Record<string, string>;
  current?: string;
  query?: string;
}) {
  const build = (stage?: string) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (stage) params.set('stage', stage);
    const suffix = params.toString();
    return suffix ? `${basePath}?${suffix}` : basePath;
  };

  const chip = (label: string, href: string, active: boolean) => (
    <Link
      key={label}
      href={href}
      className={`flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1 text-[13px] font-medium ${
        active
          ? 'border-brand bg-brand text-white'
          : 'border-line-strong bg-surface text-ink-soft'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      {chip('All', build(undefined), !current)}
      {stages.map((stage) => chip(labels[stage] ?? stage, build(stage), current === stage))}
    </div>
  );
}
