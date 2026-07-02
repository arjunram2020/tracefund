import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--surface-secondary-bg)] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`stat-value mt-0.5 ${accent ? "text-[var(--brand-primary)]" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  );
}
