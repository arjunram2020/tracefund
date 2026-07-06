"use client";

import { useCallback, useEffect } from "react";
import { erc20Abi } from "viem";
import {
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  getCovenant,
  getCovenantAbi,
  getDeploymentMode,
  getUsdcAddress,
  resolveReadChainId,
  supportsContractFunction,
} from "../lib/contract";
import type {
  ApprovalConfig,
  Campaign,
  CreatorStats,
  Milestone,
  ProofSubmission,
  ReviewDecision,
} from "../lib/types";

export function useReadChain() {
  const connectedChainId = useChainId();
  const chainId = resolveReadChainId(connectedChainId);
  const deployment = getCovenant(chainId);
  const connectedMode = getDeploymentMode(connectedChainId);
  const mode = getDeploymentMode(chainId);
  return {
    chainId,
    address: deployment?.address,
    abi: getCovenantAbi(chainId),
    deployed: !!deployment,
    mode,
    connectedMode,
    writeEnabled: mode === "active",
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

/**
 * Anti-spam state for a creator address: whether the platform has approved
 * them (lifting limits), and when they last created a campaign (cooldown).
 * Both read as undefined against pre-limit deployments — treat that as
 * unrestricted in the UI; the contract is the actual enforcer.
 */
export function useCreatorAccess(creator?: `0x${string}`) {
  const { address, abi, chainId } = useReadChain();
  const supportsApprovedCreators = supportsContractFunction(chainId, "approvedCreators");
  const supportsLastCampaignAt = supportsContractFunction(chainId, "lastCampaignAt");
  const approvedQ = useReadContract({
    address,
    abi,
    functionName: "approvedCreators",
    args: creator ? [creator] : undefined,
    chainId,
    query: { enabled: !!address && !!creator && supportsApprovedCreators },
  });
  const lastQ = useReadContract({
    address,
    abi,
    functionName: "lastCampaignAt",
    args: creator ? [creator] : undefined,
    chainId,
    query: { enabled: !!address && !!creator && supportsLastCampaignAt },
  });
  return {
    approved: supportsApprovedCreators ? (approvedQ.data as boolean | undefined) : undefined,
    lastCampaignAt: supportsLastCampaignAt ? (lastQ.data as bigint | undefined) : undefined,
  };
}

/** The campaign's approval authority configuration. */
export function useApprovalConfig(id?: bigint) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "getApprovalConfig",
    args: id !== undefined ? [id] : undefined,
    chainId,
    query: { enabled: !!address && id !== undefined },
  });
  return { ...q, config: q.data as ApprovalConfig | undefined };
}

/** All proof packages submitted for one milestone (oldest first). */
export function useSubmissions(id?: bigint, milestoneIndex?: number) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "getSubmissions",
    args:
      id !== undefined && milestoneIndex !== undefined
        ? [id, BigInt(milestoneIndex)]
        : undefined,
    chainId,
    query: { enabled: !!address && id !== undefined && milestoneIndex !== undefined },
  });
  return { ...q, submissions: (q.data as ProofSubmission[] | undefined) ?? [] };
}

/** Every review decision recorded for one milestone (oldest first). */
export function useReviews(id?: bigint, milestoneIndex?: number) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "getReviews",
    args:
      id !== undefined && milestoneIndex !== undefined
        ? [id, BigInt(milestoneIndex)]
        : undefined,
    chainId,
    query: { enabled: !!address && id !== undefined && milestoneIndex !== undefined },
  });
  return { ...q, reviews: (q.data as ReviewDecision[] | undefined) ?? [] };
}

/** Whether an account currently holds review authority for a campaign. */
export function useIsReviewer(id?: bigint, account?: `0x${string}`) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "isReviewer",
    args: id !== undefined && account ? [id, account] : undefined,
    chainId,
    query: { enabled: !!address && id !== undefined && !!account },
  });
  return { ...q, isReviewer: (q.data as boolean | undefined) ?? false };
}

