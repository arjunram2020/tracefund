import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-canvas-border/70 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-gray-500 sm:flex-row sm:px-6">
        <p>
          Covenant · Donations follow the proof. Built on Ethereum &amp; Base.
        </p>
        <div className="flex items-center gap-4">
          <Link href="/campaigns" className="hover:text-gray-300">
            Campaigns
          </Link>
          <Link href="/create" className="hover:text-gray-300">
            Create
          </Link>
          <span className="text-gray-600">Demo · use tiny ETH amounts</span>
        </div>
      </div>
    </footer>
  );
}
