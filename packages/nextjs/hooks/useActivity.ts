"use client";

import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { Abi } from "viem";
import { getDeployBlock } from "../lib/contract";
import { useReadChain } from "./useTraceFund";

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

export function useCampaignActivity(campaignId?: bigint) {
  const { address, abi, chainId } = useReadChain();
  const client = usePublicClient({ chainId });

  return useQuery<ActivityItem[]>({
    queryKey: ["campaign-activity", chainId, address, campaignId?.toString()],
    enabled: !!client && !!address && campaignId !== undefined,
    refetchInterval: 8000,
    queryFn: async () => {
      if (!client || !address || campaignId === undefined) return [];

      const fromBlock = getDeployBlock(chainId);
      const batches = await Promise.all(
        EVENT_NAMES.map(async (eventName) => {
          try {
            const logs = await client.getContractEvents({
              address: address as `0x${string}`,
              abi: abi as Abi,
              eventName,
              args: { campaignId },
              fromBlock,
              toBlock: "latest",
            });
            return logs.map((log: any) => ({
              type: eventName,
              blockNumber: log.blockNumber as bigint,
              logIndex: Number(log.logIndex ?? 0),
              txHash: log.transactionHash as `0x${string}`,
              args: (log.args ?? {}) as Record<string, unknown>,
            }));
          } catch {
            return [] as ActivityItem[];
          }
        }),
      );

      const items = batches.flat();

      const uniqueBlocks = Array.from(new Set(items.map((i) => i.blockNumber)));
      const blockTimes = new Map<bigint, number>();
      await Promise.all(
        uniqueBlocks.map(async (bn) => {
          try {
            const block = await client.getBlock({ blockNumber: bn });
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
