"use client";

import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
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

export function useCampaignActivity(campaignId?: bigint) {
  const { address, abi, chainId } = useReadChain();
  // Used only for getBlock timestamp lookups (single-block requests, no range issue)
  const wagmiClient = usePublicClient({ chainId });

  return useQuery<ActivityItem[]>({
    queryKey: ["campaign-activity", chainId, address, campaignId?.toString()],
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

      return items
        .map((i) => ({ ...i, timestamp: blockTimes.get(i.blockNumber) }))
        .sort((a, b) => {
          if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
          return a.blockNumber > b.blockNumber ? -1 : 1;
        });
    },
  });
}
