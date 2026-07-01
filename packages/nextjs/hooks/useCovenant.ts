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
import { getCovenant, getCovenantAbi, resolveReadChainId } from "../lib/contract";
import type { Campaign, CreatorStats, Milestone } from "../lib/types";

export function useReadChain() {
  const connectedChainId = useChainId();
  const chainId = resolveReadChainId(connectedChainId);
  const deployment = getCovenant(chainId);
  return {
    chainId,
    address: deployment?.address,
    abi: getCovenantAbi(chainId),
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

export type CovenantFn = "createCampaign" | "donate" | "submitEvidence";

export function useCovenantWrite() {
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
    async (functionName: CovenantFn, args: unknown[], value?: bigint) => {
      if (!address) throw new Error("Covenant is not deployed on this network.");
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
    queryClient.invalidateQueries();
  }, [queryClient]);

  return {
    execute,
    refresh,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error: error ?? receiptError,
    reset,
  };
}
