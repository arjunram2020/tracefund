import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Chain,
  type PublicClient,
  type WalletClient,
  type Account,
} from "viem";
import type { LoadtestConfig } from "./config.js";

/**
 * Contract wiring — read from the same file the frontend uses
 * (packages/nextjs/contracts/deployedContracts.json), so the harness always
 * hits exactly the deployment the app is pointed at. No separate config to
 * drift out of sync.
 */
const DEPLOYED_PATH = fileURLToPath(
  new URL("../../../nextjs/contracts/deployedContracts.json", import.meta.url),
);

export interface Deployment {
  chain: Chain;
  covenant: { address: `0x${string}`; abi: Abi; deployBlock: bigint };
  usdc: { address: `0x${string}` };
}

export function loadDeployment(cfg: LoadtestConfig): Deployment {
  if (!fs.existsSync(DEPLOYED_PATH)) {
    throw new Error(
      `No deployedContracts.json at ${DEPLOYED_PATH}. Run \`yarn deploy\` against your local chain first.`,
    );
  }
  const json = JSON.parse(fs.readFileSync(DEPLOYED_PATH, "utf8"));
  const entry = json[String(cfg.chainId)];
  if (!entry?.Covenant?.address || !entry?.USDC?.address) {
    throw new Error(
      `deployedContracts.json has no Covenant+USDC entry for chainId ${cfg.chainId}. Run \`yarn deploy\` first (local chain must be running).`,
    );
  }
  const chain = defineChain({
    id: cfg.chainId,
    name: `loadtest-${cfg.chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
  return {
    chain,
    covenant: {
      address: entry.Covenant.address,
      abi: entry.Covenant.abi as Abi,
      deployBlock: BigInt(entry.Covenant.deployBlock ?? 0),
    },
    usdc: { address: entry.USDC.address },
  };
}

// MockUSDC superset of ERC-20 (mint is open — local chains only).
export const USDC_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const satisfies Abi;

export function makePublicClient(cfg: LoadtestConfig, deployment: Deployment): PublicClient {
  return createPublicClient({
    chain: deployment.chain,
    transport: http(cfg.rpcUrl, { timeout: 60_000, retryCount: 0 }),
  });
}

export function makeWalletClient(
  cfg: LoadtestConfig,
  deployment: Deployment,
  account: Account,
): WalletClient {
  return createWalletClient({
    chain: deployment.chain,
    account,
    transport: http(cfg.rpcUrl, { timeout: 60_000, retryCount: 0 }),
  });
}

export const usdc6 = (v: string | number): bigint => {
  const [whole, frac = ""] = String(v).split(".");
  return BigInt(whole || "0") * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
};
