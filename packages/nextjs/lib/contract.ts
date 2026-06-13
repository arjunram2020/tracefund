import type { Abi } from "viem";
import deployed from "../contracts/deployedContracts.json";

type Entry = { address: `0x${string}`; abi: Abi; deployBlock?: number };
const data = deployed as unknown as Record<string, { TraceFund: Entry }>;

/** Chain ids that have a TraceFund deployment recorded by the deploy script. */
export const deployedChainIds: number[] = Object.keys(data).map(Number);

/** The contract address + abi for a given chain, if deployed there. */
export function getTraceFund(chainId?: number): Entry | undefined {
  if (chainId == null) return undefined;
  return data[String(chainId)]?.TraceFund;
}

/** ABI is identical across networks — grab whichever deployment exists first. */
export const traceFundAbi: Abi = (Object.values(data)[0]?.TraceFund.abi as Abi) ?? [];

/** Block the contract was deployed at, so event scans don't start from genesis. */
export function getDeployBlock(chainId?: number): bigint {
  const block = chainId != null ? data[String(chainId)]?.TraceFund.deployBlock : undefined;
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
  if (connectedChainId != null && getTraceFund(connectedChainId)) return connectedChainId;
  return defaultChainId;
}
