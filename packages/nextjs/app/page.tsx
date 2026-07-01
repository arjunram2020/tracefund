import Link from "next/link";

const STEPS = [
  {
    n: "01",
    title: "Donate into escrow",
    body: "Your ETH goes into the Covenant smart contract — not the creator's wallet. It stays locked.",
  },
  {
    n: "02",
    title: "Creator submits evidence",
    body: "To unlock a milestone, the creator posts public proof on-chain: a receipt, a link, an IPFS file.",
  },
  {
    n: "03",
    title: "Proof unlocks the funds",
    body: "Once donations cover the milestone and proof is posted, the contract releases exactly that milestone's amount — automatically, permanently on the record.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="animate-fade-in py-16 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="pill border border-brand-500/30 bg-brand-500/10 text-brand-300">
            Smart-contract escrow · Base &amp; Ethereum
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Crowdfunding with{" "}
            <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">
              enforced accountability
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-400">
            Donations stay locked in escrow until campaign creators post public milestone evidence
            on-chain. The money follows the proof.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/campaigns" className="btn-primary px-6 py-3 text-base">
              View Campaigns
            </Link>
            <Link href="/create" className="btn-secondary px-6 py-3 text-base">
              Create Campaign
            </Link>
          </div>
        </div>
      </section>

      {/* Three steps */}
      <section className="grid gap-4 pb-8 md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="card p-6">
            <div className="mb-3 font-mono text-sm text-brand-400">{s.n}</div>
            <h3 className="text-lg font-semibold text-white">{s.title}</h3>
            <p className="mt-2 text-sm text-gray-400">{s.body}</p>
          </div>
        ))}
      </section>

      {/* Contrast */}
      <section className="grid gap-4 py-12 md:grid-cols-2">
        <div className="card border-red-500/20 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-red-300/90">
            The old model
          </h3>
          <p className="mt-3 text-2xl font-semibold text-white">
            Donate money and hope it&apos;s used correctly.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-gray-400">
            <li>• Money goes straight to the creator.</li>
            <li>• Updates are optional and don&apos;t control the money.</li>
            <li>• Records live in a company database that can be edited.</li>
          </ul>
        </div>
        <div className="card border-brand-500/30 p-6 shadow-glow">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-brand-300">
            The Covenant model
          </h3>
          <p className="mt-3 text-2xl font-semibold text-white">
            Donate into escrow. Proof unlocks it.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-gray-400">
            <li>• Funds are held by a smart contract, released milestone by milestone.</li>
            <li>• On-chain evidence is enforced before any release.</li>
            <li>• Every donation, proof and release is public and tamper-resistant.</li>
          </ul>
        </div>
      </section>

      {/* What's recorded on-chain */}
      <section className="card my-12 p-8">
        <h2 className="text-xl font-semibold text-white">What lives on-chain</h2>
        <p className="mt-1 text-sm text-gray-400">
          Covenant uses Ethereum only for the parts that shouldn&apos;t depend on trust.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            "Donation records",
            "Escrow balances",
            "Milestone definitions",
            "Evidence submissions",
            "Campaign completions",
            "Fund releases",
            "Creator reputation",
            "Full activity trail",
          ].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-canvas-border/60 bg-canvas-soft/40 px-3 py-2.5 text-sm text-gray-300"
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
