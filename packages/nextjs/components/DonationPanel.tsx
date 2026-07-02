"use client";

import { useEffect, useState } from "react";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { Campaign } from "../lib/types";
import { USDC_DECIMALS, formatUsdc } from "../lib/format";
import { useCovenantWrite, useUsdc } from "../hooks/useCovenant";
import { TxFeedback } from "./TxFeedback";

// Safe demo values from PRD §9 — tiny real-USDC amounts.
const QUICK = ["0.05", "0.1", "0.25"];

export function DonationPanel({
  campaign,
  onSuccess,
}: {
  campaign: Campaign;
  onSuccess?: () => void;
}) {
  const { isConnected, address: account } = useAccount();
  const [amount, setAmount] = useState("");
  const { execute, refresh, isPending, isConfirming, isConfirmed, error, hash } =
    useCovenantWrite();
  const {
    allowance,
    balance,
    approve,
    isApprovePending,
    isApproveConfirming,
    approveError,
  } = useUsdc(account);

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

  // Mirrors the on-chain rule: creators cannot donate to their own campaign.
  const isCreator =
    !!account && account.toLowerCase() === campaign.creator.toLowerCase();

  let parsed: bigint | null = null;
  try {
    parsed = amount ? parseUnits(amount, USDC_DECIMALS) : null;
  } catch {
    parsed = null;
  }

  // Reason the current amount can't be donated (null = OK to donate).
  let capError: string | null = null;
  if (parsed !== null && parsed > 0n) {
    if (goalReached) {
      capError = "This campaign has already reached its goal.";
    } else if (parsed > remaining) {
      capError = `Only ${formatUsdc(remaining)} USDC left before the goal is reached.`;
    } else if (balance !== undefined && parsed > balance) {
      capError = `You only hold ${formatUsdc(balance)} USDC on this network.`;
    }
  }

  const valid =
    parsed !== null &&
    parsed > 0n &&
    !goalReached &&
    parsed <= remaining &&
    (balance === undefined || parsed <= balance);

  // USDC is an ERC-20, so the escrow can only pull funds the donor has
  // approved. When the current allowance doesn't cover the amount, the button
  // becomes an approve step first.
  const needsApproval = valid && allowance !== undefined && allowance < parsed!;
  const approving = isApprovePending || isApproveConfirming;

  // Quick-pick presets that actually satisfy the goal cap.
  const quickOptions = QUICK.filter((q) => {
    try {
      const v = parseUnits(q, USDC_DECIMALS);
      return v > 0n && !goalReached && v <= remaining;
    } catch {
      return false;
    }
  });

  const donate = async () => {
    if (!valid || parsed === null) return;
    try {
      if (needsApproval) {
        await approve(parsed);
        return; // allowance refetches on confirmation; button flips to Donate
      }
      await execute("donate", [campaign.id, parsed]);
    } catch {
      /* error surfaced via TxFeedback */
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-[var(--text-primary)]">Donate into escrow</h3>
        <span className="pill bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">USDC locked on-chain</span>
      </div>

      {!campaign.active ? (
        <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          This campaign is {campaign.completed ? "completed" : "closed"} and no longer accepting
          donations.
        </p>
      ) : goalReached ? (
        <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          This campaign has reached its {formatUsdc(campaign.goalAmount)} USDC goal and is no longer
          accepting donations.
        </p>
      ) : isCreator ? (
        <p className="rounded-xl bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          You cannot donate USDC to your own campaign. Self-donations are blocked on-chain so
          creator reputation only reflects real donor support.
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
                      ? "border-[var(--brand-primary)]/50 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                      : "border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <label className="label">Amount (USDC)</label>
          <div className="flex gap-2">
            <input
              className="input"
              inputMode="decimal"
              placeholder="0.10"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>

          {/* The on-chain goal cap, shown up front so users don't hit a revert. */}
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            <span className="text-[var(--text-secondary)]">{formatUsdc(remaining)} USDC</span> left to goal.
          </p>

          {capError && <p className="mt-1 text-xs text-[var(--text-warning)]">{capError}</p>}

          <div className="mt-4">
            {isConnected ? (
              <button
                className="btn-primary w-full"
                onClick={donate}
                disabled={!valid || isPending || isConfirming || approving}
              >
                {approving
                  ? "Approving USDC…"
                  : isPending || isConfirming
                    ? "Donating…"
                    : !valid
                      ? "Enter an amount"
                      : needsApproval
                        ? `Approve ${formatUsdc(parsed!)} USDC`
                        : `Donate ${formatUsdc(parsed!)} USDC`}
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

          {needsApproval && !approving && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              Step 1 of 2: approve the escrow to pull your USDC, then confirm the donation.
            </p>
          )}

          <div className="mt-3 min-h-[1.25rem]">
            <TxFeedback
              isPending={isPending}
              isConfirming={isConfirming}
              isConfirmed={isConfirmed}
              error={error ?? approveError}
              hash={hash}
              successText="Donation locked in escrow."
            />
          </div>

          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            Funds are held by the Covenant contract and only released to the creator milestone by
            milestone, once each milestone is funded and its on-chain proof is posted.
          </p>
        </>
      )}
    </div>
  );
}
