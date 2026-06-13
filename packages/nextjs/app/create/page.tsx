"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useCampaignCount, useTraceFundWrite } from "../../hooks/useTraceFund";
import { TxFeedback } from "../../components/TxFeedback";
import { ContractNotice } from "../../components/ContractNotice";
import { formatEth } from "../../lib/format";

interface MilestoneInput {
  description: string;
  amount: string;
}

const MAX = 5;

const DEMO = {
  title: "Community Medical Relief Fund",
  description:
    "A transparent emergency fundraiser where donations unlock only after milestone proof is submitted and donors approve the release.",
  milestones: [
    { description: "Hospital deposit receipt", amount: "0.02" },
    { description: "Medication purchase receipt", amount: "0.015" },
    { description: "Follow-up appointment confirmation", amount: "0.015" },
  ],
};

function safeParse(amount: string): bigint | null {
  try {
    return amount ? parseEther(amount) : null;
  } catch {
    return null;
  }
}

export default function CreateCampaignPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { count } = useCampaignCount();
  const predictedId = useRef<bigint | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [milestones, setMilestones] = useState<MilestoneInput[]>([
    { description: "", amount: "" },
  ]);

  const { execute, refresh, isPending, isConfirming, isConfirmed, error, hash } =
    useTraceFundWrite();

  useEffect(() => {
    if (isConfirmed && predictedId.current !== null) {
      refresh();
      router.push(`/campaigns/${predictedId.current.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  const updateMilestone = (i: number, patch: Partial<MilestoneInput>) =>
    setMilestones((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const addMilestone = () =>
    setMilestones((prev) => (prev.length < MAX ? [...prev, { description: "", amount: "" }] : prev));

  const removeMilestone = (i: number) =>
    setMilestones((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const parsedAmounts = milestones.map((m) => safeParse(m.amount));
  const total = parsedAmounts.reduce<bigint>((acc, v) => acc + (v ?? 0n), 0n);

  const titleValid = title.trim().length > 0;
  const descValid = description.trim().length > 0;
  const milestonesValid =
    milestones.length >= 1 &&
    milestones.length <= MAX &&
    milestones.every((m, i) => m.description.trim().length > 0 && (parsedAmounts[i] ?? 0n) > 0n);
  const formValid = titleValid && descValid && milestonesValid;

  const submit = async () => {
    if (!formValid) return;
    predictedId.current = count; // the new campaign id == current count
    const descs = milestones.map((m) => m.description.trim());
    const amts = parsedAmounts.map((v) => v ?? 0n);
    try {
      await execute("createCampaign", [title.trim(), description.trim(), descs, amts]);
    } catch {
      /* surfaced via TxFeedback */
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Create a campaign</h1>
          <p className="mt-1 text-sm text-gray-400">
            Define milestones with amounts. The goal is the sum of all milestones.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => {
            setTitle(DEMO.title);
            setDescription(DEMO.description);
            setMilestones(DEMO.milestones);
          }}
        >
          Use demo campaign
        </button>
      </div>

      <div className="mb-6">
        <ContractNotice />
      </div>

      <div className="card space-y-5 p-6">
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            placeholder="Community Medical Relief Fund"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            className="input min-h-[90px] resize-y"
            placeholder="What is this fundraiser for, and how will milestones prove progress?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label mb-0">Milestones ({milestones.length}/{MAX})</label>
            <button
              type="button"
              className="text-xs font-medium text-brand-400 hover:text-brand-300 disabled:opacity-40"
              onClick={addMilestone}
              disabled={milestones.length >= MAX}
            >
              + Add milestone
            </button>
          </div>

          <div className="space-y-3">
            {milestones.map((m, i) => (
              <div key={i} className="rounded-xl border border-canvas-border/60 bg-canvas-soft/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">Milestone {i + 1}</span>
                  {milestones.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-gray-500 hover:text-red-400"
                      onClick={() => removeMilestone(i)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                  <input
                    className="input"
                    placeholder="Hospital deposit receipt"
                    value={m.description}
                    onChange={(e) => updateMilestone(i, { description: e.target.value })}
                  />
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="ETH e.g. 0.02"
                    value={m.amount}
                    onChange={(e) =>
                      updateMilestone(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Goal summary */}
        <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
          <span className="text-sm text-gray-400">Total goal</span>
          <span className="font-mono text-lg font-semibold text-brand-300">
            {formatEth(total)} ETH
          </span>
        </div>

        {/* Submit */}
        {isConnected ? (
          <button
            className="btn-primary w-full"
            onClick={submit}
            disabled={!formValid || isPending || isConfirming}
          >
            {isPending || isConfirming ? "Creating…" : "Create campaign"}
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

        {!formValid && (title || description || milestones.some((m) => m.description || m.amount)) && (
          <p className="text-xs text-gray-500">
            Provide a title, a description, and at least one milestone with a description and an
            amount greater than zero.
          </p>
        )}
      </div>
    </div>
  );
}
