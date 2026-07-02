"use client";

import { useEffect, useMemo, useState } from "react";
import type { Campaign, Milestone } from "../lib/types";
import { useCovenantWrite } from "../hooks/useCovenant";
import { TxFeedback } from "./TxFeedback";
import { EvidenceLink } from "./EvidenceLink";

type SocialPlatform = "linkedin" | "farcaster";

const SOCIAL: Record<SocialPlatform, { name: string; composeUrl: (text: string) => string }> = {
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
  const [progress, setProgress] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [copied, setCopied] = useState<SocialPlatform | null>(null);
  // window.location is unavailable during prerender, so resolve it after mount.
  const [origin, setOrigin] = useState("");
  const { execute, refresh, isPending, isConfirming, isConfirmed, error, hash } =
    useCovenantWrite();

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (isConfirmed) {
      setProgress("");
      setEvidenceUrl("");
      setCopied(null);
      refresh();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  // Evidence always targets the current active milestone. Submitting evidence
  // releases that milestone's funds in the same transaction (once it's funded).
  const current = Number(campaign.currentMilestone);
  const evidenceIndex = campaign.completed
    ? milestones.length - 1
    : Math.min(current, milestones.length - 1);

  const targetMilestone: Milestone | undefined = milestones[evidenceIndex];

  const urlValid = isValidUrl(evidenceUrl.trim());
  const canSubmit = progress.trim().length > 0 && urlValid;

  const campaignLink = `${origin}/campaigns/${campaign.id.toString()}`;

  // The social update donors can repost — regenerated live as the creator types.
  const socialPreview = useMemo(() => {
    const lines = [
      `📢 Milestone update: ${campaign.title}`,
      "",
      `Milestone ${evidenceIndex + 1} of ${milestones.length}: ${targetMilestone?.description ?? ""}`,
      "",
      progress.trim() || "(your progress description)",
      "",
      `Proof: ${evidenceUrl.trim() || "(your evidence URL)"}`,
      "",
      `Every dollar is tracked on Covenant: ${campaignLink}`,
    ];
    return lines.join("\n");
  }, [campaign.title, evidenceIndex, milestones.length, targetMilestone?.description, progress, evidenceUrl, campaignLink]);

  // A fresh edit invalidates the last copy, so hide the stale confirmation.
  useEffect(() => {
    setCopied(null);
  }, [socialPreview]);

  const copyFor = async (platform: SocialPlatform) => {
    try {
      await navigator.clipboard.writeText(socialPreview);
      setCopied(platform);
    } catch {
      /* clipboard unavailable (e.g. insecure context) — leave confirmation hidden */
    }
  };

  // Only the evidence URL goes on-chain; the description lives in the social post.
  const submit = async () => {
    if (!canSubmit) return;
    try {
      await execute("submitEvidence", [campaign.id, evidenceUrl.trim()]);
    } catch {
      /* surfaced via TxFeedback */
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-[var(--text-primary)]">
          {isCreator && targetMilestone ? "Submit proof" : "Milestone proof"}
        </h3>
        {targetMilestone && (
          <span className="pill bg-[var(--bg-subtle)] text-[var(--text-secondary)]">Milestone {evidenceIndex + 1}</span>
        )}
      </div>

      {campaign.completed ? (
        <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          All milestones completed and proven. 🎉
        </p>
      ) : targetMilestone?.evidenceSubmitted ? (
        <div className="rounded-xl bg-[var(--bg-faint)] px-4 py-3">
          <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
            Proof for "{targetMilestone.description}"
          </p>
          <EvidenceLink evidence={targetMilestone.evidence} />
          {/* If there's a more recent released-but-unproven milestone, show a nudge */}
          {current > 0 &&
            milestones[current - 1]?.released &&
            !milestones[current - 1]?.evidenceSubmitted &&
            evidenceIndex !== current - 1 && (
              <p className="mt-2 text-xs text-[var(--text-warning)]">
                Milestone {current} needs proof to unlock the next tranche.
              </p>
            )}
        </div>
      ) : (
        <p className="rounded-xl bg-[var(--bg-faint)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          No proof submitted yet for &ldquo;{targetMilestone?.description}&rdquo;. Once the creator
          posts proof, funds are automatically released to them.
        </p>
      )}

      {isCreator && targetMilestone && (
        <div className="mt-4 border-t border-[var(--border-primary)] pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {targetMilestone.evidenceSubmitted ? "Update milestone proof" : "Milestone proof composer"}
            </span>
          </div>

          <label className="label">What did you accomplish?</label>
          <textarea
            className="input min-h-[90px] resize-y"
            placeholder="Describe the progress you made on this milestone"
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
          />

          <label className="label mt-3 block">Supporting evidence URL</label>
          <input
            className="input"
            inputMode="url"
            placeholder="https://… (receipt, photo, document)"
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
          />
          {evidenceUrl.trim() && !urlValid && (
            <p className="mt-1 text-xs text-[var(--text-warning)]">
              Enter a full URL starting with http:// or https://.
            </p>
          )}

          {/* Social-update preview, regenerated as the creator types */}
          <p className="label mt-4">Social update preview</p>
          <div className="rounded-xl bg-[var(--bg-faint)] px-4 py-3">
            <p className="whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">
              {socialPreview}
            </p>
          </div>

          <div className="mt-3 flex gap-2">
            {(Object.keys(SOCIAL) as SocialPlatform[]).map((platform) => (
              <button
                key={platform}
                type="button"
                className="btn-secondary flex-1"
                onClick={() => copyFor(platform)}
                disabled={!canSubmit}
              >
                Post in {SOCIAL[platform].name}
              </button>
            ))}
          </div>

          {copied && (
            <div className="mt-2 flex items-center justify-between rounded-xl bg-[var(--brand-primary)]/10 px-4 py-2">
              <span className="text-xs text-[var(--brand-primary)]">
                Update copied — paste it into your {SOCIAL[copied].name} post.
              </span>
              <a
                href={SOCIAL[copied].composeUrl(socialPreview)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs font-semibold text-[var(--brand-primary)] hover:underline"
              >
                Open {SOCIAL[copied].name} ↗
              </a>
            </div>
          )}

          <button
            className="btn-primary mt-4 w-full"
            onClick={submit}
            disabled={!canSubmit || isPending || isConfirming}
          >
            {isPending || isConfirming
              ? "Submitting…"
              : !canSubmit
                ? "Add a description and evidence URL"
                : "Post proof on-chain"}
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
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            The evidence URL is stored permanently on-chain. Submitting proof automatically releases
            this milestone&apos;s funds to you.
          </p>
        </div>
      )}
    </div>
  );
}
