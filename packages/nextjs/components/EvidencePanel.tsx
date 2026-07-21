"use client";

import { useEffect, useState } from "react";
import type { Campaign, Milestone } from "../lib/types";
import { ApprovalModel, MilestoneState } from "../lib/types";
import {
  useApprovalConfig,
  useCovenantWrite,
  useReadChain,
  useReviews,
  useSubmissions,
} from "../hooks/useCovenant";
import { TxFeedback } from "./TxFeedback";
import { formatDeadline } from "../lib/format";
import {
  hashManifest,
  manifestToDataUri,
  canonicalManifestJson,
  type ProofManifest,
} from "../lib/proofManifest";
import { storeManifest, storeEncryptedManifest } from "../lib/evidenceRegistry";

type SocialPlatform = "linkedin" | "farcaster";

const SOCIAL: Record<
  SocialPlatform,
  { name: string; composeUrl: (text: string) => string }
> = {
  linkedin: {
    name: "LinkedIn",
    composeUrl: (text) =>
      `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`,
  },
  farcaster: {
    name: "Farcaster",
    composeUrl: (text) => `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`,
  },
};

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Proof-package submission panel (creator side).
 *
 * Submitting proof does NOT release funds — reviewers evaluate the package
 * against the milestone's acceptance criteria and approve or request changes.
 * On-chain we store the package's hash + a short public summary; the full
 * package (narrative, justification, metrics, links) is published on-chain
 * only if the creator opts in, otherwise it stays off-chain.
 */
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
  const mi = Math.min(Number(campaign.currentMilestone), Math.max(milestones.length - 1, 0));
  const milestone: Milestone | undefined = milestones[mi];

  const { writeEnabled } = useReadChain();
  const { config } = useApprovalConfig(campaign.id);
  const { reviews } = useReviews(campaign.id, mi);
  const { submissions } = useSubmissions(campaign.id, mi);
  const { execute, refresh, isPending, isConfirming, isConfirmed, error, hash } =
    useCovenantWrite();

  // Proof package form state
  const [summary, setSummary] = useState("");
  const [narrative, setNarrative] = useState("");
  const [justification, setJustification] = useState("");
  const [reportingNotes, setReportingNotes] = useState("");
  const [metricsSummary, setMetricsSummary] = useState("");
  const [links, setLinks] = useState<Array<{ url: string; label: string }>>([
    { url: "", label: "" },
  ]);
  const [publicEvidence, setPublicEvidence] = useState(true);
  const [lastManifest, setLastManifest] = useState<ProofManifest | null>(null);
  // Capability link for the most recent PRIVATE (encrypted) submission — the
  // creator must share this with reviewers; it carries the decryption key.
  const [capability, setCapability] = useState<string | null>(null);
  const [capabilityCopied, setCapabilityCopied] = useState(false);

  // Social sharing (kept deliberately separate — the post is NOT the proof record)
  const [activeTab, setActiveTab] = useState<SocialPlatform>("linkedin");
  const [postText, setPostText] = useState("");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    if (isConfirmed) {
      refresh();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  if (!milestone) return null;

  const state = milestone.state;
  const funded = campaign.totalRaised - campaign.totalReleased >= milestone.amount;
  const latestRejection = [...reviews].reverse().find((r) => !r.approved);
  const threshold = config?.threshold ?? 1;

  const filledLinks = links.filter((l) => l.url.trim().length > 0);
  const linksValid = filledLinks.length > 0 && filledLinks.every((l) => isValidUrl(l.url.trim()));
  const canSubmit =
    summary.trim().length > 0 &&
    narrative.trim().length > 0 &&
    justification.trim().length > 0 &&
    linksValid;

  const buildManifest = (): ProofManifest => ({
    version: 1,
    campaignId: campaign.id.toString(),
    milestoneIndex: mi,
    narrative: narrative.trim(),
    justification: justification.trim(),
    reportingNotes: reportingNotes.trim(),
    metricsSummary: metricsSummary.trim(),
    links: filledLinks.map((l) => ({
      url: l.url.trim(),
      ...(l.label.trim() ? { label: l.label.trim() } : {}),
      kind: "url" as const,
    })),
    createdAt: new Date().toISOString(),
  });

  const submit = async () => {
    if (!canSubmit) return;
    const manifest = buildManifest();
    const manifestHash = hashManifest(manifest);
    const manifestURI = publicEvidence ? manifestToDataUri(manifest) : "";
    setLastManifest(manifest);
    setCapability(null);
    setCapabilityCopied(false);
    if (publicEvidence) {
      // Public: store the manifest in the clear, addressable by its on-chain hash.
      void storeManifest(manifestHash, manifest);
    } else {
      // Private: encrypt in-browser and store only ciphertext. The capability
      // (which carries the key) is shown below for the creator to share with
      // reviewers — it is never put on-chain or sent to the server in the clear.
      try {
        const { capability: cap } = await storeEncryptedManifest(manifest);
        setCapability(cap);
      } catch {
        /* encryption/store failed — creator can still download & share the JSON */
      }
    }
    try {
      await execute("submitProof", [campaign.id, summary.trim(), manifestHash, manifestURI]);
    } catch {
      /* surfaced via TxFeedback */
    }
  };

  const shareableCapabilityLink = capability
    ? `${origin}/campaigns/${campaign.id.toString()}?ev=${encodeURIComponent(capability)}`
    : "";

  const downloadManifest = (manifest: ProofManifest) => {
    const blob = new Blob([canonicalManifestJson(manifest)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proof-campaign${campaign.id}-milestone${mi + 1}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const campaignLink = `${origin}/campaigns/${campaign.id.toString()}`;
  const buildPost = () => {
    const parts = [postText.trim()];
    parts.push(`Follow this campaign on Covenant:\n${campaignLink}`);
    return parts.join("\n\n");
  };

  // ---------------------------------------------------------------------------
  // Status header (visible to everyone)
  // ---------------------------------------------------------------------------
  const statusBlock = campaign.completed ? (
    <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
      All milestones approved and released. 🎉
    </p>
  ) : campaign.cancelledAt !== 0n ? (
    <p className="rounded-xl bg-red-600/10 px-4 py-3 text-sm text-red-700">
      This campaign was cancelled. Donors can claim refunds of the unreleased escrow.
    </p>
  ) : state === MilestoneState.Submitted ? (
    <div className="rounded-xl bg-violet-600/10 px-4 py-3 text-sm text-violet-700">
      <p className="font-medium">
        Proof submitted — under review (
        {config?.model === ApprovalModel.WeightedApproval
          ? `${
              milestone.weightSnapshot > 0n
                ? Number((milestone.approvedWeight * 10000n) / milestone.weightSnapshot) / 100
                : 0
            }%/${threshold}% of donor weight · ${milestone.weightedApproverCount}/2 donors`
          : `${milestone.approvalCount}/${threshold} approvals`}
        )
      </p>
      <p className="mt-1 opacity-80">
        Funds stay locked until the reviewers approve this package against the milestone criteria.
      </p>
    </div>
  ) : state === MilestoneState.ChangesRequested ? (
    <div className="rounded-xl bg-orange-600/10 px-4 py-3 text-sm text-orange-700">
      <p className="font-medium">Changes requested by a reviewer</p>
      {latestRejection && (
        <p className="mt-1 whitespace-pre-wrap">&ldquo;{latestRejection.notes}&rdquo;</p>
      )}
      {milestone.revisionDeadline !== 0n && (
        <p className="mt-1 text-xs opacity-80">
          Revise and resubmit by {formatDeadline(milestone.revisionDeadline)} — after that, donors
          can recover their funds.
        </p>
      )}
    </div>
  ) : (
    <p className="rounded-xl bg-[var(--bg-faint)] px-4 py-3 text-sm text-[var(--text-secondary)]">
      {funded
        ? "This milestone is funded and waiting for the creator's proof package."
        : "Waiting for donations to cover this milestone before proof can be submitted."}
      {milestone.criteria.proofDeadline !== 0n &&
        ` Proof deadline: ${formatDeadline(milestone.criteria.proofDeadline)}.`}
    </p>
  );

  const showForm =
    isCreator &&
    campaign.active &&
    !campaign.completed &&
    (state === MilestoneState.Pending || state === MilestoneState.ChangesRequested) &&
    funded;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-[var(--text-primary)]">
          {isCreator ? "Submit proof package" : "Milestone proof"}
        </h3>
        <span className="pill bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
          Milestone {mi + 1}
        </span>
      </div>

      {statusBlock}

      {/* Latest submission summary, for everyone */}
      {submissions.length > 0 && (
        <div className="mt-3 rounded-xl bg-[var(--bg-faint)] px-4 py-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
            Latest submission (#{submissions.length})
          </p>
          <p className="mt-1 text-[var(--text-primary)]">
            {submissions[submissions.length - 1].summary}
          </p>
        </div>
      )}

      {isCreator && lastManifest && (
        <button
          type="button"
          className="btn-ghost mt-2 text-xs"
          onClick={() => downloadManifest(lastManifest)}
        >
          ⬇ Download this proof package (JSON) — share it with your reviewers if you kept it
          private
        </button>
      )}

      {isCreator && capability && (
        <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="font-medium text-[var(--text-primary)]">
            🔒 Private evidence — share this access link with your reviewers only
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Your proof was encrypted in your browser; the server only holds ciphertext. This link
            carries the decryption key — anyone with it can read the package, so send it only to
            your reviewers (not on-chain, not in public). Reviewers paste it into the review panel.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              className="input flex-1 text-xs"
              value={shareableCapabilityLink}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className="btn-secondary shrink-0 text-xs"
              onClick={() => {
                navigator.clipboard?.writeText(shareableCapabilityLink).catch(() => {});
                setCapabilityCopied(true);
              }}
            >
              {capabilityCopied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="mt-4 space-y-3 border-t border-[var(--border-primary)] pt-4">
          {!writeEnabled && (
            <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              Proof submission is disabled until this network has a current Covenant deployment.
            </p>
          )}

          {/* What the reviewer will evaluate */}
          <div className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            <p className="font-medium text-[var(--text-primary)]">
              Reviewers will evaluate against:
            </p>
            <p className="mt-1">{milestone.criteria.successDefinition}</p>
            {milestone.criteria.requiredProof && (
              <p className="mt-1">Required proof: {milestone.criteria.requiredProof}</p>
            )}
            {milestone.criteria.expectedMetrics && (
              <p className="mt-1">Expected metrics: {milestone.criteria.expectedMetrics}</p>
            )}
          </div>

          <div>
            <label className="label">Public summary (goes on-chain)</label>
            <input
              className="input"
              placeholder="One line, non-sensitive — e.g. 'Hospital deposit paid, receipt attached'"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          <div>
            <label className="label">What did you accomplish?</label>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder="Your write-up. It doesn't have to be perfect proof — it helps reviewers understand the evidence."
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
            />
          </div>

          <div>
            <label className="label">How does the attached evidence show this?</label>
            <textarea
              className="input min-h-[60px] resize-y"
              placeholder="Connect the links below to the milestone's success definition."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Metrics summary (optional)</label>
              <input
                className="input"
                placeholder="e.g. WAU 540, W4 retention 22%"
                value={metricsSummary}
                onChange={(e) => setMetricsSummary(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Dates / reporting notes (optional)</label>
              <input
                className="input"
                placeholder="e.g. covers June 1–28 reporting period"
                value={reportingNotes}
                onChange={(e) => setReportingNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Evidence links — one or more */}
          <div>
            <label className="label">Supporting evidence links</label>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    inputMode="url"
                    placeholder="https://… (dashboard, receipt, photo, doc, video)"
                    value={l.url}
                    onChange={(e) =>
                      setLinks((prev) =>
                        prev.map((v, idx) => (idx === i ? { ...v, url: e.target.value } : v)),
                      )
                    }
                  />
                  <input
                    className="input w-36"
                    placeholder="label (optional)"
                    value={l.label}
                    onChange={(e) =>
                      setLinks((prev) =>
                        prev.map((v, idx) => (idx === i ? { ...v, label: e.target.value } : v)),
                      )
                    }
                  />
                  {links.length > 1 && (
                    <button
                      type="button"
                      className="shrink-0 text-[var(--text-tertiary)] hover:text-red-600"
                      onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-ghost mt-2 text-xs"
              onClick={() => setLinks((prev) => [...prev, { url: "", label: "" }])}
            >
              + Add evidence link
            </button>
            {filledLinks.length > 0 && !linksValid && (
              <p className="mt-1 text-xs text-amber-700">
                Every link must be a full URL starting with http:// or https://.
              </p>
            )}
          </div>

          {/* Privacy boundary */}
          <div className="rounded-xl border border-[var(--border-primary)] p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={publicEvidence}
                onChange={(e) => setPublicEvidence(e.target.checked)}
              />
              <span>
                <span className="font-medium text-[var(--text-primary)]">
                  Publish the full package on-chain
                </span>
                <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                  {publicEvidence
                    ? "The whole package (write-up + links) becomes permanently public. Fine for charity receipts; uncheck for sensitive financials or customer data."
                    : "Only the one-line summary and a fingerprint (hash) of the package go on-chain. The full package is stored off-chain for your reviewers; download it after submitting to share directly if needed."}
                </span>
              </span>
            </label>
          </div>

          <button
            className="btn-primary w-full"
            onClick={submit}
            disabled={!writeEnabled || !canSubmit || isPending || isConfirming}
          >
            {isPending || isConfirming
              ? "Submitting…"
              : state === MilestoneState.ChangesRequested
                ? "Resubmit revised proof for review"
                : "Submit proof for review"}
          </button>
          <div className="min-h-[1.25rem]">
            <TxFeedback
              isPending={isPending}
              isConfirming={isConfirming}
              isConfirmed={isConfirmed}
              error={error}
              hash={hash}
              successText="Proof package submitted — awaiting reviewer approval. Funds release only after approval."
            />
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            On-chain record: your public summary, the package fingerprint
            {publicEvidence ? ", and the full package contents" : " (contents stay off-chain)"}.
            Submitting does not release funds.
          </p>
        </div>
      )}

      {/* Creator: cancel escape hatch */}
      {isCreator && campaign.active && !campaign.completed && (
        <CancelSection campaignId={campaign.id} />
      )}

      {/* Social sharing — optional, explicitly not the proof record */}
      {isCreator && campaign.active && (
        <div className="mt-4 border-t border-[var(--border-primary)] pt-4">
          <p className="label">Share an update (optional)</p>
          <p className="mb-2 text-xs text-[var(--text-tertiary)]">
            This post is marketing, not evidence — nothing here is recorded on-chain or shown to
            reviewers.
          </p>
          <div className="mb-3 flex gap-2">
            {(Object.keys(SOCIAL) as SocialPlatform[]).map((platform) => (
              <button
                key={platform}
                type="button"
                onClick={() => setActiveTab(platform)}
                className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  activeTab === platform
                    ? "border-[var(--brand-primary)]/60 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                    : "border-[var(--border-primary)] bg-[var(--bg-faint)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {SOCIAL[platform].name}
              </button>
            ))}
          </div>
          <textarea
            className="input min-h-[90px] resize-y"
            placeholder={`Write your ${SOCIAL[activeTab].name} post in your own words`}
            value={postText}
            onChange={(e) => {
              setPostText(e.target.value);
              setCopied(false);
            }}
          />
          <button
            type="button"
            className="btn-secondary mt-3 w-full"
            onClick={() => {
              const text = buildPost();
              navigator.clipboard?.writeText(text).catch(() => {});
              window.open(SOCIAL[activeTab].composeUrl(text), "_blank", "noopener,noreferrer");
              setCopied(true);
            }}
            disabled={!postText.trim()}
          >
            Post on {SOCIAL[activeTab].name}
          </button>
          {copied && (
            <p className="mt-2 rounded-xl bg-[var(--brand-primary)]/10 px-4 py-2 text-xs text-[var(--brand-primary)]">
              Copied to clipboard — {SOCIAL[activeTab].name} opened in a new tab.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CancelSection({ campaignId }: { campaignId: bigint }) {
  const [armed, setArmed] = useState(false);
  const { execute, refresh, isPending, isConfirming, isConfirmed, error, hash } =
    useCovenantWrite();

  useEffect(() => {
    if (isConfirmed) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  return (
    <details className="mt-4 border-t border-[var(--border-primary)] pt-3">
      <summary className="cursor-pointer text-xs text-[var(--text-tertiary)] hover:text-red-600">
        Cancel this campaign…
      </summary>
      <div className="mt-2 rounded-xl bg-red-600/5 p-3 text-xs text-[var(--text-secondary)]">
        <p>
          Cancelling permanently closes the campaign and lets every donor reclaim their share of
          the unreleased escrow. Funds already released for approved milestones are not affected.
        </p>
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" checked={armed} onChange={(e) => setArmed(e.target.checked)} />
          I understand this cannot be undone
        </label>
        <button
          type="button"
          className="btn-secondary mt-2 w-full text-red-700"
          disabled={!armed || isPending || isConfirming}
          onClick={() => execute("cancelCampaign", [campaignId]).catch(() => {})}
        >
          {isPending || isConfirming ? "Cancelling…" : "Cancel campaign & open refunds"}
        </button>
        <div className="min-h-[1.25rem]">
          <TxFeedback
            isPending={isPending}
            isConfirming={isConfirming}
            isConfirmed={isConfirmed}
            error={error}
            hash={hash}
            successText="Campaign cancelled — donors can now claim refunds."
          />
        </div>
      </div>
    </details>
  );
}
