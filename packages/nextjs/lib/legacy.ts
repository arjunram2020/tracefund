import type { Abi } from "viem";
import { formatUnits } from "viem";
import legacy from "../contracts/legacyContract.json";

/**
 * The retired TraceFund/Covenant deployment on Base Mainnet. It predates the
 * USDC migration (amounts are ETH wei) and the auto-release fix, and is kept
 * strictly read-only: the History tab shows its campaigns as a permanent
 * on-chain record, but the app never writes to it.
 */
export const LEGACY_CHAIN_ID: number = legacy.chainId;
export const legacyAddress = legacy.address as `0x${string}`;
export const legacyAbi = legacy.abi as Abi;
export const legacyDeployBlock = BigInt(legacy.deployBlock ?? 0);

/** Legacy campaigns were denominated in ETH (18 decimals), not USDC. */
export function formatLegacyEth(wei: bigint | undefined, maxDigits = 10): string {
  if (wei === undefined) return "0";
  const full = formatUnits(wei, 18);
  if (!full.includes(".")) return full;
  const [whole, frac] = full.split(".");
  const trimmed = frac.slice(0, maxDigits).replace(/0+$/, "");
  return trimmed.length ? `${whole}.${trimmed}` : whole;
}
