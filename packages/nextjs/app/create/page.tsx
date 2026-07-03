"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseUnits } from "viem";
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

const MIN_MILESTONES = 3;
// Must match Covenant.sol MAX_MILESTONES — the contract reverts above this.
const MAX_MILESTONES = 5;

const DEMO = {
  title: "Community Medical Relief Fund",
  description:
    "A transparent emergency fundraiser where donations unlock in equal tranches. Each withdrawal requires on-chain proof of how the previous funds were used.",
  mode: "even" as "even" | "manual",
  totalGoal: "0.5",
  milestoneCount: 3,
  descriptions: [
    "Hospital deposit — receipt posted on-chain",
    "Medication purchase — purchase proof submitted",
    "Follow-up appointment — confirmation uploaded",
  ],
  amounts: ["", "", ""],
};

function safeParse(amount: string): bigint | null {
  try {
    return amount ? parseUnits(amount, USDC_DECIMALS) : null;
  } catch {
    return null;
  }
}

// Mirrors Covenant.sol's anti-spam constants (FREE_CAMPAIGNS, CREATION_COOLDOWN).
const FREE_CAMPAIGNS = 2;
const CREATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export default function CreateCampaignPage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { writeEnabled } = useReadChain();
  const { count } = useCampaignCount();
  const predictedId = useRef<bigint | null>(null);

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
  const [mode, setMode] = useState<"even" | "manual">("even");

  // Even split state
  const [totalGoal, setTotalGoal] = useState("");
  const [milestoneCount, setMilestoneCount] = useState(3);

  // Shared: per-milestone descriptions + manual amounts
  const [descriptions, setDescriptions] = useState<string[]>(["", "", ""]);
  const [amounts, setAmounts] = useState<string[]>(["", "", ""]);

  const { execute, refresh, isPending, isConfirming, isConfirmed, error, hash } =
    useCovenantWrite();

  // Keep descriptions + amounts arrays in sync with milestoneCount (even mode)
  useEffect(() => {
    if (mode !== "even") return;
    setDescriptions((prev) => {
      if (prev.length === milestoneCount) return prev;
      return prev.length < milestoneCount
        ? [...prev, ...Array(milestoneCount - prev.length).fill("")]
        : prev.slice(0, milestoneCount);
    });
    setAmounts((prev) => {
      if (prev.length === milestoneCount) return prev;
      return prev.length < milestoneCount
        ? [...prev, ...Array(milestoneCount - prev.length).fill("")]
        : prev.slice(0, milestoneCount);
    });
  }, [milestoneCount, mode]);

  useEffect(() => {
    if (isConfirmed && predictedId.current !== null) {
      refresh();
      router.push(`/campaigns/${predictedId.current.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  // Derived values
  const parsedGoal = safeParse(totalGoal);
  const amountEach = parsedGoal && milestoneCount > 0 ? parsedGoal / BigInt(milestoneCount) : null;

  // In manual mode, compute totalGoal from sum of amounts
  const parsedAmounts = amounts.map(safeParse);
  const manualTotal =
    mode === "manual" && parsedAmounts.every((a) => a !== null && a > 0n)
      ? parsedAmounts.reduce((s, a) => s! + a!, 0n as bigint)
      : null;

  // Per-milestone amounts array to pass to contract
  const finalAmounts: bigint[] | null = (() => {
    if (mode === "even") {
      if (!amountEach || !parsedGoal) return null;
      const n = milestoneCount;
      return Array.from({ length: n }, (_, i) =>
        i === n - 1 ? parsedGoal - amountEach * BigInt(n - 1) : amountEach,
      );
    } else {
      if (parsedAmounts.some((a) => a === null || a <= 0n)) return null;
      return parsedAmounts as bigint[];
    }
  })();

  const titleValid = title.trim().length > 0;
  const descValid = description.trim().length > 0;
  const goalValid = mode === "even" ? (parsedGoal !== null && parsedGoal > 0n) : manualTotal !== null;
  const descsValid = descriptions.every((d) => d.trim().length > 0);
  const formValid = titleValid && descValid && goalValid && descsValid && finalAmounts !== null;

  const submit = async () => {
    if (!formValid || !finalAmounts) return;
    predictedId.current = count;
    try {
      await execute("createCampaign", [
        title.trim(),
        description.trim(),
        descriptions.map((d) => d.trim()),
        finalAmounts,
      ]);
    } catch {
      /* surfaced via TxFeedback */
    }
  };

  const loadDemo = () => {
    setTitle(DEMO.title);
    setDescription(DEMO.description);
    setMode(DEMO.mode);
    setTotalGoal(DEMO.totalGoal);
    setMilestoneCount(DEMO.milestoneCount);
    setDescriptions(DEMO.descriptions);
    setAmounts(DEMO.amounts);
  };

  const addMilestone = () => {
    setDescriptions((prev) => [...prev, ""]);
    setAmounts((prev) => [...prev, ""]);
  };

  const removeMilestone = (i: number) => {
    setDescriptions((prev) => prev.filter((_, idx) => idx !== i));
    setAmounts((prev) => prev.filter((_, idx) => idx !== i));
  };

  // Cumulative thresholds for display
  const cumulativeTargets: string[] = (() => {
    if (mode === "even") {
      return descriptions.map((_, i) => {
        if (!amountEach) return "?";
        const n = milestoneCount;
        const cum = i === n - 1
          ? parsedGoal! - amountEach * BigInt(n - 1) + amountEach * BigInt(i)
          : amountEach * BigInt(i + 1);
        return formatUsdc(cum);
      });
    } else {
      let running = 0n;
      return parsedAmounts.map((a) => {
        if (a === null) return "?";
        running += a;
        return formatUsdc(running);
      });
    }
  })();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Create a campaign</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Set milestone amounts — funds unlock in tranches as each milestone is proven.
          </p>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={loadDemo}>
          Use demo campaign
        </button>
      </div>

      <div className="mb-6">
        <ContractNotice />
      </div>

      <div className="card space-y-5 p-6">
        {!writeEnabled && (
          <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            Campaign creation is only enabled on USDC-compatible Covenant deployments. The current
            Base Mainnet contract is still the older ETH version, so this form stays read-only until
            the USDC contract is redeployed and exported to the frontend.
          </p>
        )}

        {/* Title */}
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            placeholder="Community Medical Relief Fund"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <textarea
            className="input min-h-[90px] resize-y"
            placeholder="What is this fundraiser for, and how will milestones prove progress?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Mode toggle */}
        <div>
          <label className="label">Milestone amounts</label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                mode === "even"
                  ? "border-[var(--brand-primary)]/60 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                  : "border-[var(--border-primary)] bg-[var(--bg-faint)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              onClick={() => setMode("even")}
            >
              Even split
            </button>
            <button
              type="button"
              className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                mode === "manual"
                  ? "border-[var(--brand-primary)]/60 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                  : "border-[var(--border-primary)] bg-[var(--bg-faint)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              onClick={() => {
                setMode("manual");
                // migrate descriptions length into manual mode
                setAmounts(Array(descriptions.length).fill(""));
              }}
            >
              Set manually
            </button>
          </div>
        </div>

        {/* Even split controls */}
        {mode === "even" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Total goal (USDC)</label>
              <input
                className="input font-mono"
                inputMode="decimal"
                placeholder="e.g. 0.10"
                value={totalGoal}
                onChange={(e) => setTotalGoal(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </div>
            <div>
              <label className="label">Number of milestones</label>
              <select
                className="input"
                value={milestoneCount}
                onChange={(e) => setMilestoneCount(Number(e.target.value))}
              >
                {Array.from({ length: MAX_MILESTONES - MIN_MILESTONES + 1 }, (_, i) => i + MIN_MILESTONES).map((n) => (
                  <option key={n} value={n}>
                    {n} milestones
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Even split preview */}
        {mode === "even" && amountEach !== null && amountEach > 0n && (
          <div className="flex items-center justify-between rounded-xl bg-[var(--bg-faint)] px-4 py-3">
            <span className="text-sm text-[var(--text-secondary)]">Each milestone unlocks</span>
            <span className="font-mono text-lg font-semibold text-[var(--brand-primary)]">
              {formatUsdc(amountEach)} USDC
            </span>
          </div>
        )}

        {/* Manual total preview */}
        {mode === "manual" && manualTotal !== null && (
          <div className="flex items-center justify-between rounded-xl bg-[var(--bg-faint)] px-4 py-3">
            <span className="text-sm text-[var(--text-secondary)]">Total goal</span>
            <span className="font-mono text-lg font-semibold text-[var(--brand-primary)]">
              {formatUsdc(manualTotal)} USDC
            </span>
          </div>
        )}

        {/* Milestone rows */}
        <div>
          <label className="label">Milestones</label>
          <p className="mb-3 text-xs text-[var(--text-tertiary)]">
            To unlock milestone N, the creator must first post on-chain proof for milestone N−1.
          </p>
          <div className="space-y-2">
            {descriptions.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-xs font-bold text-[var(--text-secondary)]">
                  {i + 1}
                </div>
                <input
                  className="input flex-1"
                  placeholder={`What milestone ${i + 1} delivers`}
                  value={d}
                  onChange={(e) => {
                    const next = [...descriptions];
                    next[i] = e.target.value;
                    setDescriptions(next);
                  }}
                />
                {mode === "manual" && (
                  <input
                    className="input w-28 font-mono"
                    inputMode="decimal"
                    placeholder="USDC"
                    value={amounts[i] ?? ""}
                    onChange={(e) => {
                      const next = [...amounts];
                      next[i] = e.target.value.replace(/[^0-9.]/g, "");
                      setAmounts(next);
                    }}
                  />
                )}
                <span className="w-24 shrink-0 text-right font-mono text-xs text-[var(--text-tertiary)]">
                  at {cumulativeTargets[i]} USDC
                </span>
                {mode === "manual" && descriptions.length > MIN_MILESTONES && (
                  <button
                    type="button"
                    className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-danger)]"
                    onClick={() => removeMilestone(i)}
                    title="Remove milestone"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {mode === "manual" && descriptions.length < MAX_MILESTONES && (
            <button
              type="button"
              className="btn-ghost mt-3 text-xs"
              onClick={addMilestone}
            >
              + Add milestone
            </button>
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

        {!formValid &&
          (title || description || totalGoal || descriptions.some((d) => d)) && (
            <p className="text-xs text-[var(--text-tertiary)]">
              Provide a title, description,{" "}
              {mode === "even" ? "total goal and milestone count" : "a USDC amount for every milestone"},{" "}
              and a description for every milestone.
            </p>
          )}
      </div>
    </div>
  );
}
