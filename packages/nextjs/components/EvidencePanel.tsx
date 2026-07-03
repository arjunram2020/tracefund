"use client";

import { useEffect, useState } from "react";
import type { Campaign, Milestone } from "../lib/types";
import { useCovenantWrite, useReadChain } from "../hooks/useCovenant";
import { TxFeedback } from "./TxFeedback";
import { EvidenceLink } from "./EvidenceLink";

type SocialPlatform = "linkedin" | "farcaster";

const SOCIAL: Record<
  SocialPlatform,
  { name: string; composeUrl: (text: string) => string; example: string }
> = {
  linkedin: {
    name: "LinkedIn",
    composeUrl: (text) =>
      `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`,
    example: `Hey everyone, I’m [name], and I’m currently building a startup called [startup name].

We’re raising [amount] to help us [explain the goal]. We’re currently working on [describe current progress and plans].

We’d love for you to try the application through our waitlist and share your honest feedback. Our goal is to build the best possible product for people experiencing [problem].`,
  },
  farcaster: {
    name: "Farcaster",
    composeUrl: (text) => `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`,
    example: `gm! quick update from [startup name] — we just shipped [what you accomplished] \u{1F680}

we’re raising [amount] to [explain the goal]. try it, roast it, share it — all feedback welcome!`,
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
  const [activeTab, setActiveTab] = useState<SocialPlatform>("linkedin");
  const [messages, setMessages] = useState<Record<SocialPlatform, string>>({
    linkedin: "",
    farcaster: "",
  });
  const [copied, setCopied] = useState<SocialPlatform | null>(null);
  // window.location is unavailable during prerender, so resolve it after mount.
  const [origin, setOrigin] = useState("");
  const { writeEnabled } = useReadChain();
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

  // A fresh edit invalidates the last copy, so hide the stale confirmation.
  useEffect(() => {
    setCopied(null);
  }, [messages, evidenceUrl]);

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

  // The final post is the creator's message verbatim, with only the evidence
  // and campaign links appended — Covenant never writes their narrative.
  const buildPost = (platform: SocialPlatform) => {
    const parts = [messages[platform].trim()];
    if (evidenceUrl.trim()) parts.push(`Supporting evidence:\n${evidenceUrl.trim()}`);
    parts.push(`Follow this campaign on Covenant:\n${campaignLink}`);
    return parts.join("\n\n");
  };

  const postTo = (platform: SocialPlatform) => {
    const text = buildPost(platform);
    // Open synchronously so popup blockers see the click; copy in parallel.
    navigator.clipboard?.writeText(text).catch(() => {});
    window.open(SOCIAL[platform].composeUrl(text), "_blank", "noopener,noreferrer");
    setCopied(platform);
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
          {!writeEnabled && (
            <p className="mb-4 rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              Proof submission is disabled here until this network is upgraded to the USDC Covenant
              contract. The currently deployed Base Mainnet contract is still legacy ETH-only.
            </p>
          )}

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

          <button
            className="btn-primary mt-4 w-full"
            onClick={submit}
            disabled={!writeEnabled || !canSubmit || isPending || isConfirming}
          >
            {!writeEnabled
              ? "USDC deployment required"
              : isPending || isConfirming
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

          {/* ------------------------------------------------------------- */}
          {/* Share an update — the creator writes the post in their own    */}
          {/* words; Covenant only appends the evidence + campaign links.   */}
          {/* ------------------------------------------------------------- */}
          <div className="mt-4 border-t border-[var(--border-primary)] pt-4">
            <p className="label">Share an update</p>

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
              className="input min-h-[110px] resize-y"
              placeholder={`Write your ${SOCIAL[activeTab].name} post in your own words`}
              value={messages[activeTab]}
              onChange={(e) =>
                setMessages((prev) => ({ ...prev, [activeTab]: e.target.value }))
              }
            />

            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                View example post
              </summary>
              <div className="mt-2 rounded-xl bg-[var(--bg-subtle)] px-4 py-3">
                <p className="whitespace-pre-wrap text-xs text-[var(--text-tertiary)]">
                  {SOCIAL[activeTab].example}
                </p>
                <p className="mt-2 text-xs italic text-[var(--text-tertiary)]">
                  For inspiration only — this text is never added to your post.
                </p>
              </div>
            </details>

            {messages[activeTab].trim() && (
              <>
                <p className="label mt-3">Final preview</p>
                <div className="rounded-xl bg-[var(--bg-faint)] px-4 py-3">
                  <p className="whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">
                    {buildPost(activeTab)}
                  </p>
                </div>
              </>
            )}

            <button
              type="button"
              className="btn-secondary mt-3 w-full"
              onClick={() => postTo(activeTab)}
              disabled={!messages[activeTab].trim()}
            >
              Post on {SOCIAL[activeTab].name}
            </button>

            {copied && (
              <p className="mt-2 rounded-xl bg-[var(--brand-primary)]/10 px-4 py-2 text-xs text-[var(--brand-primary)]">
                Copied to clipboard — {SOCIAL[copied].name} opened in a new tab. Paste there to
                publish.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
