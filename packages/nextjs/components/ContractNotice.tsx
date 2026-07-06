"use client";

import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useReadChain } from "../hooks/useCovenant";
import { activeChainIds, getUsdcAddress } from "../lib/contract";

const CHAIN_NAMES: Record<number, string> = {
  31337: "Hardhat localhost",
  84532: "Base Sepolia",
  8453: "Base Mainnet",
};

/**
 * Friendly banner shown when Covenant has no deployment on the resolved chain
 * (e.g. the wallet is on an unsupported network), or when the deployment is
 * present but unusable because its settlement token doesn't exist on-chain.
 */
export function ContractNotice() {
  const { connectedChainId, connectedMode, chainId, mode } = useReadChain();

  // ABI shape alone can't tell a working deployment from a bricked one: the
  // USDC address is immutable in Covenant, and if nothing is deployed at it
  // every donate()/release reverts. Verify the token has bytecode on-chain.
  const client = usePublicClient({ chainId });
  const usdcAddress = getUsdcAddress(chainId);
  const { data: usdcHasCode } = useQuery({
    queryKey: ["usdcBytecode", chainId, usdcAddress],
    queryFn: async () => {
      const code = await client!.getCode({ address: usdcAddress! });
      return !!code && code !== "0x";
    },
    enabled: mode === "active" && !!client && !!usdcAddress,
    staleTime: Infinity,
    retry: 1,
  });

  if (mode === "active" && usdcHasCode === false) {
    return (
      <div className="card border-red-600/30 bg-red-600/[0.06] p-4 text-sm text-red-200">
        <p className="font-medium">
          This Covenant deployment is misconfigured: no USDC token exists at{" "}
          <span className="font-mono">{usdcAddress}</span> on{" "}
          {CHAIN_NAMES[chainId] ?? `chain ${chainId}`}.
        </p>
        <p className="mt-1 text-red-700/90">
          The token address is baked into the contract at deploy time, so donations and milestone
          releases will revert until Covenant is redeployed against the real USDC token.
        </p>
      </div>
    );
  }

  if (connectedChainId != null && connectedMode === "legacy") {
    return (
      <div className="card border-amber-600/30 bg-amber-600/[0.06] p-4 text-sm text-amber-200">
        <p className="font-medium">
          Base Mainnet is still pointing at a legacy ETH Covenant deployment.
        </p>
        <p className="mt-1 text-amber-700/90">
          The current app only writes to USDC-compatible Covenant contracts, so create, donate, and
          proof submissions are disabled on this network until the USDC version is redeployed.
        </p>
      </div>
    );
  }
  if (mode !== "missing") return null;

  const supported = activeChainIds
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
