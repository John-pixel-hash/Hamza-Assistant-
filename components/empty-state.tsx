export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-5">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-[14px] text-ink-soft">{body}</p>
    </div>
  );
}
