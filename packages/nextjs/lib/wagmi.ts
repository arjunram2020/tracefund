import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { base, baseSepolia, hardhat, mainnet } from "wagmi/chains";
import type { Chain } from "viem";
import { defaultChainId } from "./contract";

// A placeholder is fine for local development with an injected wallet (MetaMask).
// Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to enable WalletConnect / mobile wallets
// (required for a second phone/laptop to connect to a hosted demo).
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "covenant_local_demo";

// Every network Covenant can target. The actual default is chosen below.
const ALL_CHAINS: Chain[] = [base, baseSepolia, mainnet, hardhat];

// Per-chain RPC overrides. The built-in public RPCs (e.g. https://mainnet.base.org)
// work but are rate-limited; a hosted multi-device demo should point at a dedicated
// endpoint (Alchemy/Infura/etc.) so reads stay reliable across devices.
const RPC_OVERRIDES: Record<number, string | undefined> = {
  [base.id]: process.env.NEXT_PUBLIC_BASE_RPC_URL,
  [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
  [mainnet.id]: process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
};

// Put the configured default chain (NEXT_PUBLIC_DEFAULT_CHAIN_ID, e.g. 8453 = Base)
// first so the wallet modal and RainbowKit's initial chain prefer it.
const ordered = [
  ...ALL_CHAINS.filter((c) => c.id === defaultChainId),
  ...ALL_CHAINS.filter((c) => c.id !== defaultChainId),
] as [Chain, ...Chain[]];

const transports = Object.fromEntries(ALL_CHAINS.map((c) => [c.id, http(RPC_OVERRIDES[c.id])]));

export const config = getDefaultConfig({
  appName: "Covenant",
  projectId,
  chains: ordered,
  transports,
  ssr: true,
});
