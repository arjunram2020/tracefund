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
      badge: "bg-brand-500/15 text-brand-300",
      ring: "ring-1 ring-brand-500/40",
      text: "text-brand-300",
    };
  }
  if (score >= 50) {
    return {
      label: "Proven Creator",
      badge: "bg-sky-500/15 text-sky-300",
      ring: "ring-1 ring-sky-500/40",
      text: "text-sky-300",
    };
  }
  if (score >= 20) {
    return {
      label: "Early Creator",
      badge: "bg-amber-500/15 text-amber-300",
      ring: "ring-1 ring-amber-500/40",
      text: "text-amber-300",
    };
  }
  return {
    label: "New Creator",
    badge: "bg-zinc-500/15 text-zinc-300",
    ring: "ring-1 ring-zinc-500/30",
    text: "text-zinc-300",
  };
}
