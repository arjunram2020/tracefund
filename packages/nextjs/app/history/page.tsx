"use client";

import Link from "next/link";
import { percent } from "../../lib/format";
import { archivedDeployments } from "../../lib/legacy";
import { useArchivedCampaigns, type ArchivedCampaign } from "../../hooks/useLegacy";
import { campaignPhoto } from "../../lib/campaignImage";
import { ProgressBar } from "../../components/ProgressBar";
import { Address } from "../../components/Address";

export default function HistoryPage() {
  const { campaigns, isLoading } = useArchivedCampaigns();
  const list = [...campaigns].reverse(); // newest era / newest campaigns first

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Campaign history</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Campaigns from previous versions of the Covenant contract. Closed to new donations —
          shown here as their permanent on-chain record.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-faint)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        <p>
          Covenant&apos;s contract has evolved (donor approval voting → auto-release → the current
          reviewer-gated USDC escrow). Each era below is a retired, read-only contract on Base —
          every donation, proof, and release is still independently verifiable on-chain.
        </p>
        <ul className="mt-2 space-y-1 text-xs text-[var(--text-tertiary)]">
          {archivedDeployments.map((a) => (
            <li key={a.key}>
              <span className="font-medium text-[var(--text-secondary)]">{a.label}</span>{" "}
              <span className="font-mono">{a.address}</span> — {a.note}
            </li>
          ))}
        </ul>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-52 animate-pulse bg-[var(--surface-bg)]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          No archived campaigns could be loaded from Base.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((entry) => (
            <LegacyCampaignCard
              key={`${entry.archive.key}-${entry.campaign.id.toString()}`}
              entry={entry}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LegacyCampaignCard({ entry }: { entry: ArchivedCampaign }) {
  const { archive, campaign } = entry;
  const raisedPct = percent(campaign.totalRaised, campaign.goalAmount);
  const shown = campaign.completed ? campaign.milestoneCount : campaign.currentMilestone + 1n;
  const amount = archive.formatAmount;

  return (
    <Link
      href={`/history/${archive.key}-${campaign.id.toString()}`}
      className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-[var(--brand-primary)]/40 hover:shadow-[0_1px_4px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)]"
    >
      <div className="relative h-[120px] overflow-hidden">
        <img
          src={campaignPhoto(campaign.id)}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          style={{ filter: "grayscale(0.35)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.3))" }}
        />
        <div className="absolute left-4 top-4 flex gap-1 rounded-full bg-white/90 p-0.5 backdrop-blur-sm">
          <span className="pill bg-[var(--bg-subtle)] text-[var(--text-secondary)] ring-1 ring-[var(--border-primary)]">
            {archive.label}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold text-[var(--text-primary)] group-hover:text-[var(--brand-primary)]">
            {campaign.title}
          </h3>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            by <Address address={campaign.creator} className="text-[var(--text-secondary)]" />
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-mono font-semibold text-[var(--text-primary)]">
              {amount(campaign.totalRaised)} {archive.symbol}
            </span>
            <span className="text-[var(--text-tertiary)]">
              of {amount(campaign.goalAmount)} {archive.symbol}
            </span>
          </div>
          <ProgressBar value={raisedPct} />
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-[var(--border-primary)] pt-3 text-xs text-[var(--text-secondary)]">
          <span>
            Milestone{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {shown.toString()}/{campaign.milestoneCount.toString()}
            </span>
          </span>
          <span>
            {campaign.donorCount.toString()} donor{campaign.donorCount === 1n ? "" : "s"}
          </span>
          <span className="font-medium text-[var(--brand-primary)] group-hover:text-[var(--brand-primary)]">
            View →
          </span>
        </div>
      </div>
    </Link>
  );
}
