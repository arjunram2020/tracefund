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

  // Cumulative target up to each milestone index
  const cumulativeTargets = milestones.map((_, i) =>
    milestones.slice(0, i + 1).reduce((s, m) => s + m.amount, 0n),
  );

  return (
    <ol className="relative space-y-3">
      {milestones.map((m, i) => {
        const status = milestoneStatus(m, i, current, totalRaised, milestones);
        const meta = milestoneStatusMeta(status);
        const isActive = i === current && !campaign.completed;
        const cumTarget = cumulativeTargets[i] ?? 0n;
        const fundingPct = percent(totalRaised > cumTarget ? cumTarget : totalRaised, cumTarget);

        return (
          <li
            key={i}
            className={`card relative p-4 transition ${
              isActive ? "border-brand-500/40 shadow-glow" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    status === "proven"
                      ? "bg-brand-500 text-canvas"
                      : status === "withdrawn"
                        ? "bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/40"
                        : isActive
                          ? "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40"
                          : "bg-white/5 text-gray-500"
                  }`}
                >
                  {status === "proven" ? "✓" : i + 1}
                </span>
              </div>

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

                {/* Funding progress for the active milestone */}
                {isActive && status === "funding" && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                      <span>Funding progress</span>
                      <span className="font-mono">
                        {formatEth(totalRaised)} / {formatEth(cumTarget)} ETH
                      </span>
                    </div>
                    <ProgressBar value={fundingPct} />
                  </div>
                )}

                {/* Evidence display */}
                {m.evidenceSubmitted && (
                  <div className="mt-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                    <p className="mb-0.5 text-xs uppercase tracking-wide text-gray-500">
                      On-chain proof
                    </p>
                    <EvidenceLink evidence={m.evidence} />
                  </div>
                )}

                {/* Nudge: withdrawn but needs proof */}
                {status === "withdrawn" && (
                  <p className="mt-2 text-xs text-amber-300">
                    Withdrawn — creator must post proof to unlock the next milestone.
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
