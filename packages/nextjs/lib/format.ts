import { formatUnits } from "viem";
import type { Campaign, Milestone, MilestoneStatus } from "./types";
import { MilestoneState } from "./types";

/** USDC uses 6 decimals — every on-chain amount is in USDC base units. */
export const USDC_DECIMALS = 6;

/** Format USDC base units to a trimmed string, e.g. 0.05 instead of 0.050000. */
export function formatUsdc(units: bigint | undefined, maxDigits = USDC_DECIMALS): string {
  if (units === undefined) return "0";
  const full = formatUnits(units, USDC_DECIMALS);
  if (!full.includes(".")) return full;
  const [whole, frac] = full.split(".");
  const trimmed = frac.slice(0, maxDigits).replace(/0+$/, "");
  return trimmed.length ? `${whole}.${trimmed}` : whole;
}

export function shortenAddress(address?: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

/** Integer percentage of part/whole, clamped to [0, 100]. */
export function percent(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  const p = Number((part * 1000n) / whole) / 10;
  return Math.max(0, Math.min(100, p));
}

export function timeAgo(timestampSec: bigint | number): string {
  const ts = Number(timestampSec) * 1000;
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

/** Seconds → ms guard for on-chain uint64 timestamps (0n = unset). */
const pastDeadline = (deadline: bigint) =>
  deadline !== 0n && Date.now() / 1000 > Number(deadline);

export function milestoneStatus(
  milestone: Milestone,
  index: number,
  currentMilestone: number,
  cumulativeTarget: bigint,
  totalRaised: bigint,
): MilestoneStatus {
  if (milestone.released || milestone.state === MilestoneState.Approved) return "approved";
  if (index > currentMilestone) return "locked";
  if (milestone.state === MilestoneState.Submitted) {
    return "under-review";
  }
  if (milestone.state === MilestoneState.ChangesRequested) {
    return pastDeadline(milestone.revisionDeadline) ||
      pastDeadline(milestone.criteria.proofDeadline)
      ? "expired"
      : "changes-requested";
  }
  // Pending
  if (pastDeadline(milestone.criteria.proofDeadline)) return "expired";
  if (totalRaised < cumulativeTarget) return "funding";
  return "awaiting-proof";
}

interface StatusMeta {
  label: string;
  pill: string;
  dot: string;
}

export function milestoneStatusMeta(status: MilestoneStatus): StatusMeta {
  switch (status) {
    case "approved":
      return {
        label: "Approved · released",
        pill: "bg-[var(--brand-secondary)] text-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/25",
        dot: "bg-[var(--brand-primary)]",
      };
    case "under-review":
      return {
        label: "Under review",
        pill: "bg-violet-600/10 text-violet-700 ring-1 ring-violet-600/25",
        dot: "bg-violet-600 animate-pulse",
      };
    case "changes-requested":
      return {
        label: "Changes requested",
        pill: "bg-orange-600/10 text-orange-700 ring-1 ring-orange-600/25",
        dot: "bg-orange-600",
      };
    case "awaiting-proof":
      return {
        label: "Awaiting proof",
        pill: "bg-amber-600/10 text-amber-700 ring-1 ring-amber-600/25",
        dot: "bg-amber-600 animate-pulse",
      };
    case "funding":
      return {
        label: "Collecting funds",
        pill: "bg-sky-600/10 text-sky-700 ring-1 ring-sky-600/25",
        dot: "bg-sky-600",
      };
    case "expired":
      return {
        label: "Deadline missed",
        pill: "bg-red-600/10 text-red-700 ring-1 ring-red-600/25",
        dot: "bg-red-600",
      };
    case "locked":
    default:
      return {
        label: "Locked",
        pill: "bg-[var(--bg-subtle)] text-[var(--text-tertiary)] ring-1 ring-[var(--border-primary)]",
        dot: "bg-[var(--text-tertiary)]",
      };
  }
}

export function campaignStatus(campaign: Campaign): { label: string; pill: string } {
  if (campaign.completed) {
    return { label: "Completed", pill: "bg-[var(--brand-secondary)] text-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/25" };
  }
  if (campaign.cancelledAt !== 0n) {
    return { label: "Cancelled · refunds open", pill: "bg-red-600/10 text-red-700 ring-1 ring-red-600/25" };
  }
  if (campaign.active) {
    return { label: "Active", pill: "bg-sky-600/10 text-sky-700 ring-1 ring-sky-600/25" };
  }
  return { label: "Closed", pill: "bg-[var(--bg-subtle)] text-[var(--text-tertiary)] ring-1 ring-[var(--border-primary)]" };
}

/** Render a uint64 seconds deadline for the UI ("" when unset). */
export function formatDeadline(deadline: bigint | undefined): string {
  if (!deadline || deadline === 0n) return "";
  return new Date(Number(deadline) * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
