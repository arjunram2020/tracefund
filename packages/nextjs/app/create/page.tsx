"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useCampaignCount,
  useCovenantWrite,
  useCreatorAccess,
  useCreatorStats,
  useReadChain,
} from "../../hooks/useCovenant";
import { TxFeedback } from "../../components/TxFeedback";
import { ContractNotice } from "../../components/ContractNotice";
import { USDC_DECIMALS, formatUsdc } from "../../lib/format";
import {
  ApprovalModel,
  CampaignKind,
  type ApprovalModelValue,
  type CampaignKindValue,
} from "../../lib/types";
import { allowedApprovalModels, defaultApprovalForKind, draftMilestones } from "../../lib/milestoneDrafter";

// Must match Covenant.sol constants — the contract is the enforcer.
const MAX_MILESTONES = 5;
const MAX_REVIEWERS = 7;
const FREE_CAMPAIGNS = 2;
const CREATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const PROOF_TYPE_OPTIONS = [
  { label: "Analytics screenshots", fileTypes: ".png, .jpg, .pdf" },
  { label: "Receipts", fileTypes: ".pdf, .jpg, .png" },
  { label: "Delivery logs", fileTypes: ".csv, .xlsx, .pdf" },
  { label: "Text update", fileTypes: ".txt, .pdf, .docx" },
  { label: "Images", fileTypes: ".jpg, .png, .heic" },
];

const REPORTING_PERIOD_OPTIONS = ["Once, at completion", "Weekly", "Every 2 weeks", "Monthly", "Per phase"];

const APPROVAL_OPTION_META: Record<ApprovalModelValue, { label: string; hint: string }> = {
  [ApprovalModel.WeightedApproval]: {
    label: "Weighted donor approval",
    hint: "donors vote, weighted by how much they gave",
  },
  [ApprovalModel.DesignatedReviewers]: {
    label: "Designated reviewers",
    hint: "investors, committee, or grant admins you name",
  },
  [ApprovalModel.PlatformOperator]: {
    label: "Platform operator",
    hint: "the Covenant platform reviews",
  },
};

interface MilestoneForm {
  title: string;
  amount: string; // USDC display units
  successDefinition: string;
  reportingPeriod: string;
  expectedMetrics: string;
  requiredProof: string;
  deadline: string; // yyyy-mm-dd, "" = none
}

const emptyMilestone = (): MilestoneForm => ({
  title: "",
  amount: "",
  successDefinition: "",
  reportingPeriod: "",
  expectedMetrics: "",
  requiredProof: "",
  deadline: "",
});

const KIND_OPTIONS: Array<{ value: CampaignKindValue; label: string; hint: string }> = [
  { value: CampaignKind.Charity, label: "Charity / community", hint: "receipts, photos, delivery proof" },
  { value: CampaignKind.Startup, label: "Startup / VC", hint: "metrics, analytics, investor review" },
  { value: CampaignKind.Grant, label: "Grant program", hint: "deliverables, administrator sign-off" },
  { value: CampaignKind.Other, label: "Other", hint: "" },
];

function safeParse(amount: string): bigint | null {
  try {
    return amount ? parseUnits(amount, USDC_DECIMALS) : null;
  } catch {
    return null;
  }
}

function deadlineToUnix(date: string): bigint {
  if (!date) return 0n;
  // End of the chosen day, local time — a deadline "on July 20" means July 20 counts.
  const ts = new Date(`${date}T23:59:59`).getTime();
  return Number.isNaN(ts) ? 0n : BigInt(Math.floor(ts / 1000));
}

