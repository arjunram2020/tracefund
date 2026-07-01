"use client";

import { useEffect, useState } from "react";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { Campaign } from "../lib/types";
import { formatEth } from "../lib/format";
import { useCovenantWrite } from "../hooks/useCovenant";
import { TxFeedback } from "./TxFeedback";

// Safe demo values from PRD §9 — tiny real-ETH amounts.
const QUICK = ["0.0001", "0.0002", "0.0005"];

export function DonationPanel({
  campaign,
  onSuccess,
}: {
  campaign: Campaign;
  onSuccess?: () => void;
}) {
  const { isConnected } = useAccount();
  const [amount, setAmount] = useState("");
  const { execute, refresh, isPending, isConfirming, isConfirmed, error, hash } =
    useCovenantWrite();

  useEffect(() => {
    if (isConfirmed) {
      setAmount("");
      refresh();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  // On-chain donation cap (mirrors Covenant.donate): the total raised may
  // never exceed the campaign goal.
  const remaining =
    campaign.goalAmount > campaign.totalRaised
      ? campaign.goalAmount - campaign.totalRaised
      : 0n;
  const goalReached = remaining === 0n;

  let parsed: bigint | null = null;
  try {
    parsed = amount ? parseEther(amount) : null;
  } catch {
    parsed = null;
  }

  // Reason the current amount can't be donated (null = OK to donate).
  let capError: string | null = null;
  if (parsed !== null && parsed > 0n) {
    if (goalReached) {
      capError = "This campaign has already reached its goal.";
    } else if (parsed > remaining) {
      capError = `Only ${formatEth(remaining)} ETH left before the goal is reached.`;
    }
  }

  const valid = parsed !== null && parsed > 0n && !goalReached && parsed <= remaining;

  // Quick-pick presets that actually satisfy the goal cap.
  const quickOptions = QUICK.filter((q) => {
    try {
      const v = parseEther(q);
      return v > 0n && !goalReached && v <= remaining;
    } catch {
      return false;
    }
  });

  const donate = async () => {
    if (!valid || parsed === null) return;
    try {
      await execute("donate", [campaign.id], parsed);
    } catch {
      /* error surfaced via TxFeedback */
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-white">Donate into escrow</h3>
        <span className="pill bg-brand-500/10 text-brand-300">ETH locked on-chain</span>
      </div>

      {!campaign.active ? (
        <p className="rounded-xl bg-white/5 px-4 py-3 text-sm text-gray-400">
          This campaign is {campaign.completed ? "completed" : "closed"} and no longer accepting
          donations.
        </p>
      ) : goalReached ? (
        <p className="rounded-xl bg-white/5 px-4 py-3 text-sm text-gray-400">
          This campaign has reached its {formatEth(campaign.goalAmount)} ETH goal and is no longer
          accepting donations.
        </p>
      ) : (
        <>
          {quickOptions.length > 0 && (
            <div className="mb-3 flex gap-2">
              {quickOptions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(q)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                    amount === q
                      ? "border-brand-500/50 bg-brand-500/10 text-brand-300"
                      : "border-canvas-border text-gray-400 hover:text-white"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <label className="label">Amount (ETH)</label>
          <div className="flex gap-2">
            <input
              className="input"
              inputMode="decimal"
              placeholder="0.0001"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>

          {/* The on-chain limit, shown up front so users don't hit a revert. */}
          <p className="mt-2 text-xs text-gray-500">
            <span className="text-gray-400">{formatEth(remaining)} ETH</span> left to goal.
          </p>

          {capError && <p className="mt-1 text-xs text-amber-400">{capError}</p>}

          <div className="mt-4">
            {isConnected ? (
              <button
                className="btn-primary w-full"
                onClick={donate}
                disabled={!valid || isPending || isConfirming}
              >
                {isPending || isConfirming
                  ? "Donating…"
                  : valid
                    ? `Donate ${formatEth(parsed!)} ETH`
                    : "Enter an amount"}
              </button>
            ) : (
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button className="btn-primary w-full" onClick={openConnectModal}>
                    Connect wallet to donate
                  </button>
                )}
              </ConnectButton.Custom>
            )}
          </div>

          <div className="mt-3 min-h-[1.25rem]">
            <TxFeedback
              isPending={isPending}
              isConfirming={isConfirming}
              isConfirmed={isConfirmed}
              error={error}
              hash={hash}
              successText="Donation locked in escrow."
            />
          </div>

          <p className="mt-2 text-xs text-gray-500">
            Funds are held by the Covenant contract and only released to the creator milestone by
            milestone, once each milestone is funded and its on-chain proof is posted.
          </p>
        </>
      )}
    </div>
  );
}
