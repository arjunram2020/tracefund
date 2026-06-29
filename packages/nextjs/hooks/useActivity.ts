"use client";

import { useEffect } from "react";
import { usePublicClient } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPublicClient, http, type Abi } from "viem";
import { base } from "wagmi/chains";
import { getDeployBlock } from "../lib/contract";
import { useReadChain } from "./useTraceFund";

// Alchemy free tier caps eth_getLogs at 10 blocks per call.
// The public Base RPC supports up to 10,000 blocks per call, so we use a
// dedicated client for log scanning and stay safely under that limit.
const LOG_CHUNK = 9999n;
const logClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

async function fetchEventChunked(
  abi: Abi,
  address: `0x${string}`,
  eventName: string,
  campaignId: bigint,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<any[]> {
  const chunks: { from: bigint; to: bigint }[] = [];
  for (let b = fromBlock; b <= toBlock; b += LOG_CHUNK) {
    const end = b + LOG_CHUNK - 1n < toBlock ? b + LOG_CHUNK - 1n : toBlock;
    chunks.push({ from: b, to: end });
  }

  const all: any[] = [];
  // 5 concurrent chunks to stay within public RPC rate limits
  for (let i = 0; i < chunks.length; i += 5) {
    const slice = chunks.slice(i, i + 5);
    const results = await Promise.all(
      slice.map(({ from, to }) =>
        logClient
          .getContractEvents({ address, abi, eventName, args: { campaignId }, fromBlock: from, toBlock: to })
          .catch(() => [] as any[]),
      ),
    );
    all.push(...results.flat());
  }
  return all;
}

export type ActivityType =
  | "CampaignCreated"
  | "DonationReceived"
  | "EvidenceSubmitted"
  | "MilestoneApproved"
  | "MilestoneReleased"
  | "CampaignCompleted";

export interface ActivityItem {
  type: ActivityType;
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  timestamp?: number;
  args: Record<string, unknown>;
}

const EVENT_NAMES: ActivityType[] = [
  "CampaignCreated",
  "DonationReceived",
  "EvidenceSubmitted",
  "MilestoneApproved",
  "MilestoneReleased",
  "CampaignCompleted",
];

/** Newest first; within a block, newest log first. */
function sortItems(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort((a, b) => {
    if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
    return a.blockNumber > b.blockNumber ? -1 : 1;
  });
}

/** Merge new items into an existing list, de-duping by tx hash + log index. */
function mergeItems(prev: ActivityItem[] | undefined, incoming: ActivityItem[]): ActivityItem[] {
  const byKey = new Map<string, ActivityItem>();
  for (const it of prev ?? []) byKey.set(`${it.txHash}-${it.logIndex}`, it);
  for (const it of incoming) byKey.set(`${it.txHash}-${it.logIndex}`, it);
  return sortItems([...byKey.values()]);
}

const activityQueryKey = (chainId: number, address?: string, campaignId?: bigint) =>
  ["campaign-activity", chainId, address, campaignId?.toString()] as const;

export function useCampaignActivity(campaignId?: bigint) {
  const { address, abi, chainId } = useReadChain();
  // Used only for getBlock timestamp lookups (single-block requests, no range issue)
  const wagmiClient = usePublicClient({ chainId });
  const queryClient = useQueryClient();
  const queryKey = activityQueryKey(chainId, address, campaignId);

  // ---------------------------------------------------------------------------
  // Live subscription: push new on-chain events into the feed in near-real-time
  // (a few seconds) instead of waiting for the 30s history rescan below. This is
  // what makes the public activity trail update live across devices — as soon as
  // anyone donates, posts evidence, approves, or releases, every viewer sees it.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!address || campaignId === undefined) return;

    const unwatch = logClient.watchContractEvent({
      address: address as `0x${string}`,
      abi: abi as Abi,
      // poll getLogs over each new (tiny) block range — no eth_newFilter needed,
      // and base.org's generous range limit avoids the 10-block Alchemy cap.
      poll: true,
      pollingInterval: 5_000,
      onError: () => {
        /* transient RPC hiccups are reconciled by the 30s history refetch */
      },
      onLogs: async (logs) => {
        const relevant = logs.filter((log: any) => {
          const cid = log.args?.campaignId;
          return cid !== undefined && BigInt(cid) === campaignId && log.blockNumber != null;
        });
        if (relevant.length === 0) return;

        const blockClient = wagmiClient ?? logClient;
        const uniqueBlocks = Array.from(new Set(relevant.map((l: any) => l.blockNumber as bigint)));
        const blockTimes = new Map<bigint, number>();
        await Promise.all(
          uniqueBlocks.map(async (bn) => {
            try {
              const block = await blockClient.getBlock({ blockNumber: bn });
              blockTimes.set(bn, Number(block.timestamp));
            } catch {
              /* ignore */
            }
          }),
        );

        const incoming: ActivityItem[] = relevant.map((log: any) => ({
          type: log.eventName as ActivityType,
          blockNumber: log.blockNumber as bigint,
          logIndex: Number(log.logIndex ?? 0),
          txHash: log.transactionHash as `0x${string}`,
          timestamp: blockTimes.get(log.blockNumber as bigint),
          args: (log.args ?? {}) as Record<string, unknown>,
        }));

        queryClient.setQueryData<ActivityItem[]>(queryKey, (prev) => mergeItems(prev, incoming));
      },
    });

    return () => unwatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId, campaignId?.toString()]);

  return useQuery<ActivityItem[]>({
    queryKey,
    enabled: !!address && campaignId !== undefined,
    refetchInterval: 30_000,
    staleTime: 20_000,
    queryFn: async () => {
      if (!address || campaignId === undefined) return [];

      const fromBlock = getDeployBlock(chainId);
      const latestBlock = await logClient.getBlockNumber();

      const batches = await Promise.all(
        EVENT_NAMES.map(async (eventName) => {
          const logs = await fetchEventChunked(
            abi as Abi,
            address as `0x${string}`,
            eventName,
            campaignId,
            fromBlock,
            latestBlock,
          );
          return logs.map((log: any) => ({
            type: eventName,
            blockNumber: log.blockNumber as bigint,
            logIndex: Number(log.logIndex ?? 0),
            txHash: log.transactionHash as `0x${string}`,
            args: (log.args ?? {}) as Record<string, unknown>,
          }));
        }),
      );

      const items = batches.flat() as ActivityItem[];

      // Fetch block timestamps using the wagmi client (single-block calls are fine on Alchemy)
      const blockClient = wagmiClient ?? logClient;
      const uniqueBlocks = Array.from(new Set(items.map((i) => i.blockNumber)));
      const blockTimes = new Map<bigint, number>();
      await Promise.all(
        uniqueBlocks.map(async (bn) => {
          try {
            const block = await blockClient.getBlock({ blockNumber: bn });
            blockTimes.set(bn, Number(block.timestamp));
          } catch {
            /* ignore */
          }
        }),
      );

      return sortItems(
        items.map((i) => ({ ...i, timestamp: blockTimes.get(i.blockNumber) })),
      );
    },
  });
}
