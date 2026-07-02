"use client";

import type { Campaign, Milestone } from "../lib/types";
import { formatEth, milestoneStatus, milestoneStatusMeta } from "../lib/format";
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

        return (
          <li
            key={i}
            className={`card relative p-4 transition ${
              isActive ? "border-[var(--brand-primary)]/40 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Step indicator */}
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  status === "released"
                    ? "bg-[var(--brand-primary)] text-[var(--on-brand)]"
                    : isActive
                      ? "bg-[var(--brand-primary)]/20 text-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/40"
                      : "bg-[var(--bg-subtle)] text-[var(--text-tertiary)]"
                }`}
              >
                {status === "released" ? "✓" : i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--text-primary)]">{m.description}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-tertiary)]">at {formatEth(cumTarget)} ETH</span>
                    <span className="font-mono text-sm font-semibold text-[var(--brand-primary)]">
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

                {isActive && status === "awaiting-evidence" && (
                  <p className="mt-2 text-xs text-[var(--text-warning)]">
                    Waiting for the creator to submit proof — funds release automatically on submission.
                  </p>
                )}

                {/* On-chain proof */}
                {m.evidenceSubmitted && (
                  <div className="mt-2 rounded-lg bg-[var(--bg-faint)] px-3 py-2 text-sm">
                    <p className="mb-0.5 text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
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
