import type { Abi } from "viem";
import { formatUnits } from "viem";
import legacy from "../contracts/legacyContract.json";

/**
 * Retired TraceFund/Covenant deployments on Base Mainnet, kept strictly
 * read-only: the History tab shows their campaigns as a permanent on-chain
 * record, but the app never writes to them. Every superseded contract that
 * ever held campaigns gets an entry here.
 */

export const LEGACY_CHAIN_ID = 8453;

// Struct shapes shared by all retired deployments — frozen; do not evolve
// these with the live contract's types. (The approval-era contract returns a
// superset with extra milestone fields; viem decodes the extras harmlessly.)
export interface LegacyMilestone {
  description: string;
  amount: bigint;
  evidence: string;
  evidenceSubmitted: boolean;
  released: boolean;
}

export interface LegacyCampaign {
  id: bigint;
  creator: `0x${string}`;
  title: string;
  description: string;
  goalAmount: bigint;
  totalRaised: bigint;
  totalReleased: bigint;
  active: boolean;
  completed: boolean;
  currentMilestone: bigint;
  createdAt: bigint;
  donorCount: bigint;
  milestoneCount: bigint;
}

// Minimal read-only ABI for the auto-release-era contracts (ETH and USDC
// variants share the same Campaign/Milestone tuple shapes).
const CAMPAIGN_COMPONENTS = [
  { name: "id", type: "uint256" },
  { name: "creator", type: "address" },
  { name: "title", type: "string" },
  { name: "description", type: "string" },
  { name: "goalAmount", type: "uint256" },
  { name: "totalRaised", type: "uint256" },
  { name: "totalReleased", type: "uint256" },
  { name: "active", type: "bool" },
  { name: "completed", type: "bool" },
  { name: "currentMilestone", type: "uint256" },
  { name: "createdAt", type: "uint256" },
  { name: "donorCount", type: "uint256" },
  { name: "milestoneCount", type: "uint256" },
] as const;

const MILESTONE_COMPONENTS = [
  { name: "description", type: "string" },
  { name: "amount", type: "uint256" },
  { name: "evidence", type: "string" },
  { name: "evidenceSubmitted", type: "bool" },
  { name: "released", type: "bool" },
] as const;

const AUTORELEASE_READ_ABI = [
  {
    type: "function",
    name: "getAllCampaigns",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "tuple[]", components: CAMPAIGN_COMPONENTS }],
  },
  {
    type: "function",
    name: "getCampaign",
    stateMutability: "view",
    inputs: [{ name: "campaignId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: CAMPAIGN_COMPONENTS }],
  },
  {
    type: "function",
    name: "getMilestones",
    stateMutability: "view",
    inputs: [{ name: "campaignId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple[]", components: MILESTONE_COMPONENTS }],
  },
] as const satisfies Abi;

export interface ArchivedDeployment {
  /** Stable slug used in /history/<key>-<campaignId> URLs. */
  key: string;
  /** Short human label shown on cards. */
  label: string;
  /** One-line context for why this contract is retired. */
  note: string;
  address: `0x${string}`;
  abi: Abi;
  deployBlock: bigint;
  /** Display denomination — the eras used different settlement assets. */
  symbol: "ETH" | "USDC";
  formatAmount: (units: bigint | undefined) => string;
}

function trimAmount(units: bigint | undefined, decimals: number, maxDigits: number): string {
  if (units === undefined) return "0";
  const full = formatUnits(units, decimals);
  if (!full.includes(".")) return full;
  const [whole, frac] = full.split(".");
  const trimmed = frac.slice(0, maxDigits).replace(/0+$/, "");
  return trimmed.length ? `${whole}.${trimmed}` : whole;
}

/** Legacy ETH-era campaigns were denominated in wei (18 decimals). */
export function formatLegacyEth(wei: bigint | undefined, maxDigits = 10): string {
  return trimAmount(wei, 18, maxDigits);
}

export const archivedDeployments: ArchivedDeployment[] = [
  {
    key: "approval",
    label: "ETH · approval era",
    note: "The original ETH contract with donor approval voting.",
    address: legacy.address as `0x${string}`,
    abi: legacy.abi as Abi,
    deployBlock: BigInt(legacy.deployBlock ?? 0),
    symbol: "ETH",
    formatAmount: (v) => formatLegacyEth(v),
  },
  {
    key: "eth",
    label: "ETH · auto-release era",
    note: "The ETH contract that released funds automatically on proof submission.",
    address: "0x9CA2E453462b87584f5A4D15f5962a4f2174BCE9",
    abi: AUTORELEASE_READ_ABI,
    deployBlock: 48079282n,
    symbol: "ETH",
    formatAmount: (v) => formatLegacyEth(v),
  },
  {
    key: "usdc1",
    label: "USDC · auto-release era",
    note: "The first USDC contract (retired: misconfigured token, donations never worked).",
    address: "0xe11CE961Ff378B5D5172DE6ABfE8c16f900e10F3",
    abi: AUTORELEASE_READ_ABI,
    deployBlock: 48139854n,
    symbol: "USDC",
    formatAmount: (v) => trimAmount(v, 6, 6),
  },
];

export function getArchive(key?: string): ArchivedDeployment | undefined {
  return archivedDeployments.find((a) => a.key === key);
}

/** Default archive (the one with the original demo campaigns). */
export const legacyAddress = archivedDeployments[0].address;

export function legacyCampaignStatus(c: LegacyCampaign): { label: string; pill: string } {
  if (c.completed) {
    return {
      label: "Completed",
      pill: "bg-[var(--brand-secondary)] text-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/25",
    };
  }
  return {
    label: "Archived",
    pill: "bg-[var(--bg-subtle)] text-[var(--text-tertiary)] ring-1 ring-[var(--border-primary)]",
  };
}
