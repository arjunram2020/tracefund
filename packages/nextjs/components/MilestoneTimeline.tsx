"use client";

import type { Campaign, Milestone } from "../lib/types";
import { formatDeadline, formatUsdc, milestoneStatus, milestoneStatusMeta } from "../lib/format";

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
        const cumTarget = cumulativeTargets[i] ?? 0n;
        const status = milestoneStatus(m, i, current, cumTarget, totalRaised);
        const meta = milestoneStatusMeta(status);
        const isActive = i === current && !campaign.completed && campaign.active;

        return (
          <li
            key={i}
            className={`card relative p-4 transition ${
              isActive
                ? "border-[var(--brand-primary)]/40 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]"
                : ""
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Step indicator */}
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  status === "approved"
                    ? "bg-[var(--brand-primary)] text-[var(--on-brand)]"
                    : isActive
                      ? "bg-[var(--brand-primary)]/20 text-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/40"
                      : "bg-[var(--bg-subtle)] text-[var(--text-tertiary)]"
                }`}
              >
                {status === "approved" ? "✓" : i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--text-primary)]">{m.criteria.title}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-tertiary)]">
                      at {formatUsdc(cumTarget)} USDC
                    </span>
                    <span className="font-mono text-sm font-semibold text-[var(--brand-primary)]">
                      +{formatUsdc(m.amount)} USDC
                    </span>
                  </div>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className={`pill ${meta.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                  {m.criteria.proofDeadline !== 0n && (
                    <span className="text-xs text-[var(--text-tertiary)]">
                      proof due {formatDeadline(m.criteria.proofDeadline)}
                    </span>
                  )}
                  {m.submissionCount > 0 && (
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {m.submissionCount} submission{m.submissionCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                {/* Acceptance criteria — always inspectable */}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Acceptance criteria
                  </summary>
                  <div className="mt-1 space-y-1 rounded-lg bg-[var(--bg-faint)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                    <p>
                      <span className="font-medium text-[var(--text-primary)]">Success: </span>
                      {m.criteria.successDefinition}
                    </p>
                    {m.criteria.requiredProof && (
                      <p>
                        <span className="font-medium text-[var(--text-primary)]">
                          Required proof:{" "}
                        </span>
                        {m.criteria.requiredProof}
                      </p>
                    )}
                    {m.criteria.expectedMetrics && (
                      <p>
                        <span className="font-medium text-[var(--text-primary)]">Metrics: </span>
                        {m.criteria.expectedMetrics}
                      </p>
                    )}
                    {m.criteria.reportingPeriod && (
                      <p>
                        <span className="font-medium text-[var(--text-primary)]">Reporting: </span>
                        {m.criteria.reportingPeriod}
                      </p>
                    )}
                  </div>
                </details>

                {isActive && status === "awaiting-proof" && (
                  <p className="mt-2 text-xs text-[var(--text-warning)]">
                    Waiting for the creator&apos;s proof package — funds release only after
                    reviewer approval.
                  </p>
                )}
                {isActive && status === "under-review" && (
                  <p className="mt-2 text-xs text-violet-700">
                    Proof submitted — reviewers are evaluating it against the criteria above.
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
