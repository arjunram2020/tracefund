"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { Campaign, Milestone } from "../lib/types";
import { formatEth, percent } from "../lib/format";
import { useCovenantWrite } from "../hooks/useCovenant";
import { ProgressBar } from "./ProgressBar";
import { TxFeedback } from "./TxFeedback";

export function CreatorReleasePanel({
  campaign,
  milestones,
  isCreator,
  onSuccess,
}: {
  campaign: Campaign;
  milestones: Milestone[];
  isCreator: boolean;
  onSuccess?: () => void;
}) {
  const { isConnected } = useAccount();
  const release = useCovenantWrite();

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
        <h3 className="mb-2 font-semibold text-white">Milestone release</h3>
        <p className="rounded-xl bg-brand-500/10 px-4 py-3 text-sm text-brand-200">
          All milestones withdrawn and proven. The escrow is empty.
        </p>
      </div>
    );
  }

  const mi = Number(campaign.currentMilestone);
  const activeMilestone = milestones[mi];
  if (!activeMilestone) return null;

  // Cumulative funding target for this milestone
  const cumulativeTarget = milestones.slice(0, mi + 1).reduce((s, m) => s + m.amount, 0n);
  const fundingMet = campaign.totalRaised >= cumulativeTarget;
  const fundingPct = percent(campaign.totalRaised, cumulativeTarget);

  // Proof gate: milestone 0 is free; later milestones need proof of the previous one
  const proofGateMet = mi === 0 || (milestones[mi - 1]?.evidenceSubmitted ?? false);

  const canRelease = isCreator && fundingMet && proofGateMet && !activeMilestone.released;

  const doRelease = async () => {
    try {
      await release.execute("releaseMilestoneFunds", [campaign.id]);
    } catch {
      /* surfaced via TxFeedback */
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-white">Milestone release</h3>
        <span className="pill bg-white/5 text-gray-400">Milestone {mi + 1}</span>
      </div>

      {/* Funding progress toward this milestone's cumulative threshold */}
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-400">Funds in escrow</span>
        <span className="font-mono text-gray-200">
          {formatEth(campaign.totalRaised)} / {formatEth(cumulativeTarget)} ETH
        </span>
      </div>
      <ProgressBar value={fundingPct} />
      <p className="mt-1.5 text-xs text-gray-500">
        {fundingMet
          ? `Funding threshold reached — ${formatEth(activeMilestone.amount)} ETH ready to withdraw.`
          : `${formatEth(cumulativeTarget - campaign.totalRaised)} ETH more needed to unlock this tranche.`}
      </p>

      {/* Proof gate status */}
      {mi > 0 && (
        <div className="mt-4 rounded-xl bg-white/[0.03] px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={
                proofGateMet
                  ? "text-brand-300"
                  : "text-amber-300"
              }
            >
              {proofGateMet ? "✓" : "○"}
            </span>
            <span className="text-gray-300">
              {proofGateMet
                ? `Proof for milestone ${mi} submitted — this tranche is unlocked.`
                : `Waiting for on-chain proof of milestone ${mi} before this tranche opens.`}
            </span>
          </div>
        </div>
      )}

      {/* Release button — creator only */}
      <div className="mt-4 border-t border-canvas-border/60 pt-4">
        {!isConnected ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button className="btn-secondary w-full" onClick={openConnectModal}>
                Connect wallet
              </button>
            )}
          </ConnectButton.Custom>
        ) : !isCreator ? (
          <p className="rounded-xl bg-white/[0.03] px-4 py-3 text-sm text-gray-400">
            Only the campaign creator can withdraw milestone funds.
          </p>
        ) : (
          <button
            className="btn-primary w-full"
            onClick={doRelease}
            disabled={!canRelease || release.isPending || release.isConfirming}
          >
            {release.isPending || release.isConfirming
              ? "Withdrawing…"
              : canRelease
                ? `Withdraw ${formatEth(activeMilestone.amount)} ETH`
                : !fundingMet
                  ? "Waiting for funding"
                  : "Waiting for previous proof"}
          </button>
        )}
        <div className="mt-2 min-h-[1.25rem]">
          <TxFeedback
            isPending={release.isPending}
            isConfirming={release.isConfirming}
            isConfirmed={release.isConfirmed}
            error={release.error}
            hash={release.hash}
            successText="Funds withdrawn — submit proof to unlock the next milestone."
          />
        </div>
        {isCreator && canRelease && (
          <p className="mt-1 text-xs text-gray-500">
            After withdrawing, post on-chain proof to unlock the next milestone.
          </p>
        )}
      </div>
    </div>
  );
}
