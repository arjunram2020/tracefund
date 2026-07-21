"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { Campaign, Milestone, ProofSubmission } from "../lib/types";
import { APPROVAL_MODEL_LABELS, ApprovalModel, MilestoneState } from "../lib/types";
import {
  useApprovalConfig,
  useCovenantWrite,
  useIsReviewer,
  useMilestoneFailed,
  useMyDonation,
  useReviews,
  useSubmissions,
} from "../hooks/useCovenant";
import { TxFeedback } from "./TxFeedback";
import { Address } from "./Address";
import { formatDeadline, timeAgo } from "../lib/format";
import {
  manifestFromDataUri,
  verifyManifest,
  type ProofManifest,
} from "../lib/proofManifest";
import { fetchManifest, fetchEncryptedManifest } from "../lib/evidenceRegistry";

/**
 * Reviewer workflow: the campaign's configured approvers evaluate the latest
 * proof package against the milestone's acceptance criteria and approve
 * (releasing funds at the threshold) or reject with required notes.
 * Also hosts the public "campaign missed its deadline" failure action.
 */
export function ReviewPanel({
  campaign,
  milestones,
}: {
  campaign: Campaign;
  milestones: Milestone[];
}) {
  const { address } = useAccount();
  const mi = Math.min(Number(campaign.currentMilestone), Math.max(milestones.length - 1, 0));
  const milestone: Milestone | undefined = milestones[mi];

  const { config } = useApprovalConfig(campaign.id);
  const { isReviewer } = useIsReviewer(campaign.id, address);
  const { donation: myDonation } = useMyDonation(campaign.id, address);
  const { submissions } = useSubmissions(campaign.id, mi);
  const { reviews } = useReviews(campaign.id, mi);
  const { failed } = useMilestoneFailed(campaign.id);
  const { execute, refresh, isPending, isConfirming, isConfirmed, error, hash } =
    useCovenantWrite();

  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);

  useEffect(() => {
    if (isConfirmed) {
      setNotes("");
      setDecision(null);
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  const latest: ProofSubmission | undefined = submissions[submissions.length - 1];
  const isCreator = !!address && address.toLowerCase() === campaign.creator.toLowerCase();
  const underReview = milestone?.state === MilestoneState.Submitted && !!latest;
  const showReviewerActions =
    isReviewer && !isCreator && underReview && campaign.active && !campaign.completed;

  // Nothing to show at all? (not a reviewer, nothing under review, no failure)
  const showPanel = showReviewerActions || underReview || failed || reviews.length > 0;
  if (!milestone || !showPanel) return null;

  const threshold = config?.threshold ?? 1;
  const isWeighted = config?.model === ApprovalModel.WeightedApproval;
  // Must mirror Covenant.sol's WeightedApproval hardening (H1/M4) so the projected
  // percentage/approver count shown here matches what the contract will actually do.
  const MIN_WEIGHTED_APPROVERS = 2;
  const MAX_VOTER_WEIGHT_BPS = 5000n; // 50%
  // The denominator is the snapshot taken at submission time, not live totalRaised.
  const snapshot = milestone?.weightSnapshot ?? 0n;
  const cappedMyDonation = snapshot > 0n && myDonation * 10000n > snapshot * MAX_VOTER_WEIGHT_BPS
    ? (snapshot * MAX_VOTER_WEIGHT_BPS) / 10000n
    : myDonation;
  const approvedPct =
    milestone && snapshot > 0n ? Number((milestone.approvedWeight * 10000n) / snapshot) / 100 : 0;
  const projectedPct =
    milestone && snapshot > 0n
      ? Number(((milestone.approvedWeight + cappedMyDonation) * 10000n) / snapshot) / 100
      : 0;
  const projectedApproverCount = (milestone?.weightedApproverCount ?? 0) + 1;
  const weightedReleasesNow =
    projectedPct >= threshold && projectedApproverCount >= MIN_WEIGHTED_APPROVERS;

  const review = async (approve: boolean) => {
    try {
      await execute("reviewProof", [campaign.id, approve, approve ? notes.trim() : notes.trim()]);
    } catch {
      /* surfaced via TxFeedback */
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-[var(--text-primary)]">Proof review</h3>
        {config && (
          <span className="pill bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
            {APPROVAL_MODEL_LABELS[config.model]}
            {config.model === ApprovalModel.DesignatedReviewers && config.threshold > 1
              ? ` · ${config.threshold}/${config.reviewers.length}`
              : isWeighted
                ? ` · ${config.threshold}% needed`
                : ""}
          </span>
        )}
      </div>

      {/* Deadline failure — anyone can trigger the refund path */}
      {failed && campaign.active && (
        <div className="mb-4 rounded-xl bg-red-600/10 p-4 text-sm text-red-700">
          <p className="font-medium">This milestone missed its deadline.</p>
          <p className="mt-1 text-xs opacity-90">
            Anyone can fail the campaign now, which permanently closes it and lets donors reclaim
            the unreleased escrow.
          </p>
          <button
            type="button"
            className="btn-secondary mt-2 w-full text-red-700"
            disabled={isPending || isConfirming}
            onClick={() => execute("failCampaign", [campaign.id]).catch(() => {})}
          >
            Fail campaign &amp; unlock donor refunds
          </button>
        </div>
      )}

      {underReview && latest && (
        <div className="space-y-3">
          <div className="rounded-xl bg-[var(--bg-faint)] px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                Submission #{submissions.length} · {timeAgo(latest.submittedAt)}
              </p>
              <span className="pill bg-violet-600/10 text-violet-700">
                {isWeighted
                  ? `${approvedPct}% / ${threshold}% · ${milestone.weightedApproverCount}/${MIN_WEIGHTED_APPROVERS} donors`
                  : `${milestone.approvalCount}/${threshold} approvals`}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--text-primary)]">{latest.summary}</p>
          </div>

          {/* What to evaluate against */}
          <div className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            <p className="font-medium text-[var(--text-primary)]">Acceptance criteria</p>
            <p className="mt-1">{milestone.criteria.successDefinition}</p>
            {milestone.criteria.requiredProof && (
              <p className="mt-1">Required proof: {milestone.criteria.requiredProof}</p>
            )}
            {milestone.criteria.expectedMetrics && (
              <p className="mt-1">Expected metrics: {milestone.criteria.expectedMetrics}</p>
            )}
            {milestone.criteria.reportingPeriod && (
              <p className="mt-1">Reporting period: {milestone.criteria.reportingPeriod}</p>
            )}
            {milestone.criteria.proofDeadline !== 0n && (
              <p className="mt-1">
                Proof deadline: {formatDeadline(milestone.criteria.proofDeadline)}
              </p>
            )}
          </div>

          <ManifestViewer submission={latest} />

          {showReviewerActions && (
            <div className="border-t border-[var(--border-primary)] pt-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDecision("approve")}
                  className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    decision === "approve"
                      ? "border-emerald-600/60 bg-emerald-600/10 text-emerald-700"
                      : "border-[var(--border-primary)] bg-[var(--bg-faint)] text-[var(--text-secondary)]"
                  }`}
                >
                  ✓ Approve
                </button>
                <button
                  type="button"
                  onClick={() => setDecision("reject")}
                  className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    decision === "reject"
                      ? "border-red-600/60 bg-red-600/10 text-red-700"
                      : "border-[var(--border-primary)] bg-[var(--bg-faint)] text-[var(--text-secondary)]"
                  }`}
                >
                  ✕ Request changes
                </button>
              </div>

              {decision && (
                <div className="mt-3">
                  <label className="label">
                    {decision === "reject"
                      ? "What's missing? (required — the creator sees this)"
                      : "Review notes (optional)"}
                  </label>
                  <textarea
                    className="input min-h-[70px] resize-y"
                    placeholder={
                      decision === "reject"
                        ? "Explain what's insufficient and what a passing revision needs to include."
                        : "e.g. Receipt matches the milestone amount — verified with the hospital."
                    }
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <button
                    className="btn-primary mt-2 w-full"
                    disabled={
                      isPending || isConfirming || (decision === "reject" && !notes.trim())
                    }
                    onClick={() => review(decision === "approve")}
                  >
                    {isPending || isConfirming
                      ? "Submitting review…"
                      : decision === "approve"
                        ? isWeighted
                          ? weightedReleasesNow
                            ? "Approve — releases this milestone's funds"
                            : `Approve (adds your weight — ${projectedPct}%/${threshold}%, ${projectedApproverCount}/${MIN_WEIGHTED_APPROVERS} donors)`
                          : milestone.approvalCount + 1 >= threshold
                            ? "Approve — releases this milestone's funds"
                            : `Approve (${milestone.approvalCount + 1}/${threshold})`
                        : "Reject & send back for revision"}
                  </button>
                  {isWeighted && decision === "approve" && (
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                      Your vote is capped at 50% of the raised-funds snapshot, and at least{" "}
                      {MIN_WEIGHTED_APPROVERS} distinct donors must approve before this milestone
                      can release — one donor can never release it alone.
                    </p>
                  )}
                </div>
              )}
              <div className="mt-2 min-h-[1.25rem]">
                <TxFeedback
                  isPending={isPending}
                  isConfirming={isConfirming}
                  isConfirmed={isConfirmed}
                  error={error}
                  hash={hash}
                  successText="Review recorded on-chain."
                />
              </div>
            </div>
          )}

          {!isReviewer && (
            <p className="text-xs text-[var(--text-tertiary)]">
              {isWeighted
                ? "Only this campaign's donors can vote on this proof — donate to gain voting weight."
                : `Only this campaign's configured approver${
                    config && config.model === ApprovalModel.DesignatedReviewers && config.reviewers.length > 1
                      ? "s"
                      : ""
                  } can approve or reject this proof.`}
            </p>
          )}
        </div>
      )}

      {/* Review history */}
      {reviews.length > 0 && (
        <div className="mt-4 border-t border-[var(--border-primary)] pt-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
            Review history — milestone {mi + 1}
          </p>
          <ol className="space-y-2">
            {[...reviews].reverse().map((r, idx) => (
              <li key={idx} className="rounded-lg bg-[var(--bg-faint)] px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={r.approved ? "text-emerald-700" : "text-red-700"}>
                    {r.approved ? "✓ approved" : "✕ changes requested"}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    by <Address address={r.reviewer} /> · submission #{r.submissionIndex + 1} ·{" "}
                    {timeAgo(r.decidedAt)}
                  </span>
                </div>
                {r.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-secondary)]">
                    {r.notes}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/**
 * Loads and integrity-checks the full proof package: from the on-chain data
 * URI when published, otherwise from the off-chain evidence registry by hash.
 */
function ManifestViewer({ submission }: { submission: ProofSubmission }) {
  const { data, isLoading } = useQuery({
    queryKey: ["proof-manifest", submission.manifestHash, submission.manifestURI],
    staleTime: Infinity,
    queryFn: async (): Promise<{ manifest: ProofManifest; source: string } | null> => {
      if (submission.manifestURI) {
        const inline = manifestFromDataUri(submission.manifestURI);
        if (inline && verifyManifest(inline, submission.manifestHash)) {
          return { manifest: inline, source: "on-chain (public)" };
        }
      }
      const fetched = await fetchManifest(submission.manifestHash);
      if (fetched) return { manifest: fetched, source: "evidence registry (off-chain)" };
      return null;
    },
  });

  // Encrypted (private) evidence: the reviewer supplies a capability link — via
  // the ?ev= URL param when they opened the creator's link, or by pasting it.
  // We decrypt it in-browser and verify against the on-chain plaintext hash.
  const [capInput, setCapInput] = useState("");
  const [capManifest, setCapManifest] = useState<ProofManifest | null>(null);
  const [capError, setCapError] = useState(false);
  const [capChecking, setCapChecking] = useState(false);

  const tryCapability = async (cap: string) => {
    if (!cap.trim()) return;
    setCapChecking(true);
    setCapError(false);
    const m = await fetchEncryptedManifest(cap, submission.manifestHash);
    setCapChecking(false);
    if (m) setCapManifest(m);
    else setCapError(true);
  };

  // Auto-attempt from the URL when no public copy was found.
  useEffect(() => {
    if (data || capManifest) return;
    const fromUrl =
      typeof window !== "undefined" ? window.location.href.match(/[?#]ev=([^&\s]+)/) : null;
    if (fromUrl) void tryCapability(decodeURIComponent(fromUrl[1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (isLoading) {
    return <p className="text-xs text-[var(--text-tertiary)]">Loading proof package…</p>;
  }

  if (!data && !capManifest) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-primary)] px-4 py-3 text-xs text-[var(--text-secondary)]">
        <p className="font-medium text-[var(--text-primary)]">🔒 Private (encrypted) proof package</p>
        <p className="mt-1">
          This package isn&apos;t public. If the creator shared a private access link with you,
          paste it here — it&apos;s decrypted in your browser and checked against the on-chain
          fingerprint. You can also ask for the package file and verify it against:
        </p>
        <p className="mt-1 break-all font-mono">{submission.manifestHash}</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            className="input flex-1 text-xs"
            placeholder="Paste the private evidence link or token"
            value={capInput}
            onChange={(e) => {
              setCapInput(e.target.value);
              setCapError(false);
            }}
          />
          <button
            type="button"
            className="btn-secondary shrink-0 text-xs"
            disabled={!capInput.trim() || capChecking}
            onClick={() => void tryCapability(capInput)}
          >
            {capChecking ? "Checking…" : "Unlock"}
          </button>
        </div>
        {capError && (
          <p className="mt-1 text-amber-700">
            Couldn&apos;t unlock with that link — check you pasted the full link, or the package may
            not have reached the registry.
          </p>
        )}
      </div>
    );
  }

  const m = (data?.manifest ?? capManifest) as ProofManifest;
  const source = data?.source ?? "encrypted link (off-chain)";
  return (
    <div className="rounded-xl border border-[var(--border-primary)] px-4 py-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
          Proof package · {source}
        </p>
        <span className="pill bg-emerald-600/10 text-xs text-emerald-700">
          ✓ integrity verified
        </span>
      </div>
      <div className="mt-2 space-y-2 text-[var(--text-secondary)]">
        <p>
          <span className="font-medium text-[var(--text-primary)]">Write-up: </span>
          <span className="whitespace-pre-wrap">{m.narrative}</span>
        </p>
        <p>
          <span className="font-medium text-[var(--text-primary)]">Why this proves it: </span>
          <span className="whitespace-pre-wrap">{m.justification}</span>
        </p>
        {m.metricsSummary && (
          <p>
            <span className="font-medium text-[var(--text-primary)]">Metrics: </span>
            {m.metricsSummary}
          </p>
        )}
        {m.reportingNotes && (
          <p>
            <span className="font-medium text-[var(--text-primary)]">Reporting: </span>
            {m.reportingNotes}
          </p>
        )}
        <div>
          <p className="font-medium text-[var(--text-primary)]">Evidence:</p>
          <ul className="mt-1 space-y-1">
            {m.links.map((l, i) => (
              <li key={i}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-[var(--brand-primary)] underline decoration-[var(--brand-primary)]/40 underline-offset-2"
                >
                  {l.label ? `${l.label} — ${l.url}` : l.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
