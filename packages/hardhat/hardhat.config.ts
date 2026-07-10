import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// Optional deployer key for public networks. Local dev does not need it.
// Validate and normalize it so a paste mistake (missing 0x, a truncated key, or
// a seed phrase pasted into the key field) fails loudly here instead of
// producing a deploy from the wrong/no signer.
function loadDeployerAccounts(): string[] {
  const raw = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!raw) return [];
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.warn(
      "[hardhat] DEPLOYER_PRIVATE_KEY is set but is not a valid 32-byte hex key " +
        "(expected 0x + 64 hex chars). Ignoring it — public-network deploys will have no signer.",
    );
    return [];
  }
  return [key];
}
const accounts = loadDeployerAccounts();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Local in-process network used for tests.
    hardhat: {},
    // Local standalone node started with `yarn chain`.
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Base Sepolia testnet (for safe pre-production testing).
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts,
    },
    // Base Mainnet — the production deployment target (see PRD §9).
    // Ethereum mainnet is intentionally not configured: Covenant is Base-only,
    // and an L1 deploy would cost ~100x in gas for no benefit.
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
};

export default config;
