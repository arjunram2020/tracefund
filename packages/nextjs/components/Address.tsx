"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { shortenAddress } from "../lib/format";

// ENS names live on Ethereum L1, but Covenant's wallet config is Base-only
// (chain 1 is excluded so users can never sign at L1 gas prices). Resolve
// names through this standalone read-only client instead of the wagmi config.
let ensClient: ReturnType<typeof createPublicClient> | undefined;
function getEnsClient() {
  ensClient ??= createPublicClient({
    chain: mainnet,
    transport: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL),
  });
  return ensClient;
}

function useEnsNameReadOnly(address?: `0x${string}`) {
  return useQuery({
    queryKey: ["ensName", address],
    queryFn: () => getEnsClient().getEnsName({ address: address! }),
    enabled: !!address,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Renders an address, preferring its ENS name when available (PRD §21 ENS).
 */
export function Address({
  address,
  className = "",
  short = true,
}: {
  address?: `0x${string}`;
  className?: string;
  short?: boolean;
}) {
  const { data: ensName } = useEnsNameReadOnly(address);

  if (!address) return <span className={className}>—</span>;
  const display = ensName ?? (short ? shortenAddress(address) : address);

  return (
    <span className={`font-mono ${className}`} title={address}>
      {display}
    </span>
  );
}
