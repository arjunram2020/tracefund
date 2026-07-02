import { formatEther } from "viem";
import type { Campaign, Milestone, MilestoneStatus } from "./types";

/** Format wei to a trimmed ETH string, e.g. 0.05 instead of 0.050000000000000000. */
export function formatEth(wei: bigint | undefined, maxDigits = 10): string {
  if (wei === undefined) return "0";
  const full = formatEther(wei);
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

export function milestoneStatus(
  milestone: Milestone,
  index: number,
  currentMilestone: number,
  totalRaised: bigint,
): MilestoneStatus {
  if (milestone.released) return "released";
  if (index > currentMilestone) return "locked";
  if (totalRaised === 0n) return "funding";
  return "awaiting-evidence";
}

interface StatusMeta {
  label: string;
  pill: string;
  dot: string;
}

export function milestoneStatusMeta(status: MilestoneStatus): StatusMeta {
  switch (status) {
    case "released":
      return {
        label: "Released",
        pill: "bg-[var(--brand-secondary)] text-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/25",
        dot: "bg-[var(--brand-primary)]",
      };
    case "awaiting-evidence":
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
  if (campaign.active) {
    return { label: "Active", pill: "bg-sky-600/10 text-sky-700 ring-1 ring-sky-600/25" };
  }
  return { label: "Closed", pill: "bg-[var(--bg-subtle)] text-[var(--text-tertiary)] ring-1 ring-[var(--border-primary)]" };
}
