"use client";

import Link from "next/link";
import type { Campaign } from "../../lib/types";
import { percent } from "../../lib/format";
import { formatLegacyEth, legacyAddress } from "../../lib/legacy";
import { useLegacyCampaigns } from "../../hooks/useLegacy";
import { campaignPhoto } from "../../lib/campaignImage";
import { ProgressBar } from "../../components/ProgressBar";
import { Address } from "../../components/Address";

export default function HistoryPage() {
  const { campaigns, isLoading, isError } = useLegacyCampaigns();
  const list = [...campaigns].reverse(); // newest first

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Campaign history</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Campaigns from a previous version of the Covenant contract. Closed to new donations —
          shown here as their permanent on-chain record.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-faint)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        These campaigns ran in ETH on a retired contract (
        <span className="font-mono text-xs">{legacyAddress}</span> on Base). The upgraded
        contract settles in USDC, so they are read-only — but every donation, proof, and release
        below is still independently verifiable on-chain.
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-52 animate-pulse bg-[var(--surface-bg)]" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Could not load the archived campaigns from Base.
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">No archived campaigns.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <LegacyCampaignCard key={c.id.toString()} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function LegacyCampaignCard({ campaign }: { campaign: Campaign }) {
  const raisedPct = percent(campaign.totalRaised, campaign.goalAmount);
  const shown = campaign.completed ? campaign.milestoneCount : campaign.currentMilestone + 1n;

  return (
    <Link
      href={`/history/${campaign.id}`}
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
        <div className="absolute left-4 top-4 rounded-full bg-white/90 p-0.5 backdrop-blur-sm">
          <span className="pill bg-[var(--bg-subtle)] text-[var(--text-secondary)] ring-1 ring-[var(--border-primary)]">
            Archived
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
              {formatLegacyEth(campaign.totalRaised)} ETH
            </span>
            <span className="text-[var(--text-tertiary)]">
              of {formatLegacyEth(campaign.goalAmount)} ETH
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
