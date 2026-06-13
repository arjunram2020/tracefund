"use client";

import { useReadChain } from "../hooks/useTraceFund";

/**
 * Friendly banner shown when TraceFund has no deployment on the resolved chain
 * (e.g. the local node isn't running, or the wallet is on an unsupported network).
 */
export function ContractNotice() {
  const { deployed, chainId } = useReadChain();
  if (deployed) return null;

  return (
    <div className="card border-amber-500/30 bg-amber-500/[0.06] p-4 text-sm text-amber-200">
      <p className="font-medium">TraceFund isn&apos;t deployed on chain {chainId}.</p>
      <p className="mt-1 text-amber-200/80">
        Start the local chain and deploy: <code className="font-mono">yarn chain</code> then{" "}
        <code className="font-mono">yarn deploy</code> (and <code className="font-mono">yarn seed</code>{" "}
        for the demo campaign). Or switch your wallet to a network with a deployment.
      </p>
    </div>
  );
}
