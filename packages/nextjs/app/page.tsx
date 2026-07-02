import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ChevronRight, TrendingUp, Upload, Wallet } from "lucide-react";
import { BlockchainBg } from "../components/BlockchainBg";

const AVATARS = [
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=72&h=72&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=72&h=72&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=72&h=72&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=72&h=72&fit=crop&auto=format",
];

const STEPS = [
  {
    n: "01",
    Icon: Wallet,
    title: "Donate into escrow",
    body: "Your USDC enters the Covenant contract — not the creator's wallet. Stays locked until milestones are proven.",
  },
  {
    n: "02",
    Icon: Upload,
    title: "Creator submits evidence",
    body: "To unlock a milestone, the creator posts proof on-chain: a receipt, a link, or an IPFS hash.",
  },
  {
    n: "03",
    Icon: CheckCircle2,
    title: "Proof unlocks the funds",
    body: "Once donations cover the milestone and proof is posted, the contract releases exactly that milestone's amount — automatically, permanently on the record.",
  },
  {
    n: "04",
    Icon: TrendingUp,
    title: "Repeat per milestone",
    body: "The rest stays locked. Every milestone follows the same cycle: proof → release.",
  },
];

const ON_CHAIN = [
  "Donation records",
  "Escrow balances",
  "Milestone definitions",
  "Evidence submissions",
  "Fund releases",
  "Creator reputation",
  "Full activity trail",
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section
        className="relative flex flex-col items-center overflow-hidden px-4 text-center"
        style={{
          paddingTop: 96,
          paddingBottom: 80,
          background:
            "radial-gradient(ellipse 70% 50% at 75% 90%, rgba(8,145,178,0.05) 0%, transparent 65%), radial-gradient(ellipse 80% 60% at 50% -10%, rgba(28,68,51,0.08) 0%, transparent 70%), var(--brand-tertiary)",
        }}
      >
        {/* Floating donor avatars — decorative, above the network bg */}
        <div className="absolute hidden items-center gap-2 lg:flex" style={{ top: 120, left: "12%", zIndex: 2 }}>
          <img src={AVATARS[0]} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-white shadow-md" />
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full shadow-sm"
            style={{ background: "var(--brand-primary)" }}
          >
            <ArrowUpRight size={12} color="white" />
          </div>
        </div>
        <div className="absolute hidden items-center gap-2 lg:flex" style={{ top: 110, right: "12%", zIndex: 2 }}>
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full shadow-sm"
            style={{ background: "var(--brand-primary)" }}
          >
            <ChevronRight size={12} color="white" />
          </div>
          <img src={AVATARS[1]} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-white shadow-md" />
        </div>
        <div className="absolute hidden items-center gap-2 lg:flex" style={{ top: 260, left: "8%", zIndex: 2 }}>
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full shadow-sm"
            style={{ background: "var(--brand-primary)" }}
          >
            <ArrowUpRight size={12} color="white" />
          </div>
        </div>
        <div className="absolute hidden items-center gap-2 lg:flex" style={{ top: 240, right: "9%", zIndex: 2 }}>
          <img src={AVATARS[2]} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-white shadow-md" />
        </div>
        <div className="absolute hidden items-center gap-2 lg:flex" style={{ top: 190, right: "5%", zIndex: 2 }}>
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: "var(--brand-primary)" }}
          >
            <ChevronRight size={10} color="white" />
          </div>
          <img src={AVATARS[3]} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-white shadow-md" />
        </div>

        {/* Blockchain network — layered above this section's own gradient */}
        <BlockchainBg />

        <div
          className="mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium"
          style={{
            background: "rgba(28,68,51,0.07)",
            borderColor: "rgba(28,68,51,0.15)",
            color: "var(--brand-primary)",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--brand-primary)" }} />
          Milestone-based · On-chain escrow · Base &amp; Ethereum
        </div>

        <h1
          className="mx-auto max-w-3xl text-[clamp(40px,6vw,68px)] font-extrabold"
          style={{ letterSpacing: "-0.03em", lineHeight: 1.08, color: "var(--text-primary)", marginBottom: 20 }}
        >
          Crowdfunding with <span style={{ color: "var(--brand-primary)" }}>enforced</span>
          <br />
          accountability.
        </h1>

        <p
          className="mx-auto max-w-lg text-base"
          style={{ color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: 36 }}
        >
          Donations stay locked in smart contract escrow until campaign creators submit milestone
          evidence, which releases funds automatically. Every action on-chain.
        </p>

        <div className="mb-16 flex flex-wrap items-center justify-center gap-3">
          <Link href="/campaigns" className="btn-primary px-6 py-3 text-sm">
            View Campaigns →
          </Link>
          <Link href="/create" className="btn-secondary px-6 py-3 text-sm">
            Create Campaign
          </Link>
        </div>

        <div className="w-full max-w-5xl border-t pt-8" style={{ borderColor: "var(--border-primary)" }}>
          <p className="mb-4 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
            Trust the proof, not the pitch
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {[
              { label: "Base", icon: "⬡" },
              { label: "Ethereum", icon: "◆" },
              { label: "IPFS", icon: "◉" },
              { label: "Alchemy", icon: "✦" },
            ].map((p) => (
              <div
                key={p.label}
                className="flex items-center gap-1.5 text-sm font-semibold"
                style={{ color: "var(--text-tertiary)" }}
              >
                <span>{p.icon}</span>
                {p.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: "var(--surface-bg)", padding: "80px 24px" }}>
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <p
              className="mb-3 text-xs font-medium uppercase"
              style={{ color: "var(--brand-primary)", letterSpacing: "0.16em" }}
            >
              How it works
            </p>
            <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
              Four steps. Fully on-chain.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="card flex flex-col gap-3 p-6">
                <span className="font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {s.n}
                </span>
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: "var(--brand-secondary)" }}
                >
                  <s.Icon size={16} style={{ color: "var(--brand-primary)" }} />
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {s.title}
                  </p>
                  <p className="text-sm" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Old vs Covenant */}
      <section style={{ padding: "80px 24px", background: "var(--brand-tertiary)" }}>
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          <div className="card flex flex-col gap-3 p-8">
            <p
              className="font-mono text-xs uppercase"
              style={{ color: "var(--text-tertiary)", letterSpacing: "0.16em" }}
            >
              The old model
            </p>
            <div>
              <p className="mb-1 font-bold" style={{ color: "var(--text-primary)" }}>
                Donate money and hope it&apos;s used correctly.
              </p>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                No enforcement. No visibility. No recourse.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {[
                "Money goes straight to the creator",
                "Updates are optional and unverified",
                "Records live in a database that can be edited",
              ].map((i) => (
                <li key={i} className="flex gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--danger)" }}>✕</span>
                  {i}
                </li>
              ))}
            </ul>
          </div>
          <div
            className="flex flex-col gap-3 rounded-2xl p-8"
            style={{ background: "var(--brand-primary)", boxShadow: "0 4px 24px rgba(28,68,51,0.25)" }}
          >
            <p
              className="font-mono text-xs uppercase"
              style={{ color: "rgba(255,255,255,0.5)", letterSpacing: "0.16em" }}
            >
              The Covenant model
            </p>
            <div>
              <p className="mb-1 font-bold text-white">Donate into escrow. Proof unlocks it.</p>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
                Enforced on-chain. No middleman.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {[
                "Funds held by a smart contract, released milestone by milestone",
                "Evidence is enforced before any release",
                "Every action is permanent, public, and tamper-resistant",
              ].map((i) => (
                <li key={i} className="flex gap-3 text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>✓</span>
                  {i}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* What lives on-chain */}
      <section style={{ background: "var(--surface-bg)", padding: "80px 24px" }}>
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="mb-3 text-3xl font-bold" style={{ letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            What lives on-chain
          </h2>
          <p className="mx-auto mb-10 max-w-sm text-base" style={{ color: "var(--text-secondary)" }}>
            Covenant uses Ethereum for the parts that shouldn&apos;t depend on trust.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ON_CHAIN.map((item) => (
              <div
                key={item}
                className="card px-4 py-6 text-sm transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
