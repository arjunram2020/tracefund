"use client";

import { useReadChain } from "../hooks/useCovenant";
import { deployedChainIds } from "../lib/contract";

const CHAIN_NAMES: Record<number, string> = {
  31337: "Hardhat localhost",
  84532: "Base Sepolia",
  8453: "Base Mainnet",
  1: "Ethereum Mainnet",
};

/**
 * Friendly banner shown when Covenant has no deployment on the resolved chain
 * (e.g. the wallet is on an unsupported network).
 */
export function ContractNotice() {
  const { deployed, chainId } = useReadChain();
  if (deployed) return null;

  const supported = deployedChainIds
    .map((id) => CHAIN_NAMES[id] ?? `chain ${id}`)
    .join(", ");

  return (
    <div className="card border-amber-600/30 bg-amber-600/[0.06] p-4 text-sm text-amber-200">
      <p className="font-medium">
        Covenant isn&apos;t deployed on {CHAIN_NAMES[chainId] ?? `chain ${chainId}`}.
      </p>
      <p className="mt-1 text-amber-700/90">
        Switch your wallet to a supported network: <strong>{supported}</strong>.
      </p>
    </div>
  );
}
