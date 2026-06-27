"use client";

import type { Campaign, Milestone } from "../lib/types";
import { formatEth, milestoneStatus, milestoneStatusMeta, percent } from "../lib/format";
import { ProgressBar } from "./ProgressBar";
import { EvidenceLink } from "./EvidenceLink";

export function MilestoneTimeline({
  campaign,
  milestones,
}: {
  campaign: Campaign;
  milestones: Milestone[];
}) {
  const current = Number(campaign.currentMilestone);
  const totalRaised = campaign.totalRaised;

  const cumulativeTargets = milestones.map((_, i) =>
    milestones.slice(0, i + 1).reduce((s, m) => s + m.amount, 0n),
  );

  return (
    <ol className="relative space-y-3">
      {milestones.map((m, i) => {
        const status = milestoneStatus(m, i, current, totalRaised);
        const meta = milestoneStatusMeta(status);
        const isActive = i === current && !campaign.completed;
        const cumTarget = cumulativeTargets[i] ?? 0n;

        const approvalPct =
          totalRaised > 0n ? percent(m.approvalWeight, totalRaised) : 0;

        return (
          <li
            key={i}
            className={`card relative p-4 transition ${
              isActive ? "border-brand-500/40 shadow-glow" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Step indicator */}
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  status === "released"
                    ? "bg-brand-500 text-canvas"
                    : status === "ready-to-release"
                      ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/40"
                      : isActive
                        ? "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40"
                        : "bg-white/5 text-gray-500"
                }`}
              >
                {status === "released" ? "✓" : i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-white">{m.description}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">at {formatEth(cumTarget)} ETH</span>
                    <span className="font-mono text-sm font-semibold text-brand-300">
                      +{formatEth(m.amount)} ETH
                    </span>
                  </div>
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`pill ${meta.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                </div>

                {/* Funding progress — no donations yet */}
                {isActive && status === "funding" && (
                  <p className="mt-2 text-xs text-sky-300">
                    Waiting for first donation — donors must contribute before approval is possible.
                  </p>
                )}

                {/* Approval progress — evidence submitted, waiting for votes */}
                {isActive && (status === "awaiting-approval" || status === "ready-to-release") && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                      <span>Donor approval weight</span>
                      <span className="font-mono">
                        {formatEth(m.approvalWeight)} / {formatEth(totalRaised)} ETH
                        &nbsp;({approvalPct.toFixed(0)}%)
                      </span>
                    </div>
                    <ProgressBar value={approvalPct} tone="violet" marker={50} />
                    {status === "ready-to-release" && (
                      <p className="mt-1 text-xs text-emerald-300">
                        50% threshold reached — release can be triggered from the approval panel.
                      </p>
                    )}
                  </div>
                )}

                {/* On-chain proof */}
                {m.evidenceSubmitted && (
                  <div className="mt-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                    <p className="mb-0.5 text-xs uppercase tracking-wide text-gray-500">
                      On-chain proof
                    </p>
                    <EvidenceLink evidence={m.evidence} />
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
