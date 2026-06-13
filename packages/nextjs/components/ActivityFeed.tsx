"use client";

import { useCampaignActivity, type ActivityItem, type ActivityType } from "../hooks/useActivity";
import { formatEth, shortenAddress, timeAgo } from "../lib/format";

const ICON: Record<ActivityType, { glyph: string; ring: string }> = {
  CampaignCreated: { glyph: "✦", ring: "bg-white/5 text-gray-300" },
  DonationReceived: { glyph: "↓", ring: "bg-brand-500/15 text-brand-300" },
  EvidenceSubmitted: { glyph: "▣", ring: "bg-sky-500/15 text-sky-300" },
  MilestoneApproved: { glyph: "✓", ring: "bg-violet-500/15 text-violet-300" },
  MilestoneReleased: { glyph: "↑", ring: "bg-emerald-500/15 text-emerald-300" },
  CampaignCompleted: { glyph: "★", ring: "bg-brand-500/20 text-brand-200" },
};

function describe(item: ActivityItem): React.ReactNode {
  const a = item.args as any;
  const ms = a.milestoneIndex !== undefined ? `milestone ${Number(a.milestoneIndex) + 1}` : "";
  switch (item.type) {
    case "CampaignCreated":
      return (
        <>
          Campaign created with goal{" "}
          <span className="font-mono text-gray-200">{formatEth(a.goalAmount)} ETH</span>
        </>
      );
    case "DonationReceived":
      return (
        <>
          <span className="font-mono">{shortenAddress(a.donor)}</span> donated{" "}
          <span className="font-mono text-brand-300">{formatEth(a.amount)} ETH</span> into escrow
        </>
      );
    case "EvidenceSubmitted":
      return <>Creator submitted evidence for {ms}</>;
    case "MilestoneApproved":
      return (
        <>
          <span className="font-mono">{shortenAddress(a.donor)}</span> approved {ms}{" "}
          <span className="text-gray-500">(+{formatEth(a.weight)} ETH weight)</span>
        </>
      );
    case "MilestoneReleased":
      return (
        <>
          Released <span className="font-mono text-emerald-300">{formatEth(a.amount)} ETH</span> for{" "}
          {ms} to the creator
        </>
      );
    case "CampaignCompleted":
      return <>Campaign completed — all milestones released 🎉</>;
    default:
      return item.type;
  }
}

export function ActivityFeed({ campaignId }: { campaignId: bigint }) {
  const { data, isLoading } = useCampaignActivity(campaignId);
  const items = data ?? [];

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-white">Public activity</h3>
        <span className="pill bg-white/5 text-gray-400">on-chain events</span>
      </div>

      {isLoading && items.length === 0 ? (
        <p className="text-sm text-gray-500">Loading on-chain history…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">No activity yet.</p>
      ) : (
        <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-1 before:h-[calc(100%-1rem)] before:w-px before:bg-canvas-border">
          {items.map((item, idx) => {
            const meta = ICON[item.type];
            return (
              <li key={`${item.txHash}-${item.logIndex}-${idx}`} className="relative flex gap-3">
                <span
                  className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${meta.ring} ring-4 ring-canvas-card`}
                >
                  {meta.glyph}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-sm text-gray-300">{describe(item)}</p>
                  {item.timestamp && (
                    <p className="mt-0.5 text-xs text-gray-600">{timeAgo(item.timestamp)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
