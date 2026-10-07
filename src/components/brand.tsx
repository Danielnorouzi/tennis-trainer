// Original Rally AI mark: a tennis-ball seam abstracted into a motion arc.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="rally-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-strong)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#rally-g)" />
      <path d="M14 40c8-2 14-8 16-17M50 24c-8 2-14 8-16 17" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
    </svg>
  );
}
