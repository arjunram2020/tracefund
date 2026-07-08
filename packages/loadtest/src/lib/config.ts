import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

/**
 * Central configuration for every loadtest entrypoint.
 *
 * Everything is overridable from the CLI or environment, but the defaults
 * target the repo-native local stack: `yarn chain` (hardhat node on
 * 127.0.0.1:8545, chainId 31337, the standard "test … junk" mnemonic) plus
 * `yarn deploy`, which writes packages/nextjs/contracts/deployedContracts.json.
 *
 * The same harness runs against Anvil (plain or `--fork-url` Base) — point
 * LOADTEST_RPC_URL at it and keep the chainId at 31337.
 */

// Hardhat/Anvil default mnemonic. Account #0 is the deployer/owner locally.
export const DEFAULT_MNEMONIC =
  "test test test test test test test test test test test junk";

/**
 * HD index layout (deterministic, reproducible across runs):
 *   0        — deployer / contract owner / gas+token funder
 *   1..9     — reserved for the repo's own seed/demo scripts
 *   10..29   — reserved for Playwright browser sessions (hardhat node unlocks
 *              indices 0..19, letting the mock wallet sign via the node)
 *   100+     — programmatic actor wallets (creators, donors, reviewers, readers)
 */
export const ACTOR_INDEX_OFFSET = 100;
export const BROWSER_INDEX_OFFSET = 10;

export interface RoleMix {
  creators: number;
  donors: number;
  reviewers: number;
  readers: number;
}

export type ScenarioName =
  | "mixed-read"
  | "mixed-write"
  | "reviewer-bottleneck"
  | "weighted-vote";

export interface ScenarioSpec {
  name: ScenarioName;
  description: string;
  mix: RoleMix; // fractions, summing to ~1
  /** Approval models creators use, drawn round-robin. */
  approvalModels: Array<"weighted" | "designated" | "operator">;
  /** Percent of donated weight needed to release (WeightedApproval). */
  weightedThreshold: number;
  /** Campaigns each creator maintains. */
  campaignsPerCreator: number;
  /** Designated-reviewer wallets shared across ALL campaigns (bottleneck knob). */
  sharedReviewerCount?: number;
  /** Reviewer count-threshold for designated campaigns. */
  reviewerThreshold: number;
  /** Donor think time between actions, ms [min, max]. */
  thinkMs: [number, number];
  /** Probability a reviewer/vote decision is a rejection. */
  rejectRate: number;
}

export const SCENARIOS: Record<ScenarioName, ScenarioSpec> = {
  "mixed-read": {
    name: "mixed-read",
    description:
      "Read-heavy population: most actors browse (getAllCampaigns/getCampaign/getMilestones/trustScore/getLogs); a trickle of writes keeps state moving.",
    mix: { creators: 0.04, donors: 0.14, reviewers: 0.02, readers: 0.8 },
    approvalModels: ["weighted", "operator"],
    weightedThreshold: 50,
    campaignsPerCreator: 1,
    reviewerThreshold: 1,
    thinkMs: [500, 3000],
    rejectRate: 0.1,
  },
  "mixed-write": {
    name: "mixed-write",
    description:
      "Write-heavy population: donations, proof submissions and reviews dominate; stresses tx queueing, nonces, and mining throughput.",
    mix: { creators: 0.15, donors: 0.65, reviewers: 0.1, readers: 0.1 },
    approvalModels: ["weighted", "designated", "operator"],
    weightedThreshold: 50,
    campaignsPerCreator: 2,
    reviewerThreshold: 1,
    thinkMs: [200, 1500],
    rejectRate: 0.15,
  },
  "reviewer-bottleneck": {
    name: "reviewer-bottleneck",
    description:
      "Many campaigns funnel through a tiny shared reviewer committee (3 wallets, 2-of-3 threshold): measures time-to-release when human review is the constraint.",
    mix: { creators: 0.3, donors: 0.55, reviewers: 0.05, readers: 0.1 },
    approvalModels: ["designated"],
    weightedThreshold: 50,
    campaignsPerCreator: 2,
    sharedReviewerCount: 3,
    reviewerThreshold: 2,
    thinkMs: [200, 1200],
    rejectRate: 0.1,
  },
  "weighted-vote": {
    name: "weighted-vote",
    description:
      "One WeightedApproval campaign, hundreds of small donors funding milestone 1 and then voting concurrently to cross the percent threshold — a deliberate approval race.",
    mix: { creators: 0.002, donors: 0.948, reviewers: 0, readers: 0.05 },
    approvalModels: ["weighted"],
    weightedThreshold: 60,
    campaignsPerCreator: 1,
    reviewerThreshold: 1,
    thinkMs: [50, 400],
    rejectRate: 0,
  },
};

export interface LoadtestConfig {
  rpcUrl: string;
  chainId: number;
  mnemonic: string;
  users: number;
  scenario: ScenarioSpec;
  durationSec: number;
  rampSec: number;
  /** Global cap on in-flight transactions across all actors. */
  maxInflight: number;
  /** "max" = one unlimited allowance at seed time; "exact" = approve before every donation (mirrors first-time UI flow, doubles write volume). */
  approveMode: "max" | "exact";
  outDir: string;
  label: string;
}

const num = (v: string | undefined, d: number) =>
  v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d;

export function parseCliConfig(argv = process.argv.slice(2)): LoadtestConfig {
  const { values } = parseArgs({
    args: argv,
    options: {
      users: { type: "string" },
      preset: { type: "string" }, // alias for --users
      scenario: { type: "string" },
      duration: { type: "string" },
      ramp: { type: "string" },
      "max-inflight": { type: "string" },
      "approve-mode": { type: "string" },
      rpc: { type: "string" },
      label: { type: "string" },
    },
    allowPositionals: true,
    // Entrypoints layer their own flags (e.g. run-web's --mode/--vus) on top
    // of the shared ones, so unknown options must not be fatal here.
    strict: false,
  });

  // With strict:false parseArgs types values as string | boolean; only string
  // flag usages are meaningful here.
  const str = (v: string | boolean | undefined): string | undefined =>
    typeof v === "string" ? v : undefined;

  const users = num(str(values.users) ?? str(values.preset), 100);
  const scenarioName = (str(values.scenario) ?? "mixed-write") as ScenarioName;
  const scenario = SCENARIOS[scenarioName];
  if (!scenario) {
    throw new Error(
      `Unknown scenario "${scenarioName}". Options: ${Object.keys(SCENARIOS).join(", ")}`,
    );
  }

  return {
    rpcUrl: str(values.rpc) ?? process.env.LOADTEST_RPC_URL ?? "http://127.0.0.1:8545",
    chainId: num(process.env.LOADTEST_CHAIN_ID, 31337),
    mnemonic: process.env.LOADTEST_MNEMONIC ?? DEFAULT_MNEMONIC,
    users,
    scenario,
    durationSec: num(str(values.duration), 60),
    rampSec: num(str(values.ramp), Math.min(30, Math.ceil(users / 20))),
    maxInflight: num(str(values["max-inflight"]), 100),
    approveMode: (str(values["approve-mode"]) as "max" | "exact") ?? "max",
    outDir:
      process.env.LOADTEST_OUT_DIR ?? fileURLToPath(new URL("../../results/", import.meta.url)),
    label: str(values.label) ?? `${scenarioName}-${users}u`,
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const randInt = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
