"use client";

import type { Campaign, Milestone } from "../lib/types";
import {
  formatEth,
  milestoneStatus,
  milestoneStatusMeta,
  percent,
} from "../lib/format";
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

  return (
    <ol className="relative space-y-3">
      {milestones.map((m, i) => {
        const status = milestoneStatus(m, i, current, totalRaised);
        const meta = milestoneStatusMeta(status);
        const isActive = i === current && !campaign.completed;
        const approvalPct = percent(m.approvalWeight, totalRaised);

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
                    m.released
                      ? "bg-brand-500 text-canvas"
                      : isActive
                        ? "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40"
                        : "bg-white/5 text-gray-500"
                  }`}
                >
                  {m.released ? "✓" : i + 1}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-white">{m.description}</p>
                  <span className="font-mono text-sm font-semibold text-brand-300">
                    {formatEth(m.amount)} ETH
                  </span>
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`pill ${meta.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                </div>

                {m.evidenceSubmitted && (
                  <div className="mt-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                    <p className="mb-0.5 text-xs uppercase tracking-wide text-gray-500">Evidence</p>
                    <EvidenceLink evidence={m.evidence} />
                  </div>
                )}

                {isActive && m.evidenceSubmitted && !m.released && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                      <span>Donor approval</span>
                      <span className="font-mono">
                        {formatEth(m.approvalWeight)} / {formatEth(totalRaised)} ETH
                      </span>
                    </div>
                    <ProgressBar value={approvalPct} tone="violet" marker={50} />
                    <p className="mt-1 text-xs text-gray-500">Dashed line = 50% release threshold</p>
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
