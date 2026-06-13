"use client";

import { useReadChain } from "../hooks/useTraceFund";
import { deployedChainIds } from "../lib/contract";

const CHAIN_NAMES: Record<number, string> = {
  31337: "Hardhat localhost",
  84532: "Base Sepolia",
  8453: "Base Mainnet",
  1: "Ethereum Mainnet",
};

/**
 * Friendly banner shown when TraceFund has no deployment on the resolved chain
 * (e.g. the wallet is on an unsupported network).
 */
export function ContractNotice() {
  const { deployed, chainId } = useReadChain();
  if (deployed) return null;

  const supported = deployedChainIds
    .map((id) => CHAIN_NAMES[id] ?? `chain ${id}`)
    .join(", ");

  return (
    <div className="card border-amber-500/30 bg-amber-500/[0.06] p-4 text-sm text-amber-200">
      <p className="font-medium">
        TraceFund isn&apos;t deployed on {CHAIN_NAMES[chainId] ?? `chain ${chainId}`}.
      </p>
      <p className="mt-1 text-amber-200/80">
        Switch your wallet to a supported network: <strong>{supported}</strong>.
      </p>
    </div>
  );
}
