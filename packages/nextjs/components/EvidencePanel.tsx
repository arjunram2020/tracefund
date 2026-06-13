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
  const current = Number(campaign.currentMilestone);
  const activeMilestone = campaign.completed ? undefined : milestones[current];
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
          {isCreator && activeMilestone ? "Submit evidence" : "Milestone evidence"}
        </h3>
        {!campaign.completed && (
          <span className="pill bg-white/5 text-gray-400">Milestone {current + 1}</span>
        )}
      </div>

      {campaign.completed ? (
        <p className="rounded-xl bg-white/5 px-4 py-3 text-sm text-gray-400">
          All milestones have been proven and released. 🎉
        </p>
      ) : activeMilestone?.evidenceSubmitted ? (
        <div className="rounded-xl bg-white/[0.03] px-4 py-3">
          <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">
            Submitted for “{activeMilestone.description}”
          </p>
          <EvidenceLink evidence={activeMilestone.evidence} />
        </div>
      ) : (
        <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          No evidence submitted yet for “{activeMilestone?.description}”. Funds stay locked until the
          creator posts proof.
        </p>
      )}

      {isCreator && activeMilestone && (
        <div className="mt-4 border-t border-canvas-border/60 pt-4">
          <label className="label">
            {activeMilestone.evidenceSubmitted ? "Update evidence" : "Evidence"} — URL, IPFS CID, or
            text
          </label>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="ipfs://… or https://… or a short description of the proof"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
          <button
            className="btn-primary mt-3 w-full"
            onClick={submit}
            disabled={!evidence.trim() || isPending || isConfirming}
          >
            {isPending || isConfirming ? "Submitting…" : "Submit evidence on-chain"}
          </button>
          <div className="mt-3 min-h-[1.25rem]">
            <TxFeedback
              isPending={isPending}
              isConfirming={isConfirming}
              isConfirmed={isConfirmed}
              error={error}
              hash={hash}
              successText="Evidence recorded on-chain."
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Submitting evidence creates a public record but does not release any money.
          </p>
        </div>
      )}
    </div>
  );
}
