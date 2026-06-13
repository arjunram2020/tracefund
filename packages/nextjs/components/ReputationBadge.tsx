import { trustTier } from "../lib/trust";

/**
 * Shows a creator's 0-100 trust score and tier label (PRD §14 ReputationBadge).
 */
export function ReputationBadge({
  score,
  variant = "pill",
}: {
  score: number;
  variant?: "pill" | "full";
}) {
  const tier = trustTier(score);

  if (variant === "pill") {
    return (
      <span className={`pill ${tier.badge} ${tier.ring}`} title={`Trust score ${score}/100`}>
        <span className="font-mono font-semibold">{score}</span>
        {tier.label}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-xl bg-canvas-soft px-4 py-3 ${tier.ring}`}>
      <div className="relative flex h-12 w-12 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1f2937" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="currentColor"
            className={tier.text}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 97.4} 97.4`}
          />
        </svg>
        <span className="absolute font-mono text-sm font-bold text-white">{score}</span>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-400">Creator trust</p>
        <p className={`text-sm font-semibold ${tier.text}`}>{tier.label}</p>
      </div>
    </div>
  );
}
