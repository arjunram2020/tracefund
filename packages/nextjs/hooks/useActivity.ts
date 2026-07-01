"use client";

import { useEffect } from "react";
import { usePublicClient } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPublicClient, http, type Abi, type Chain, type PublicClient } from "viem";
import { base, baseSepolia, hardhat, mainnet } from "wagmi/chains";
import { getDeployBlock } from "../lib/contract";
import { useReadChain } from "./useCovenant";

// Alchemy free tier caps eth_getLogs at 10 blocks per call.
// The public Base RPC supports up to 10,000 blocks per call, so we use a
// dedicated client for log scanning and stay safely under that limit.
const LOG_CHUNK = 9999n;

// Log-scan client for whichever chain the UI is reading from. Base gets the
// public RPC (generous getLogs range); the other chains use their default RPC
// (e.g. localhost:8545 for the local Hardhat node).
const SCAN_CHAINS: Record<number, Chain> = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
  [mainnet.id]: mainnet,
  [hardhat.id]: hardhat,
};
const SCAN_RPC: Record<number, string | undefined> = {
  [base.id]: "https://mainnet.base.org",
};
const logClients = new Map<number, PublicClient>();
function getLogClient(chainId: number): PublicClient {
  let client = logClients.get(chainId);
  if (!client) {
    const chain = SCAN_CHAINS[chainId] ?? base;
    client = createPublicClient({ chain, transport: http(SCAN_RPC[chainId]) });
    logClients.set(chainId, client);
  }
  return client;
}

async function fetchEventChunked(
  logClient: PublicClient,
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
  "MilestoneReleased",
  "CampaignCompleted",
];

// Base URL of our off-chain indexer running on EC2 (e.g. http://1.2.3.4/api).
// When set, history loads from the indexer in one fast request instead of
// scanning the whole chain. Empty = fall back to direct on-chain scanning.
const INDEXER_URL = (process.env.NEXT_PUBLIC_INDEXER_URL || "").replace(/\/$/, "");

// Pull a campaign's full audit trail from the indexer API. Returns null on any
// failure so the caller can transparently fall back to on-chain scanning.
async function fetchFromIndexer(campaignId: bigint): Promise<ActivityItem[] | null> {
  if (!INDEXER_URL) return null;
  try {
    const res = await fetch(`${INDEXER_URL}/campaigns/${campaignId.toString()}`);
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      event_name: ActivityType;
      block_number: number;
      tx_hash: `0x${string}`;
      log_index: number;
      args: Record<string, unknown>;
    }>;
    return rows.map((r) => ({
      type: r.event_name,
      blockNumber: BigInt(r.block_number),
      logIndex: Number(r.log_index),
      txHash: r.tx_hash,
      args: r.args ?? {},
    }));
  } catch {
    return null;
  }
}

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
  const logClient = getLogClient(chainId);
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
  }, [address, chainId, logClient, campaignId?.toString()]);

  return useQuery<ActivityItem[]>({
    queryKey,
    enabled: !!address && campaignId !== undefined,
    refetchInterval: 30_000,
    staleTime: 20_000,
    queryFn: async () => {
      if (!address || campaignId === undefined) return [];

      // Fast path: one request to the EC2 indexer. If it's configured and up,
      // this replaces the expensive multi-chunk on-chain scan below entirely.
      // The indexer only follows Base Mainnet, so skip it for other chains
      // (campaign ids would otherwise collide with Base's history).
      const indexed = chainId === base.id ? await fetchFromIndexer(campaignId) : null;

      let items: ActivityItem[];
      if (indexed) {
        items = indexed;
      } else {
        // Fallback path: scan the chain directly (slow, but works with no indexer).
        const fromBlock = getDeployBlock(chainId);
        const latestBlock = await logClient.getBlockNumber();

        const batches = await Promise.all(
          EVENT_NAMES.map(async (eventName) => {
            const logs = await fetchEventChunked(
              logClient,
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

        items = batches.flat() as ActivityItem[];
      }

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
