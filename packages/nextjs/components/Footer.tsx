import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border-primary)] py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-[var(--text-tertiary)] sm:flex-row sm:px-6">
        <p>
          Covenant · Donations follow the proof. Built on Ethereum &amp; Base.
        </p>
        <div className="flex items-center gap-4">
          <Link href="/campaigns" className="hover:text-[var(--text-secondary)]">
            Campaigns
          </Link>
          <Link href="/create" className="hover:text-[var(--text-secondary)]">
            Create
          </Link>
          <span className="text-[var(--text-tertiary)]">Demo · use tiny USDC amounts</span>
        </div>
      </div>
    </footer>
  );
}
