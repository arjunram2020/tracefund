type Tone = "brand" | "violet" | "sky";

const TONES: Record<Tone, string> = {
  brand: "from-brand-500 to-brand-400",
  violet: "from-violet-500 to-violet-400",
  sky: "from-sky-500 to-sky-400",
};

/**
 * A horizontal progress bar. Optionally renders a dashed threshold marker
 * (used to visualise the 50% approval line).
 */
export function ProgressBar({
  value,
  tone = "brand",
  marker,
  className = "",
}: {
  value: number; // 0-100
  tone?: Tone;
  marker?: number; // 0-100, draws a threshold line
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`relative h-2.5 w-full overflow-hidden rounded-full bg-white/5 ${className}`}>
      <div
        className={`h-full rounded-full bg-gradient-to-r ${TONES[tone]} transition-all duration-500`}
        style={{ width: `${clamped}%` }}
      />
      {marker !== undefined && (
        <div
          className="absolute top-0 h-full border-l-2 border-dashed border-white/40"
          style={{ left: `${Math.max(0, Math.min(100, marker))}%` }}
          title={`${marker}% threshold`}
        />
      )}
    </div>
  );
}
