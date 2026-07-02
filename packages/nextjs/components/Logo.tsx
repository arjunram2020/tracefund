// A small "proof-locked" mark: a shield holding a checkmark, rendered white
// so it sits inside a solid brand-primary circle (see Header/Footer).
export function Logo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path
        d="M16 2.5l11 4v8.2c0 7-4.7 12.2-11 14.8-6.3-2.6-11-7.8-11-14.8V6.5l11-4z"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M11 16.2l3.4 3.4L21.5 12"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
