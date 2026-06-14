"use client";

import { useCallback } from "react";
import {
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { getTraceFund, resolveReadChainId, traceFundAbi } from "../lib/contract";
import type { Campaign, CreatorStats, Milestone } from "../lib/types";

/**
 * Resolve which chain + address the UI should read from. Falls back to the
 * default deployment chain so public viewers can browse without a wallet.
 */
export function useReadChain() {
  const connectedChainId = useChainId();
  const chainId = resolveReadChainId(connectedChainId);
  const deployment = getTraceFund(chainId);
  return {
    chainId,
    address: deployment?.address,
    abi: traceFundAbi,
    deployed: !!deployment,
    connectedChainId,
  };
}

export function useCampaignCount() {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "campaignCount",
    chainId,
    query: { enabled: !!address },
  });
  return { ...q, count: (q.data as bigint | undefined) ?? 0n };
}

export function useAllCampaigns() {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "getAllCampaigns",
    chainId,
    query: { enabled: !!address },
  });
  return { ...q, campaigns: (q.data as Campaign[] | undefined) ?? [] };
}

export function useCampaign(id?: bigint) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "getCampaign",
    args: id !== undefined ? [id] : undefined,
    chainId,
    query: { enabled: !!address && id !== undefined },
  });
  return { ...q, campaign: q.data as Campaign | undefined };
}

export function useMilestones(id?: bigint) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "getMilestones",
    args: id !== undefined ? [id] : undefined,
    chainId,
    query: { enabled: !!address && id !== undefined },
  });
  return { ...q, milestones: (q.data as Milestone[] | undefined) ?? [] };
}

export function useApprovalProgress(id?: bigint) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "getApprovalProgress",
    args: id !== undefined ? [id] : undefined,
    chainId,
    query: { enabled: !!address && id !== undefined },
  });
  const tuple = q.data as readonly [bigint, bigint, boolean] | undefined;
  return {
    ...q,
    approvalWeight: tuple?.[0] ?? 0n,
    totalRaised: tuple?.[1] ?? 0n,
    thresholdReached: tuple?.[2] ?? false,
  };
}

export function useTrustScore(creator?: `0x${string}`) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "trustScore",
    args: creator ? [creator] : undefined,
    chainId,
    query: { enabled: !!address && !!creator },
  });
  return { ...q, score: Number((q.data as bigint | undefined) ?? 0n) };
}

export function useCreatorStats(creator?: `0x${string}`) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "getCreatorStats",
    args: creator ? [creator] : undefined,
    chainId,
    query: { enabled: !!address && !!creator },
  });
  return { ...q, stats: q.data as CreatorStats | undefined };
}

export function useMyDonation(id?: bigint, donor?: `0x${string}`) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "getDonation",
    args: id !== undefined && donor ? [id, donor] : undefined,
    chainId,
    query: { enabled: !!address && id !== undefined && !!donor },
  });
  return { ...q, donation: (q.data as bigint | undefined) ?? 0n };
}

export function useHasApproved(id?: bigint, milestoneIndex?: bigint, donor?: `0x${string}`) {
  const { address, abi, chainId } = useReadChain();
  const enabled = !!address && id !== undefined && milestoneIndex !== undefined && !!donor;
  const q = useReadContract({
    address,
    abi,
    functionName: "hasApproved",
    args: enabled ? [id, milestoneIndex, donor] : undefined,
    chainId,
    query: { enabled },
  });
  return { ...q, approved: (q.data as boolean | undefined) ?? false };
}

export type TraceFundFn =
  | "createCampaign"
  | "donate"
  | "submitEvidence"
  | "approveMilestone"
  | "releaseMilestoneFunds";

/**
 * A small write helper that bundles tx submission + confirmation state and
 * refreshes on-chain reads once the transaction is mined.
 */
export function useTraceFundWrite() {
  const { address, abi, chainId } = useReadChain();
  const connectedChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash, chainId });

  const execute = useCallback(
    async (functionName: TraceFundFn, args: unknown[], value?: bigint) => {
      if (!address) throw new Error("TraceFund is not deployed on this network.");
      // wagmi rejects a write whose explicit chainId differs from the wallet's
      // current chain. Prompt the wallet to switch first so a second device on
      // the wrong network (e.g. Ethereum) lands on the deployment chain (Base)
      // instead of hitting a ChainMismatchError.
      if (connectedChainId !== chainId) {
        await switchChainAsync({ chainId });
      }
      const txHash = await writeContractAsync({
        address,
        abi,
        functionName,
        args,
        value,
        chainId,
      } as any);
      return txHash;
    },
    [address, abi, chainId, connectedChainId, switchChainAsync, writeContractAsync],
  );

  const refresh = useCallback(() => {
    // Refresh every contract read so all panels + the activity feed update.
    queryClient.invalidateQueries();
  }, [queryClient]);

  return {
    execute,
    refresh,
    hash,
    isPending, // waiting for wallet signature / broadcast
    isConfirming, // mined-pending
    isConfirmed,
    error: error ?? receiptError,
    reset,
  };
}
