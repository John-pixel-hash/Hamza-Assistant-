/**
 * The brand mark. A blue tile with a white H and a single gold stroke.
 * Drawn in SVG so it stays sharp at any size and needs no image request.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Hamza Assistant"
      className="shrink-0"
    >
      <rect width="32" height="32" rx="9" fill="#1d4ed8" />
      <path d="M10 8v16M22 8v16M10 16h12" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8 28h16" stroke="#c08a2e" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BrandWordmark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold tracking-tight text-ink">
          Hamza Assistant
        </p>
        {subtitle && <p className="truncate text-[12px] text-ink-faint">{subtitle}</p>}
      </div>
    </div>
  );
}
