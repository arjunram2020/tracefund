"use client";

import { useEffect, useState } from "react";
import type { Campaign, Milestone } from "../lib/types";
import { useTraceFundWrite } from "../hooks/useTraceFund";
import { TxFeedback } from "./TxFeedback";
import { EvidenceLink } from "./EvidenceLink";

export function EvidencePanel({
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
  const [evidence, setEvidence] = useState("");
  const { execute, refresh, isPending, isConfirming, isConfirmed, error, hash } =
    useTraceFundWrite();

  useEffect(() => {
    if (isConfirmed) {
      setEvidence("");
      refresh();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  // Evidence always targets the current active milestone. In the new contract flow,
  // the creator posts evidence first, then donors approve, then funds release.
  const current = Number(campaign.currentMilestone);
  const evidenceIndex = campaign.completed
    ? milestones.length - 1
    : Math.min(current, milestones.length - 1);

  const targetMilestone: Milestone | undefined = milestones[evidenceIndex];

  const submit = async () => {
    if (!evidence.trim()) return;
    try {
      await execute("submitEvidence", [campaign.id, evidence.trim()]);
    } catch {
      /* surfaced via TxFeedback */
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-white">
          {isCreator && targetMilestone ? "Submit proof" : "Milestone proof"}
        </h3>
        {targetMilestone && (
          <span className="pill bg-white/5 text-gray-400">Milestone {evidenceIndex + 1}</span>
        )}
      </div>

      {campaign.completed ? (
        <p className="rounded-xl bg-white/5 px-4 py-3 text-sm text-gray-400">
          All milestones completed and proven. 🎉
        </p>
      ) : targetMilestone?.evidenceSubmitted ? (
        <div className="rounded-xl bg-white/[0.03] px-4 py-3">
          <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">
            Proof for "{targetMilestone.description}"
          </p>
          <EvidenceLink evidence={targetMilestone.evidence} />
          {/* If there's a more recent released-but-unproven milestone, show a nudge */}
          {current > 0 &&
            milestones[current - 1]?.released &&
            !milestones[current - 1]?.evidenceSubmitted &&
            evidenceIndex !== current - 1 && (
              <p className="mt-2 text-xs text-amber-300">
                Milestone {current} needs proof to unlock the next tranche.
              </p>
            )}
        </div>
      ) : (
        <p className="rounded-xl bg-white/[0.03] px-4 py-3 text-sm text-gray-400">
          No proof submitted yet for &ldquo;{targetMilestone?.description}&rdquo;. Once the creator
          posts proof, funds are automatically released to them.
        </p>
      )}

      {isCreator && targetMilestone && (
        <div className="mt-4 border-t border-canvas-border/60 pt-4">
          <label className="label">
            {targetMilestone.evidenceSubmitted ? "Update proof" : "Proof"}
          </label>
          <input
            className="input"
            placeholder="Describe what was accomplished"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
          <button
            className="btn-primary mt-3 w-full"
            onClick={submit}
            disabled={!evidence.trim() || isPending || isConfirming}
          >
            {isPending || isConfirming ? "Submitting…" : "Post proof on-chain"}
          </button>
          <div className="mt-3 min-h-[1.25rem]">
            <TxFeedback
              isPending={isPending}
              isConfirming={isConfirming}
              isConfirmed={isConfirmed}
              error={error}
              hash={hash}
              successText="Proof recorded on-chain."
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Stored permanently on-chain. Submitting proof automatically releases this milestone&apos;s
            funds to you.
          </p>
        </div>
      )}
    </div>
  );
}
