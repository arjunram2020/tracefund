type Tone = "brand" | "violet" | "sky";

const TONES: Record<Tone, string> = {
  brand: "var(--brand-primary)",
  violet: "#7c3aed",
  sky: "#0284c7",
};

/**
 * A horizontal progress bar. Optionally renders a dashed threshold marker.
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
    <div className={`relative h-[3px] w-full overflow-hidden rounded-full bg-[var(--border-primary)] ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped}%`, background: TONES[tone] }}
      />
      {marker !== undefined && (
        <div
          className="absolute top-0 h-full border-l-2 border-dashed"
          style={{ left: `${Math.max(0, Math.min(100, marker))}%`, borderColor: "var(--text-tertiary)" }}
          title={`${marker}% threshold`}
        />
      )}
    </div>
  );
}
