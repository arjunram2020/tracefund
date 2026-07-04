"use client";

import { useChainId } from "wagmi";
import { shortenAddress } from "../lib/format";

const EXPLORERS: Record<number, string> = {
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",
};

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

/**
 * Compact transaction status line shared by every write panel:
 * idle → pending (wallet) → confirming (mined-pending) → confirmed / error.
 */
export function TxFeedback({
  isPending,
  isConfirming,
  isConfirmed,
  error,
  hash,
  successText = "Confirmed on-chain.",
}: {
  isPending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  error?: Error | null;
  hash?: `0x${string}`;
  successText?: string;
}) {
  const chainId = useChainId();
  const explorer = EXPLORERS[chainId];

  if (error) {
    const msg =
      // Surface the human-readable revert reason when present.
      (error as any)?.shortMessage || error.message || "Transaction failed.";
    return (
      <p className="flex items-start gap-2 text-sm text-[var(--text-danger)]">
        <span aria-hidden>✕</span>
        <span className="break-words">{msg}</span>
      </p>
    );
  }

  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-warning)]">
        <Spinner /> Confirm in your wallet…
      </p>
    );
  }

  if (isConfirming) {
    return (
      <p className="flex items-center gap-2 text-sm text-sky-700">
        <Spinner /> Waiting for confirmation…
      </p>
    );
  }

  if (isConfirmed) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--brand-primary)]">
        <span aria-hidden>✓</span> {successText}
        {hash && explorer && (
          <a
            href={`${explorer}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
          >
            {shortenAddress(hash, 6)}
          </a>
        )}
      </p>
    );
  }

  return null;
}
