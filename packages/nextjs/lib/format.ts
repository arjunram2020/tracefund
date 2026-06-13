import { formatEther } from "viem";
import type { Campaign, Milestone, MilestoneStatus } from "./types";

/** 50% of raised funds, expressed in basis points (mirrors the contract). */
export const APPROVAL_THRESHOLD_BPS = 5000n;
const BPS = 10000n;

/** Format wei to a trimmed ETH string, e.g. 0.05 instead of 0.050000000000000000. */
export function formatEth(wei: bigint | undefined, maxDigits = 4): string {
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

export function thresholdReached(approvalWeight: bigint, totalRaised: bigint): boolean {
  if (totalRaised === 0n) return false;
  return approvalWeight * BPS >= totalRaised * APPROVAL_THRESHOLD_BPS;
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

/** Derive a single milestone's UI status from on-chain state. */
export function milestoneStatus(
  milestone: Milestone,
  index: number,
  currentMilestone: number,
  totalRaised: bigint,
): MilestoneStatus {
  if (milestone.released) return "released";
  if (index > currentMilestone) return "locked";
  if (index < currentMilestone) return "released";
  // index === currentMilestone: this is the active milestone.
  if (!milestone.evidenceSubmitted) return "awaiting-evidence";
  if (thresholdReached(milestone.approvalWeight, totalRaised)) return "ready-to-release";
  if (milestone.approvalWeight > 0n) return "awaiting-approval";
  return "evidence-submitted";
}

interface StatusMeta {
  label: string;
  /** Tailwind classes for a small status pill. */
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
    case "ready-to-release":
      return {
        label: "Ready to release",
        pill: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
        dot: "bg-emerald-400 animate-pulse",
      };
    case "awaiting-approval":
      return {
        label: "Awaiting donor approval",
        pill: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30",
        dot: "bg-violet-400",
      };
    case "evidence-submitted":
      return {
        label: "Evidence submitted",
        pill: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30",
        dot: "bg-sky-400",
      };
    case "awaiting-evidence":
      return {
        label: "Awaiting evidence",
        pill: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
        dot: "bg-amber-400",
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
