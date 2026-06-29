"use client";

import Link from "next/link";
import type { Campaign } from "../lib/types";
import { campaignStatus, formatEth, percent } from "../lib/format";
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
      className="card group flex flex-col gap-4 p-5 transition hover:border-brand-500/40 hover:shadow-glow"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`pill ${status.pill}`}>{status.label}</span>
        <ReputationBadge score={score} variant="pill" />
      </div>

      <div>
        <h3 className="line-clamp-1 text-lg font-semibold text-white group-hover:text-brand-300">
          {campaign.title}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          by <Address address={campaign.creator} className="text-gray-400" />
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-mono font-semibold text-white">
            {formatEth(campaign.totalRaised)} ETH
          </span>
          <span className="text-gray-500">of {formatEth(campaign.goalAmount)} ETH</span>
        </div>
        <ProgressBar value={raisedPct} />
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-canvas-border/60 pt-3 text-xs text-gray-400">
        <span>
          Milestone{" "}
          <span className="font-semibold text-gray-200">
            {shown.toString()}/{campaign.milestoneCount.toString()}
          </span>
        </span>
        <span>
          {campaign.donorCount.toString()} donor{campaign.donorCount === 1n ? "" : "s"}
        </span>
        <span className="font-medium text-brand-400 group-hover:text-brand-300">View →</span>
      </div>
    </Link>
  );
}
