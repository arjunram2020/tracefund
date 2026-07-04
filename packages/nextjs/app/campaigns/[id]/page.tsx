"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import {
  useCampaign,
  useMilestones,
  useMyDonation,
  useTrustScore,
} from "../../../hooks/useCovenant";
import { campaignStatus, formatUsdc, percent } from "../../../lib/format";
import { campaignPhoto } from "../../../lib/campaignImage";
import { Address } from "../../../components/Address";
import { ReputationBadge } from "../../../components/ReputationBadge";
import { Stat } from "../../../components/Stat";
import { ProgressBar } from "../../../components/ProgressBar";
import { MilestoneTimeline } from "../../../components/MilestoneTimeline";
import { DonationPanel } from "../../../components/DonationPanel";
import { EvidencePanel } from "../../../components/EvidencePanel";
import { ReviewPanel } from "../../../components/ReviewPanel";
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
        <div className="card h-40 animate-pulse bg-[var(--surface-bg)]" />
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
      <Link href="/campaigns" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        ← All campaigns
      </Link>

      {/* Header */}
      <div className="card mt-4 overflow-hidden">
        <div className="relative h-[160px] overflow-hidden">
          <img
            src={campaignPhoto(campaign.id)}
            alt=""
            className="h-full w-full object-cover"
            style={{ filter: "brightness(0.55) saturate(0.8)" }}
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)" }}
          />
          <div className="absolute bottom-4 left-6 flex flex-wrap items-center gap-2">
            <span className={`pill ${status.pill}`}>{status.label}</span>
            {isCreator && <span className="pill bg-white/90 text-[var(--text-secondary)]">You are the creator</span>}
            <span className="ml-1 text-xs text-white/60">
              by <Address address={campaign.creator} className="text-white/80" />
            </span>
          </div>
        </div>

        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">{campaign.title}</h1>
            <ReputationBadge score={score} variant="full" />
          </div>

          <p className="mt-4 max-w-3xl text-[var(--text-secondary)]">{campaign.description}</p>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Raised" value={`${formatUsdc(campaign.totalRaised)}`} sub="USDC" accent />
            <Stat label="Goal" value={`${formatUsdc(campaign.goalAmount)}`} sub="USDC" />
            <Stat label="Released" value={`${formatUsdc(campaign.totalReleased)}`} sub="USDC" />
            <Stat label="In escrow" value={`${formatUsdc(inEscrow)}`} sub="USDC locked" />
            <Stat label="Donors" value={campaign.donorCount.toString()} />
            <Stat label="Milestone" value={currentLabel} />
          </div>

          {/* Dual progress: overall goal + current milestone tranche */}
          <div className="mt-5 space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm text-[var(--text-secondary)]">
                <span>Overall funding</span>
                <span className="font-mono">{raisedPct.toFixed(0)}%</span>
              </div>
              <ProgressBar value={raisedPct} />
            </div>
            {!campaign.completed && milestones.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm text-[var(--text-secondary)]">
                  <span>Current milestone ({mi + 1}) threshold</span>
                  <span className="font-mono">
                    {formatUsdc(
                      campaign.totalRaised > currentCumulativeTarget ? currentCumulativeTarget : campaign.totalRaised,
                    )}
                    {" / "}
                    {formatUsdc(currentCumulativeTarget)} USDC
                  </span>
                </div>
                <ProgressBar value={milestoneFundingPct} tone="violet" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">Milestones</h2>
            <MilestoneTimeline campaign={campaign} milestones={milestones} />
          </section>
          <ActivityFeed campaignId={campaign.id} />
        </div>

        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <DonationPanel campaign={campaign} />
          <ReviewPanel campaign={campaign} milestones={milestones} />
          <EvidencePanel campaign={campaign} milestones={milestones} isCreator={isCreator} />
        </div>
      </div>
    </div>
  );
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">{title}</h1>
      <p className="mt-2 text-[var(--text-secondary)]">{body}</p>
      <Link href="/campaigns" className="btn-secondary mt-6 inline-flex">
        Back to campaigns
      </Link>
    </div>
  );
}