export default function CreateCampaignPage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { writeEnabled } = useReadChain();
  const { count } = useCampaignCount();
  const predictedId = useRef<bigint | null>(null);
  const confirmedOnce = useRef(false);

  // Pre-check the on-chain creation limits so users get a clear message
  // instead of a wallet revert. The contract is the actual enforcer.
  const { approved, lastCampaignAt } = useCreatorAccess(address);
  const { stats } = useCreatorStats(address);
  const createdCount = Number(stats?.campaignsCreated ?? 0n);
  const lastCreatedMs = Number(lastCampaignAt ?? 0n) * 1000;
  const unapproved = approved === false;
  const capReached = unapproved && createdCount >= FREE_CAMPAIGNS;
  const cooldownEndsMs = lastCreatedMs + CREATION_COOLDOWN_MS;
  const inCooldown = unapproved && lastCreatedMs > 0 && Date.now() < cooldownEndsMs;
  const creationBlocked = !writeEnabled || capReached || inCooldown;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<CampaignKindValue>(CampaignKind.Charity);
  const [milestones, setMilestones] = useState<MilestoneForm[]>([
    emptyMilestone(),
    emptyMilestone(),
    emptyMilestone(),
  ]);
  const [expanded, setExpanded] = useState<number | null>(0);

  // Approval configuration
  const [approvalModel, setApprovalModel] = useState<ApprovalModelValue>(
    defaultApprovalForKind(CampaignKind.Charity).model,
  );
  const [approvalTouched, setApprovalTouched] = useState(false);
  const [reviewers, setReviewers] = useState<string[]>([""]);
  const [threshold, setThreshold] = useState(1);
  // Percent of donated weight required to approve (WeightedApproval only).
  const [weightedThreshold, setWeightedThreshold] = useState(
    defaultApprovalForKind(CampaignKind.Charity).threshold,
  );

  // AI drafting state
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [totalGoal, setTotalGoal] = useState("");

  const { execute, refresh, isPending, isConfirming, isConfirmed, error, hash } =
    useCovenantWrite();

  if (isConfirmed && predictedId.current !== null && !confirmedOnce.current) {
    confirmedOnce.current = true;
    refresh();
    router.push(`/campaigns/${predictedId.current.toString()}`);
  }

  const selectKind = (next: CampaignKindValue) => {
    setKind(next);
    const allowed = allowedApprovalModels(next);
    // Smart default: move the approval model if the user hasn't chosen one,
    // or if their choice is no longer offered for this kind (e.g. switching
    // from Startup's designated-reviewers to Charity, which doesn't offer it).
    if (!approvalTouched || !allowed.includes(approvalModel)) {
      const def = defaultApprovalForKind(next);
      setApprovalModel(def.model);
      if (def.model === ApprovalModel.WeightedApproval) {
        setWeightedThreshold(def.threshold);
      } else {
        setThreshold(def.threshold);
      }
    }
  };

  const patchMilestone = (i: number, patch: Partial<MilestoneForm>) => {
    setMilestones((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };

  const addMilestone = () => {
    setMilestones((prev) => [...prev, emptyMilestone()]);
    setExpanded(milestones.length);
  };

  const removeMilestone = (i: number) => {
    setMilestones((prev) => prev.filter((_, idx) => idx !== i));
    setExpanded(null);
  };

  const splitEvenly = () => {
    const parsed = safeParse(totalGoal);
    if (!parsed || parsed <= 0n || milestones.length === 0) return;
    const n = BigInt(milestones.length);
    const each = parsed / n;
    const last = parsed - each * (n - 1n);
    setMilestones((prev) =>
      prev.map((m, i) => ({
        ...m,
        amount: formatUsdc(i === prev.length - 1 ? last : each),
      })),
    );
  };

  const runDraft = async () => {
    if (!title.trim() || !description.trim()) return;
    setDrafting(true);
    setDraftNote(null);
    try {
      const draft = await draftMilestones({
        kind,
        title: title.trim(),
        description: description.trim(),
        goalAmount: totalGoal || undefined,
        milestoneCount: milestones.length,
      });
      const goal = safeParse(totalGoal);
      setMilestones(
        draft.milestones.map((m) => {
          const deadline = new Date(Date.now() + m.suggestedDeadlineDays * 86_400_000);
          const share =
            goal && goal > 0n
              ? formatUsdc(BigInt(Math.floor(Number(goal) * m.amountShare)))
              : "";
          return {
            title: m.title,
            amount: share,
            successDefinition: m.successDefinition,
            reportingPeriod: m.reportingPeriod,
            expectedMetrics: m.expectedMetrics,
            requiredProof: m.requiredProof,
            deadline: m.suggestedDeadlineDays > 0 ? deadline.toISOString().slice(0, 10) : "",
          };
        }),
      );
      if (!approvalTouched) {
        setApprovalModel(draft.approval.model);
        if (draft.approval.model === ApprovalModel.WeightedApproval) {
          setWeightedThreshold(draft.approval.threshold);
        } else {
          setThreshold(draft.approval.threshold);
        }
      }
      setDraftNote(
        `${draft.source === "llm" ? "AI draft" : "Template draft"} loaded — every field below is a suggestion. Edit until it matches what you actually committed to. ${draft.notes}`,
      );
      setExpanded(0);
    } catch {
      setDraftNote("Drafting failed — fill the milestones in manually.");
    } finally {
      setDrafting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  const parsedAmounts = milestones.map((m) => safeParse(m.amount));
  const goalTotal = parsedAmounts.every((a) => a !== null && a > 0n)
    ? parsedAmounts.reduce((s, a) => s! + a!, 0n as bigint)
    : null;

  const milestoneErrors = milestones.map((m, i) => {
    if (!m.title.trim()) return "needs a title";
    if (!m.successDefinition.trim()) return "needs a success definition";
    const a = parsedAmounts[i];
    if (a === null || a <= 0n) return "needs a USDC amount";
    if (m.deadline && deadlineToUnix(m.deadline) <= BigInt(Math.floor(Date.now() / 1000)))
      return "deadline must be in the future";
    return null;
  });

  const needsReviewers = approvalModel === ApprovalModel.DesignatedReviewers;
  const needsWeighted = approvalModel === ApprovalModel.WeightedApproval;
  const cleanReviewers = reviewers.map((r) => r.trim()).filter((r) => r.length > 0);
  const reviewerError = !needsReviewers
    ? null
    : cleanReviewers.length === 0
      ? "Add at least one reviewer address"
      : cleanReviewers.some((r) => !isAddress(r))
        ? "One of the reviewer addresses is not a valid address"
        : address && cleanReviewers.some((r) => r.toLowerCase() === address.toLowerCase())
          ? "You cannot review your own campaign"
          : new Set(cleanReviewers.map((r) => r.toLowerCase())).size !== cleanReviewers.length
            ? "Duplicate reviewer address"
            : cleanReviewers.length > MAX_REVIEWERS
              ? `At most ${MAX_REVIEWERS} reviewers`
              : threshold < 1 || threshold > cleanReviewers.length
                ? "Approval threshold must be between 1 and the number of reviewers"
                : null;
  const weightedError =
    needsWeighted && (weightedThreshold < 1 || weightedThreshold > 100)
      ? "Approval threshold must be between 1 and 100 percent"
      : null;

  const formValid =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    milestones.length >= 1 &&
    milestones.length <= MAX_MILESTONES &&
    milestoneErrors.every((e) => e === null) &&
    reviewerError === null &&
    weightedError === null;

  const submit = async () => {
    if (!formValid) return;
    predictedId.current = count;
    try {
      await execute("createCampaign", [
        title.trim(),
        description.trim(),
        kind,
        {
          model: approvalModel,
          reviewers: needsReviewers ? cleanReviewers : [],
          threshold: needsReviewers ? threshold : needsWeighted ? weightedThreshold : 1,
        },
        milestones.map((m, i) => ({
          criteria: {
            title: m.title.trim(),
            successDefinition: m.successDefinition.trim(),
            reportingPeriod: m.reportingPeriod.trim(),
            expectedMetrics: m.expectedMetrics.trim(),
            requiredProof: m.requiredProof.trim(),
            proofDeadline: deadlineToUnix(m.deadline),
          },
          amount: parsedAmounts[i]!,
        })),
      ]);
    } catch {
      /* surfaced via TxFeedback */
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Create a campaign</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Funds unlock in tranches — each milestone releases only after your reviewers approve the
          proof against the acceptance criteria you set here.
        </p>
      </div>

      <div className="mb-6">
        <ContractNotice />
      </div>

      <div className="card space-y-6 p-6">
        {/* Campaign kind */}
        <div>
          <label className="label">Campaign type</label>
          <div className="grid gap-2 sm:grid-cols-4">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectKind(opt.value)}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                  kind === opt.value
                    ? "border-[var(--brand-primary)]/60 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                    : "border-[var(--border-primary)] bg-[var(--bg-faint)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span className="block font-medium">{opt.label}</span>
                {opt.hint && <span className="block text-xs opacity-70">{opt.hint}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Title + description */}
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            placeholder={
              kind === CampaignKind.Startup ? "Acme — seed milestone tranche" : "Community Medical Relief Fund"
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="label">What is this campaign for?</label>
          <textarea
            className="input min-h-[90px] resize-y"
            placeholder="Describe the goal. The milestone drafter uses this to suggest acceptance criteria."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Goal + drafting */}
        <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-faint)] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label className="label">Total goal (USDC, optional here)</label>
              <input
                className="input font-mono"
                inputMode="decimal"
                placeholder="e.g. 0.5"
                value={totalGoal}
                onChange={(e) => setTotalGoal(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={splitEvenly}
              disabled={!safeParse(totalGoal)}
              title="Split the goal evenly across the milestones below"
            >
              Split evenly
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={runDraft}
              disabled={drafting || !title.trim() || !description.trim()}
            >
              {drafting ? "Drafting…" : "✦ Draft milestones for me"}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            The drafter proposes acceptance criteria, proof requirements, reporting cadence,
            deadlines and an approval setup based on your campaign type. It&apos;s an assistant, not
            the final authority — you review and edit everything before it goes on-chain.
          </p>
          {draftNote && (
            <p className="mt-2 rounded-lg bg-[var(--brand-primary)]/10 px-3 py-2 text-xs text-[var(--brand-primary)]">
              {draftNote}
            </p>
          )}
        </div>

        {/* Milestones */}
        <div>
          <div className="flex items-center justify-between">
            <label className="label">Milestones &amp; acceptance criteria</label>
            {goalTotal !== null && (
              <span className="font-mono text-sm text-[var(--text-secondary)]">
                goal: {formatUsdc(goalTotal)} USDC
              </span>
            )}
          </div>
          <p className="mb-3 text-xs text-[var(--text-tertiary)]">
            Evidence can stay flexible; the criteria can&apos;t stay vague. Each milestone should
            state what &ldquo;done&rdquo; means so your reviewers know exactly what they&apos;re
            evaluating.
          </p>

          <div className="space-y-3">
            {milestones.map((m, i) => {
              const isOpen = expanded === i;
              const err = milestoneErrors[i];
              return (
                <div
                  key={i}
                  className={`rounded-xl border p-4 ${
                    err && (m.title || m.successDefinition || m.amount)
                      ? "border-amber-600/40"
                      : "border-[var(--border-primary)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-xs font-bold text-[var(--text-secondary)]">
                      {i + 1}
                    </span>
                    <input
                      className="input flex-1"
                      placeholder={`Milestone ${i + 1} title (e.g. "500 weekly active users")`}
                      value={m.title}
                      onChange={(e) => patchMilestone(i, { title: e.target.value })}
                    />
                    <input
                      className="input w-28 font-mono"
                      inputMode="decimal"
                      placeholder="USDC"
                      value={m.amount}
                      onChange={(e) =>
                        patchMilestone(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })
                      }
                    />
                    <button
                      type="button"
                      className="btn-ghost shrink-0 px-2 text-xs"
                      onClick={() => setExpanded(isOpen ? null : i)}
                    >
                      {isOpen ? "▴ criteria" : "▾ criteria"}
                    </button>
                    {milestones.length > 1 && (
                      <button
                        type="button"
                        className="shrink-0 text-[var(--text-tertiary)] hover:text-red-600"
                        onClick={() => removeMilestone(i)}
                        title="Remove milestone"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <div className="mt-3 space-y-3 border-t border-[var(--border-primary)] pt-3">
                      <div>
                        <label className="label">Success definition (required)</label>
                        <textarea
                          className="input min-h-[60px] resize-y"
                          placeholder='What does "done" mean, concretely? A stranger should be able to judge it.'
                          value={m.successDefinition}
                          onChange={(e) => patchMilestone(i, { successDefinition: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label">Required proof / documents</label>
                        <select
                          className="input"
                          value={m.requiredProof}
                          onChange={(e) => patchMilestone(i, { requiredProof: e.target.value })}
                        >
                          <option value="">Select a proof type…</option>
                          {m.requiredProof && !PROOF_TYPE_OPTIONS.some(o => o.label === m.requiredProof) && (
                            <option value={m.requiredProof}>{m.requiredProof}</option>
                          )}
                          {PROOF_TYPE_OPTIONS.map(o => (
                            <option key={o.label} value={o.label}>
                              {o.label} ({o.fileTypes})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label">Expected metrics (optional)</label>
                          <input
                            className="input"
                            placeholder="e.g. WAU ≥ 500, retention ≥ 20%"
                            value={m.expectedMetrics}
                            onChange={(e) => patchMilestone(i, { expectedMetrics: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="label">Reporting period (optional)</label>
                          <select
                            className="input"
                            value={m.reportingPeriod}
                            onChange={(e) => patchMilestone(i, { reportingPeriod: e.target.value })}
                          >
                            <option value="">Select a cadence…</option>
                            {m.reportingPeriod && !REPORTING_PERIOD_OPTIONS.includes(m.reportingPeriod) && (
                              <option value={m.reportingPeriod}>{m.reportingPeriod}</option>
                            )}
                            {REPORTING_PERIOD_OPTIONS.map(o => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="label">Proof deadline (recommended)</label>
                        <input
                          type="date"
                          className="input"
                          value={m.deadline}
                          onChange={(e) => patchMilestone(i, { deadline: e.target.value })}
                        />
                        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                          If proof isn&apos;t approved by the deadline, donors can recover their
                          unreleased funds. Without one, refunds only open on rejection timeouts or
                          if you cancel.
                        </p>
                      </div>
                    </div>
                  )}
                  {err && (m.title || m.successDefinition || m.amount) && (
                    <p className="mt-2 text-xs text-amber-700">Milestone {i + 1} {err}.</p>
                  )}
                </div>
              );
            })}
          </div>
          {milestones.length < MAX_MILESTONES && (
            <button type="button" className="btn-ghost mt-3 text-xs" onClick={addMilestone}>
              + Add milestone
            </button>
          )}
        </div>

        {/* Approval authority */}
        <div>
          <label className="label">Who approves milestone proof?</label>
          <p className="mb-3 text-xs text-[var(--text-tertiary)]">
            Funds only release when the approver(s) accept the proof. Rejections send it back to
            you with notes.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {allowedApprovalModels(kind)
              .map((value) => ({ value, ...APPROVAL_OPTION_META[value] }))
              .map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setApprovalModel(opt.value);
                  setApprovalTouched(true);
                }}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                  approvalModel === opt.value
                    ? "border-[var(--brand-primary)]/60 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                    : "border-[var(--border-primary)] bg-[var(--bg-faint)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span className="block font-medium">{opt.label}</span>
                <span className="block text-xs opacity-70">{opt.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">{defaultApprovalForKind(kind).rationale}</p>

          {needsReviewers && (
            <div className="mt-4 space-y-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-faint)] p-4">
              <label className="label">Reviewer wallet addresses</label>
              {reviewers.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input flex-1 font-mono text-sm"
                    placeholder="0x…"
                    value={r}
                    onChange={(e) =>
                      setReviewers((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                  />
                  {reviewers.length > 1 && (
                    <button
                      type="button"
                      className="shrink-0 text-[var(--text-tertiary)] hover:text-red-600"
                      onClick={() => setReviewers((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {reviewers.length < MAX_REVIEWERS && (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => setReviewers((prev) => [...prev, ""])}
                >
                  + Add reviewer
                </button>
              )}
              <div className="flex items-center gap-3 pt-2">
                <label className="label mb-0">Approvals required to release</label>
                <select
                  className="input w-24"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                >
                  {Array.from({ length: Math.max(cleanReviewers.length, 1) }, (_, i) => i + 1).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ),
                  )}
                </select>
                <span className="text-xs text-[var(--text-tertiary)]">
                  of {cleanReviewers.length || "?"} reviewer{cleanReviewers.length === 1 ? "" : "s"}
                  {threshold > 1 ? " (committee)" : ""}
                </span>
              </div>
              {reviewerError && <p className="text-xs text-amber-700">{reviewerError}</p>}
            </div>
          )}

          {needsWeighted && (
            <div className="mt-4 space-y-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-faint)] p-4">
              <div className="flex items-center gap-3">
                <label className="label mb-0">Approval threshold</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="input w-24"
                  value={weightedThreshold}
                  onChange={(e) => setWeightedThreshold(Number(e.target.value))}
                />
                <span className="text-xs text-[var(--text-tertiary)]">% of donated weight</span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">
                Any donor can vote to approve or reject submitted proof. A milestone releases once
                donors representing at least {weightedThreshold || 0}% of this campaign&apos;s
                raised funds have approved it — a $100 donor&apos;s vote counts for more than a $10
                donor&apos;s. No single donor&apos;s vote counts for more than half the vote weight,
                and at least two distinct donors must approve — but a large campaign with only a
                handful of donors is still easier to concentrate than one with many.
              </p>
              <p className="text-xs text-amber-700">
                A creator who controls a majority of donated weight across two or more wallets can
                still approve their own milestone. For high-value or institutional campaigns,
                consider Designated reviewers instead — an explicit, named committee is harder to
                game than open donor weight.
              </p>
              {weightedError && <p className="text-xs text-amber-700">{weightedError}</p>}
            </div>
          )}
        </div>

        {/* On-chain creation limits, surfaced before the wallet ever opens */}
        {isConnected && capReached && (
          <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            You&apos;ve used your {FREE_CAMPAIGNS} campaigns as a new creator. To launch more,
            request creator approval from the Covenant team.
          </p>
        )}
        {isConnected && !capReached && inCooldown && (
          <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            New creators can launch one campaign per day. You can create your next campaign{" "}
            {new Date(cooldownEndsMs).toLocaleString()}.
          </p>
        )}

        {/* Submit */}
        {isConnected ? (
          <button
            className="btn-primary w-full"
            onClick={submit}
            disabled={!formValid || creationBlocked || isPending || isConfirming}
          >
            {!writeEnabled
              ? "USDC deployment required"
              : isPending || isConfirming
                ? "Creating…"
                : "Create campaign"}
          </button>
        ) : (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button className="btn-primary w-full" onClick={openConnectModal}>
                Connect wallet to create
              </button>
            )}
          </ConnectButton.Custom>
        )}

        <div className="min-h-[1.25rem]">
          <TxFeedback
            isPending={isPending}
            isConfirming={isConfirming}
            isConfirmed={isConfirmed}
            error={error}
            hash={hash}
            successText="Campaign created — redirecting…"
          />
        </div>

        {!formValid && (title || description || milestones.some((m) => m.title)) && (
          <p className="text-xs text-[var(--text-tertiary)]">
            Every milestone needs a title, a success definition and a USDC amount
            {needsReviewers ? ", and reviewer addresses must be valid" : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
