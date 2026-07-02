// Maps a 0-100 trust score to the reputation tiers from PRD §14.

export interface TrustTier {
  label: string;
  /** Tailwind classes for the badge. */
  badge: string;
  ring: string;
  text: string;
}

export function trustTier(score: number): TrustTier {
  if (score >= 80) {
    return {
      label: "Trusted Creator",
      badge: "bg-[var(--brand-secondary)] text-[var(--brand-primary)]",
      ring: "ring-1 ring-[var(--brand-primary)]/40",
      text: "text-[var(--brand-primary)]",
    };
  }
  if (score >= 50) {
    return {
      label: "Proven Creator",
      badge: "bg-sky-600/10 text-sky-700",
      ring: "ring-1 ring-sky-600/30",
      text: "text-sky-700",
    };
  }
  if (score >= 20) {
    return {
      label: "Early Creator",
      badge: "bg-amber-600/10 text-amber-700",
      ring: "ring-1 ring-amber-600/30",
      text: "text-amber-700",
    };
  }
  return {
    label: "New Creator",
    badge: "bg-[var(--bg-subtle)] text-[var(--text-tertiary)]",
    ring: "ring-1 ring-[var(--border-primary)]",
    text: "text-[var(--text-tertiary)]",
  };
}