/** A donor's claimable USDC refund (0 unless the campaign was cancelled). */
export function useRefund(id?: bigint, donor?: `0x${string}`) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "refundOf",
    args: id !== undefined && donor ? [id, donor] : undefined,
    chainId,
    query: { enabled: !!address && id !== undefined && !!donor },
  });
  return { ...q, refund: (q.data as bigint | undefined) ?? 0n };
}

/** True when the current milestone blew its deadline and anyone may fail the campaign. */
export function useMilestoneFailed(id?: bigint) {
  const { address, abi, chainId } = useReadChain();
  const q = useReadContract({
    address,
    abi,
    functionName: "milestoneFailed",
    args: id !== undefined ? [id] : undefined,
    chainId,
    query: { enabled: !!address && id !== undefined, refetchInterval: 30_000 },
  });
  return { ...q, failed: (q.data as boolean | undefined) ?? false };
}

export type CovenantFn =
  | "createCampaign"
  | "donate"
  | "submitProof"
  | "reviewProof"
  | "cancelCampaign"
  | "failCampaign"
  | "claimRefund";

export function useCovenantWrite() {
  const { address, abi, chainId, writeEnabled } = useReadChain();
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
    async (functionName: CovenantFn, args: unknown[]) => {
      if (!writeEnabled) {
        throw new Error(
          "This network only has a legacy ETH Covenant deployment. Redeploy the USDC contract before sending write transactions.",
        );
      }
      if (!address) throw new Error("Covenant is not deployed on this network.");
      if (connectedChainId !== chainId) {
        await switchChainAsync({ chainId });
      }
      const txHash = await writeContractAsync({
        address,
        abi,
        functionName,
        args,
        chainId,
      } as any);
      return txHash;
    },
    [address, abi, chainId, connectedChainId, switchChainAsync, writeContractAsync, writeEnabled],
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

/**
 * USDC state for a wallet: balance, allowance granted to the Covenant escrow,
 * and an approve() writer. Donating is a two-step flow — approve, then donate.
 */
export function useUsdc(owner?: `0x${string}`) {
  const { address: covenantAddress, chainId, writeEnabled } = useReadChain();
  const usdcAddress = getUsdcAddress(chainId);
  const connectedChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const allowanceQ = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner && covenantAddress ? [owner, covenantAddress] : undefined,
    chainId,
    query: { enabled: writeEnabled && !!usdcAddress && !!owner && !!covenantAddress },
  });

  const balanceQ = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    chainId,
    query: { enabled: writeEnabled && !!usdcAddress && !!owner },
  });

  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash, chainId });

  // Once an approval confirms, the allowance read is stale — refetch it.
  useEffect(() => {
    if (isConfirmed) {
      allowanceQ.refetch();
      balanceQ.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  const approve = useCallback(
    async (amount: bigint) => {
      if (!writeEnabled) {
        throw new Error(
          "This network only has a legacy ETH Covenant deployment. Redeploy the USDC contract before approving donations.",
        );
      }
      if (!usdcAddress || !covenantAddress) {
        throw new Error("USDC is not configured on this network.");
      }
      if (connectedChainId !== chainId) {
        await switchChainAsync({ chainId });
      }
      return writeContractAsync({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [covenantAddress, amount],
        chainId,
      });
    },
    [usdcAddress, covenantAddress, chainId, connectedChainId, switchChainAsync, writeContractAsync, writeEnabled],
  );

  return {
    usdcAddress,
    allowance: allowanceQ.data as bigint | undefined,
    balance: balanceQ.data as bigint | undefined,
    refetchAllowance: allowanceQ.refetch,
    approve,
    approveHash: hash,
    isApprovePending: isPending,
    isApproveConfirming: isConfirming,
    isApproveConfirmed: isConfirmed,
    approveError: error ?? receiptError,
    resetApprove: reset,
  };
}
