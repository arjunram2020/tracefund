"use client";

import { useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import { shortenAddress } from "../lib/format";

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
  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
    query: { enabled: !!address },
  });

  if (!address) return <span className={className}>—</span>;
  const display = ensName ?? (short ? shortenAddress(address) : address);

  return (
    <span className={`font-mono ${className}`} title={address}>
      {display}
    </span>
  );
}
