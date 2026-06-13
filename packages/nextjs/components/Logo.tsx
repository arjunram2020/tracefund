// A small "proof-locked" mark: a shield holding a checkmark.
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="tf-g" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5l11 4v8.2c0 7-4.7 12.2-11 14.8-6.3-2.6-11-7.8-11-14.8V6.5l11-4z"
        fill="url(#tf-g)"
        opacity="0.18"
      />
      <path
        d="M16 2.5l11 4v8.2c0 7-4.7 12.2-11 14.8-6.3-2.6-11-7.8-11-14.8V6.5l11-4z"
        stroke="url(#tf-g)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M11 16.2l3.4 3.4L21.5 12"
        stroke="#6ee7b7"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
