import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia, hardhat, mainnet } from "wagmi/chains";

// A placeholder is fine for local development with an injected wallet (MetaMask).
// Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to enable WalletConnect / mobile wallets.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "tracefund_local_demo";

export const config = getDefaultConfig({
  appName: "TraceFund",
  projectId,
  // Local Hardhat first for the demo; Base is the first production target (PRD §9).
  chains: [hardhat, base, baseSepolia, mainnet],
  ssr: true,
});
