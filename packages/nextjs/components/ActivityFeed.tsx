"use client";

import { useCampaignActivity, type ActivityItem, type ActivityType } from "../hooks/useActivity";
import { formatEth, shortenAddress, timeAgo } from "../lib/format";
import { useReadChain } from "../hooks/useCovenant";

function explorerTxUrl(chainId: number, txHash: string): string {
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
}

const ICON: Record<ActivityType, { glyph: string; ring: string }> = {
  CampaignCreated: { glyph: "✦", ring: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]" },
  DonationReceived: { glyph: "↓", ring: "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]" },
  EvidenceSubmitted: { glyph: "▣", ring: "bg-sky-600/10 text-sky-700" },
  MilestoneReleased: { glyph: "↑", ring: "bg-emerald-600/10 text-emerald-700" },
  CampaignCompleted: { glyph: "★", ring: "bg-[var(--brand-primary)]/20 text-[var(--brand-primary)]" },
};

type FlowTag = { label: string; cls: string } | null;
const FLOW: Record<ActivityType, FlowTag> = {
  CampaignCreated: null,
  DonationReceived: {
    label: "wallet → escrow",
    cls: "text-[var(--brand-primary)] bg-[var(--brand-primary)]/10 ring-1 ring-[var(--brand-primary)]/20",
  },
  EvidenceSubmitted: null,
  MilestoneReleased: {
    label: "escrow → creator wallet",
    cls: "text-emerald-700 bg-emerald-600/10 ring-1 ring-emerald-600/20",
  },
  CampaignCompleted: null,
};

function describe(item: ActivityItem): React.ReactNode {
  const a = item.args as any;
  const ms = a.milestoneIndex !== undefined ? `milestone ${Number(a.milestoneIndex) + 1}` : "";
  switch (item.type) {
    case "CampaignCreated":
      return (
        <>
          Campaign launched with a{" "}
          <span className="font-mono text-[var(--text-primary)]">{formatEth(a.goalAmount)} ETH</span> goal —
          all donor contributions will be locked in the escrow contract until each milestone's
          evidence is submitted
        </>
      );
    case "DonationReceived":
      return (
        <>
          <span className="font-mono">{shortenAddress(a.donor)}</span> sent{" "}
          <span className="font-mono text-[var(--brand-primary)]">{formatEth(a.amount)} ETH</span> — now locked
          in escrow on-chain &nbsp;·&nbsp; total raised{" "}
          <span className="font-mono text-[var(--text-primary)]">{formatEth(a.totalRaised)} ETH</span>
        </>
      );
    case "EvidenceSubmitted":
      return (
        <>
          Creator posted on-chain proof for {ms} — this milestone&apos;s funds release to the
          creator in the same transaction
        </>
      );
    case "MilestoneReleased":
      return (
        <>
          <span className="font-mono text-emerald-700">{formatEth(a.amount)} ETH</span> transferred
          from escrow to creator{" "}
          <span className="font-mono">{shortenAddress(a.creator)}</span> for {ms}
        </>
      );
    case "CampaignCompleted":
      return <>All milestones proven and released — campaign complete</>;
    default:
      return item.type;
  }
}

export function ActivityFeed({ campaignId }: { campaignId: bigint }) {
  const { chainId } = useReadChain();
  const { data, isLoading } = useCampaignActivity(campaignId);
  const items = data ?? [];

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-[var(--text-primary)]">Public activity</h3>
        <span className="pill flex items-center gap-1.5 bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-primary)] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--brand-primary)]" />
          </span>
          live · on-chain
        </span>
      </div>

      {isLoading && items.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">Loading on-chain history…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">No activity yet.</p>
      ) : (
        <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-1 before:h-[calc(100%-1rem)] before:w-px before:bg-[var(--border-primary)]">
          {items.map((item, idx) => {
            const meta = ICON[item.type];
            const flow = FLOW[item.type];
            const explorerUrl = explorerTxUrl(chainId, item.txHash);
            return (
              <li key={`${item.txHash}-${item.logIndex}-${idx}`} className="relative flex gap-3">
                <span
                  className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${meta.ring} ring-4 ring-[var(--surface-bg)]`}
                >
                  {meta.glyph}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-sm text-[var(--text-secondary)]">{describe(item)}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {flow && (
                      <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${flow.cls}`}>
                        {flow.label}
                      </span>
                    )}
                    {item.timestamp && (
                      <span className="text-xs text-[var(--text-tertiary)]">{timeAgo(item.timestamp)}</span>
                    )}
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    >
                      view on Basescan ↗
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
