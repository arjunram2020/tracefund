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
        pill: "bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30",
        dot: "bg-brand-400",
      };
    case "awaiting-evidence":
      return {
        label: "Awaiting proof",
        pill: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
        dot: "bg-amber-400 animate-pulse",
      };
    case "funding":
      return {
        label: "Collecting funds",
        pill: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30",
        dot: "bg-sky-400",
      };
    case "locked":
    default:
      return {
        label: "Locked",
        pill: "bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20",
        dot: "bg-zinc-500",
      };
  }
}

export function campaignStatus(campaign: Campaign): { label: string; pill: string } {
  if (campaign.completed) {
    return { label: "Completed", pill: "bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30" };
  }
  if (campaign.active) {
    return { label: "Active", pill: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30" };
  }
  return { label: "Closed", pill: "bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20" };
}
