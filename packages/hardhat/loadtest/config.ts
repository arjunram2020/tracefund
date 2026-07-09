/**
 * Shared configuration for the Covenant wallet-swarm load test.
 * Every knob is env-var driven (matching the existing scripts/ convention of
 * `hardhat run` + env vars rather than argv parsing).
 */

// Both Hardhat's `hardhat node` and Foundry's `anvil` default to this exact
// BIP-39 mnemonic when none is supplied, and unlock their own rich accounts
// at indices 0..N from it. We derive swarm wallets at a large fixed offset so
// they can NEVER collide with those pre-funded node accounts, regardless of
// how many the node happens to unlock.
export const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";
export const DEFAULT_DERIVATION_OFFSET = 10_000;

export const PUBLIC_CHAIN_IDS = new Set([8453, 84532]);

export type Role = "creator" | "donor" | "reviewer" | "readonly";

// Must sum to 1. Order matters (cumulative thresholds).
export const ROLE_WEIGHTS: Array<{ role: Role; weight: number }> = [
  { role: "creator", weight: 0.05 },
  { role: "reviewer", weight: 0.1 },
  { role: "donor", weight: 0.65 },
  { role: "readonly", weight: 0.2 },
];

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface SwarmConfig {
  users: number;
  mnemonic: string;
  derivationOffset: number;
  durationSeconds: number;
  rampUpSeconds: number;
  concurrency: number;
  minThinkMs: number;
  maxThinkMs: number;
  maxRetries: number;
  seed: number;
  reportFile: string | null;
  allowPublic: boolean;
}

export function loadSwarmConfig(): SwarmConfig {
  return {
    users: envInt("LOADTEST_USERS", 100),
    mnemonic: process.env.LOADTEST_MNEMONIC || DEFAULT_MNEMONIC,
    derivationOffset: envInt("LOADTEST_DERIVATION_OFFSET", DEFAULT_DERIVATION_OFFSET),
    durationSeconds: envInt("LOADTEST_DURATION", 180),
    rampUpSeconds: envInt("LOADTEST_RAMPUP", 45),
    concurrency: envInt("LOADTEST_CONCURRENCY", 40),
    minThinkMs: envInt("LOADTEST_MIN_THINK_MS", 200),
    maxThinkMs: envInt("LOADTEST_MAX_THINK_MS", 1500),
    maxRetries: envInt("LOADTEST_MAX_RETRIES", 4),
    seed: envInt("LOADTEST_SEED", 42),
    reportFile: process.env.LOADTEST_REPORT_FILE || null,
    allowPublic: process.env.LOADTEST_ALLOW_PUBLIC === "1",
  };
}

export interface SeedConfig {
  users: number;
  mnemonic: string;
  derivationOffset: number;
  ethPerWallet: string; // ETH (whole units) for gas
  usdcPerWallet: string; // USDC (whole units, 6 decimals applied by caller)
  allowPublic: boolean;
}

export function loadSeedConfig(): SeedConfig {
  return {
    users: envInt("LOADTEST_USERS", 100),
    mnemonic: process.env.LOADTEST_MNEMONIC || DEFAULT_MNEMONIC,
    derivationOffset: envInt("LOADTEST_DERIVATION_OFFSET", DEFAULT_DERIVATION_OFFSET),
    ethPerWallet: process.env.LOADTEST_ETH_PER_WALLET || "1",
    usdcPerWallet: process.env.LOADTEST_USDC_PER_WALLET || "5000",
    allowPublic: process.env.LOADTEST_ALLOW_PUBLIC === "1",
  };
}

export function assertLocalOrExplicitlyAllowed(chainId: number, allowPublic: boolean) {
  if (PUBLIC_CHAIN_IDS.has(chainId) && !allowPublic) {
    throw new Error(
      `Refusing to run the wallet-swarm load test against chainId ${chainId} (a public/production ` +
        `Covenant network). This would spend real ETH/USDC and spam the live contract. ` +
        `If you truly mean to do this, set LOADTEST_ALLOW_PUBLIC=1 explicitly.`,
    );
  }
}

export { envFloat };
