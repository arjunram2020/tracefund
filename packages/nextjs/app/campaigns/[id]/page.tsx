"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import {
  useApprovalProgress,
  useCampaign,
  useHasApproved,
  useMilestones,
  useMyDonation,
  useTrustScore,
} from "../../../hooks/useTraceFund";
import { campaignStatus, formatEth, percent } from "../../../lib/format";
import { Address } from "../../../components/Address";
import { ReputationBadge } from "../../../components/ReputationBadge";
import { Stat } from "../../../components/Stat";
import { ProgressBar } from "../../../components/ProgressBar";
import { MilestoneTimeline } from "../../../components/MilestoneTimeline";
import { DonationPanel } from "../../../components/DonationPanel";
import { DonorApprovalPanel } from "../../../components/DonorApprovalPanel";
import { EvidencePanel } from "../../../components/EvidencePanel";
import { ActivityFeed } from "../../../components/ActivityFeed";

export default function CampaignDetailPage() {
  const params = useParams();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;
  let id: bigint | undefined;
  try {
    id = raw !== undefined ? BigInt(raw) : undefined;
  } catch {
    id = undefined;
  }

  const { address } = useAccount();
  const { campaign, isLoading, isError } = useCampaign(id);
  const { milestones } = useMilestones(id);
  const { donation } = useMyDonation(id, address);
  const { score } = useTrustScore(campaign?.creator);
  const { approvalWeight, totalRaised: approvalTotalRaised, thresholdReached } = useApprovalProgress(id);
  const { hasApproved } = useHasApproved(id, campaign?.currentMilestone, address);

  if (id === undefined) {
    return <CenteredMessage title="Invalid campaign" body="That campaign id is not valid." />;
  }
  if (isError) {
    return (
      <CenteredMessage
        title="Campaign not found"
        body="No campaign exists with that id on the connected network."
      />
    );
  }
  if (isLoading || !campaign) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="card h-40 animate-pulse bg-canvas-card/40" />
      </div>
    );
  }

  const status = campaignStatus(campaign);
  const raisedPct = percent(campaign.totalRaised, campaign.goalAmount);
  const inEscrow = campaign.totalRaised - campaign.totalReleased;
  const isCreator =
    !!address && address.toLowerCase() === campaign.creator.toLowerCase();
  const currentLabel = campaign.completed
    ? `${campaign.milestoneCount}/${campaign.milestoneCount}`
    : `${campaign.currentMilestone + 1n}/${campaign.milestoneCount}`;

  // Cumulative target for the current milestone (to show milestone-level funding progress)
  const mi = Number(campaign.currentMilestone);
  const currentCumulativeTarget = milestones
    .slice(0, mi + 1)
    .reduce((s, m) => s + m.amount, 0n);
  const milestoneFundingPct = percent(
    campaign.totalRaised > currentCumulativeTarget ? currentCumulativeTarget : campaign.totalRaised,
    currentCumulativeTarget || campaign.goalAmount,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/campaigns" className="text-sm text-gray-400 hover:text-white">
        ← All campaigns
      </Link>

      {/* Header */}
      <div className="card mt-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`pill ${status.pill}`}>{status.label}</span>
              {isCreator && (
                <span className="pill bg-white/5 text-gray-300">You are the creator</span>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{campaign.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              by <Address address={campaign.creator} className="text-gray-300" />
            </p>
          </div>
          <ReputationBadge score={score} variant="full" />
        </div>

        <p className="mt-4 max-w-3xl text-gray-300">{campaign.description}</p>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Raised" value={`${formatEth(campaign.totalRaised)}`} sub="ETH" accent />
          <Stat label="Goal" value={`${formatEth(campaign.goalAmount)}`} sub="ETH" />
          <Stat label="Released" value={`${formatEth(campaign.totalReleased)}`} sub="ETH" />
          <Stat label="In escrow" value={`${formatEth(inEscrow)}`} sub="ETH locked" />
          <Stat label="Donors" value={campaign.donorCount.toString()} />
          <Stat label="Milestone" value={currentLabel} />
        </div>

        {/* Dual progress: overall goal + current milestone tranche */}
        <div className="mt-5 space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm text-gray-400">
              <span>Overall funding</span>
              <span className="font-mono">{raisedPct.toFixed(0)}%</span>
            </div>
            <ProgressBar value={raisedPct} />
          </div>
          {!campaign.completed && milestones.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm text-gray-400">
                <span>Current milestone ({mi + 1}) threshold</span>
                <span className="font-mono">
                  {formatEth(campaign.totalRaised > currentCumulativeTarget ? currentCumulativeTarget : campaign.totalRaised)}
                  {" / "}
                  {formatEth(currentCumulativeTarget)} ETH
                </span>
              </div>
              <ProgressBar value={milestoneFundingPct} tone="violet" />
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">Milestones</h2>
            <MilestoneTimeline campaign={campaign} milestones={milestones} />
          </section>
          <ActivityFeed campaignId={campaign.id} />
        </div>

        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <DonationPanel campaign={campaign} milestones={milestones} />
          <EvidencePanel campaign={campaign} milestones={milestones} isCreator={isCreator} />
          <DonorApprovalPanel
            campaign={campaign}
            milestones={milestones}
            approvalWeight={approvalWeight}
            totalRaised={approvalTotalRaised}
            thresholdReached={thresholdReached}
            myDonation={donation}
            hasApproved={hasApproved}
          />
        </div>
      </div>
    </div>
  );
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="mt-2 text-gray-400">{body}</p>
      <Link href="/campaigns" className="btn-secondary mt-6 inline-flex">
        Back to campaigns
      </Link>
    </div>
  );
}
