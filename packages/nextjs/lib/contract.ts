import type { Abi } from "viem";
import deployed from "../contracts/deployedContracts.json";

type Entry = { address: `0x${string}`; abi: Abi; deployBlock?: number };
const data = deployed as unknown as Record<
  string,
  { Covenant: Entry; USDC?: { address: `0x${string}` } }
>;

// Canonical USDC per chain, used when the deploy script hasn't recorded one
// (e.g. a deployment made before USDC support). Local chains always record
// their MockUSDC address at deploy time.
const CANONICAL_USDC: Record<number, `0x${string}`> = {
  8453: "0x833589fCB6e61e26Ee7660cE1c83E66bC46d47c9", // Base Mainnet (native USDC)
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia (Circle testnet USDC)
};

/** The USDC token Covenant settles in on a given chain, if known. */
export function getUsdcAddress(chainId?: number): `0x${string}` | undefined {
  if (chainId == null) return undefined;
  return data[String(chainId)]?.USDC?.address ?? CANONICAL_USDC[chainId];
}

/** Chain ids that have a Covenant deployment recorded by the deploy script. */
export const deployedChainIds: number[] = Object.keys(data).map(Number);

/** The contract address + abi for a given chain, if deployed there. */
export function getCovenant(chainId?: number): Entry | undefined {
  if (chainId == null) return undefined;
  return data[String(chainId)]?.Covenant;
}

/**
 * ABI for a given chain's deployment. Deployments can lag behind each other
 * (e.g. mainnet running an older contract than localhost), so never assume the
 * ABI is identical across networks — always resolve it per chain.
 */
export function getCovenantAbi(chainId?: number): Abi {
  return getCovenant(chainId)?.abi ?? [];
}

/** Block the contract was deployed at, so event scans don't start from genesis. */
export function getDeployBlock(chainId?: number): bigint {
  const block = chainId != null ? data[String(chainId)]?.Covenant.deployBlock : undefined;
  return BigInt(block ?? 0);
}

/** Default chain to read from when the wallet is on an unsupported network. */
export const defaultChainId: number =
  Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID) || deployedChainIds[0] || 31337;

/**
 * Pick which chain the UI should read from: the connected chain if we have a
 * deployment there, otherwise fall back to the default deployment chain. This
 * lets public viewers browse campaigns without connecting a wallet.
 */
export function resolveReadChainId(connectedChainId?: number): number {
  if (connectedChainId != null && getCovenant(connectedChainId)) return connectedChainId;
  return defaultChainId;
}
