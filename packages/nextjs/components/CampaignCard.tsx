"use client";

import Link from "next/link";
import type { Campaign } from "../lib/types";
import { campaignStatus, formatUsdc, percent } from "../lib/format";
import { campaignPhoto } from "../lib/campaignImage";
import { useTrustScore } from "../hooks/useCovenant";
import { ProgressBar } from "./ProgressBar";
import { ReputationBadge } from "./ReputationBadge";
import { Address } from "./Address";

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const { score } = useTrustScore(campaign.creator);
  const raisedPct = percent(campaign.totalRaised, campaign.goalAmount);
  const status = campaignStatus(campaign);
  const shown = campaign.completed
    ? campaign.milestoneCount
    : campaign.currentMilestone + 1n;

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-[var(--brand-primary)]/40 hover:shadow-[0_1px_4px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)]"
    >
      <div className="relative h-[120px] overflow-hidden">
        <img
          src={campaignPhoto(campaign.id)}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.3))" }}
        />
        <div className="absolute left-4 top-4 rounded-full bg-white/90 p-0.5 backdrop-blur-sm">
          <span className={`pill ${status.pill}`}>{status.label}</span>
        </div>
        <div className="absolute right-4 top-4 rounded-full bg-white/90 p-0.5 backdrop-blur-sm">
          <ReputationBadge score={score} variant="pill" />
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
              {formatUsdc(campaign.totalRaised)} USDC
            </span>
            <span className="text-[var(--text-tertiary)]">of {formatUsdc(campaign.goalAmount)} USDC</span>
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
