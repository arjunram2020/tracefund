"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { Campaign, Milestone } from "../lib/types";
import { formatEth, percent } from "../lib/format";
import { useCovenantWrite } from "../hooks/useCovenant";
import { ProgressBar } from "./ProgressBar";
import { TxFeedback } from "./TxFeedback";

export function DonorApprovalPanel({
  campaign,
  milestones,
  approvalWeight,
  totalRaised,
  thresholdReached,
  myDonation,
  hasApproved,
  onSuccess,
}: {
  campaign: Campaign;
  milestones: Milestone[];
  approvalWeight: bigint;
  totalRaised: bigint;
  thresholdReached: boolean;
  myDonation: bigint;
  hasApproved: boolean;
  onSuccess?: () => void;
}) {
  const { isConnected } = useAccount();
  const current = Number(campaign.currentMilestone);
  const activeMilestone = campaign.completed ? undefined : milestones[current];
  const approve = useCovenantWrite();
  const release = useCovenantWrite();

  useEffect(() => {
    if (approve.isConfirmed) {
      approve.refresh();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approve.isConfirmed]);

  useEffect(() => {
    if (release.isConfirmed) {
      release.refresh();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [release.isConfirmed]);

  if (campaign.completed) {
    return (
      <div className="card p-5">
        <h3 className="mb-2 font-semibold text-white">Approval &amp; release</h3>
        <p className="rounded-xl bg-brand-500/10 px-4 py-3 text-sm text-brand-200">
          Every milestone was proven and released by donor approval. The escrow is empty.
        </p>
      </div>
    );
  }

  const isDonor = myDonation > 0n;
  const approvalPct = percent(approvalWeight, totalRaised);
  const myShare = percent(myDonation, totalRaised);
  const needed = (totalRaised + 1n) / 2n; // ceil(50%)
  const remaining = needed > approvalWeight ? needed - approvalWeight : 0n;
  const evidenceReady = !!activeMilestone?.evidenceSubmitted;

  const doApprove = async () => {
    try {
      await approve.execute("approveMilestone", [campaign.id]);
    } catch {
      /* surfaced */
    }
  };
  const doRelease = async () => {
    try {
      await release.execute("releaseMilestoneFunds", [campaign.id]);
    } catch {
      /* surfaced */
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-white">Approval &amp; release</h3>
        <span className="pill bg-violet-500/10 text-violet-300">50% weighted threshold</span>
      </div>

      {/* Approval progress */}
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-400">Approved weight</span>
        <span className="font-mono text-gray-200">
          {formatEth(approvalWeight)} / {formatEth(totalRaised)} ETH
        </span>
      </div>
      <ProgressBar value={approvalPct} tone="violet" marker={50} />
      <p className="mt-1.5 text-xs text-gray-500">
        {thresholdReached
          ? "Threshold reached — the milestone can be released."
          : `${formatEth(remaining)} ETH more approval weight needed to release.`}
      </p>

      {/* Your position */}
      <div className="mt-4 rounded-xl bg-white/[0.03] px-4 py-3 text-sm">
        {isDonor ? (
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Your approval weight</span>
            <span className="font-mono text-gray-200">
              {formatEth(myDonation)} ETH · {myShare.toFixed(1)}%
            </span>
          </div>
        ) : (
          <p className="text-gray-400">
            You haven&apos;t donated to this campaign, so you have no approval weight. Donate to help
            decide releases.
          </p>
        )}
      </div>

      {/* Approve action */}
      <div className="mt-4 space-y-2">
        {!isConnected ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button className="btn-secondary w-full" onClick={openConnectModal}>
                Connect wallet
              </button>
            )}
          </ConnectButton.Custom>
        ) : hasApproved ? (
          <p className="flex items-center gap-2 rounded-xl bg-brand-500/10 px-4 py-2.5 text-sm text-brand-300">
            <span aria-hidden>✓</span> You approved this milestone.
          </p>
        ) : (
          <button
            className="btn-secondary w-full"
            onClick={doApprove}
            disabled={!isDonor || !evidenceReady || approve.isPending || approve.isConfirming}
          >
            {!evidenceReady
              ? "Waiting for evidence"
              : approve.isPending || approve.isConfirming
                ? "Approving…"
                : "Approve milestone"}
          </button>
        )}
        <TxFeedback
          isPending={approve.isPending}
          isConfirming={approve.isConfirming}
          isConfirmed={approve.isConfirmed}
          error={approve.error}
          hash={approve.hash}
          successText="Approval recorded."
        />
      </div>

      {/* Release action — available to anyone once the threshold is met */}
      <div className="mt-4 border-t border-canvas-border/60 pt-4">
        <button
          className="btn-primary w-full"
          onClick={doRelease}
          disabled={
            !isConnected ||
            !thresholdReached ||
            !evidenceReady ||
            release.isPending ||
            release.isConfirming
          }
        >
          {release.isPending || release.isConfirming
            ? "Releasing…"
            : `Release ${formatEth(activeMilestone?.amount)} ETH to creator`}
        </button>
        <div className="mt-2 min-h-[1.25rem]">
          <TxFeedback
            isPending={release.isPending}
            isConfirming={release.isConfirming}
            isConfirmed={release.isConfirmed}
            error={release.error}
            hash={release.hash}
            successText="Milestone funds released to the creator."
          />
        </div>
        {!thresholdReached && (
          <p className="text-xs text-gray-500">
            Release unlocks automatically for anyone to trigger once approvals cross 50%.
          </p>
        )}
      </div>
    </div>
  );
}
