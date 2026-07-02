"use client";

import { useReadContract } from "wagmi";
import { LEGACY_CHAIN_ID, legacyAbi, legacyAddress } from "../lib/legacy";
import type { Campaign, Milestone } from "../lib/types";

/**
 * Read hooks for the retired Base Mainnet contract shown in the History tab.
 * Always pinned to Base regardless of the connected wallet network, and
 * read-only by construction — there is no legacy write hook.
 */

export function useLegacyCampaigns() {
  const q = useReadContract({
    address: legacyAddress,
    abi: legacyAbi,
    functionName: "getAllCampaigns",
    chainId: LEGACY_CHAIN_ID,
  });
  return { ...q, campaigns: (q.data as Campaign[] | undefined) ?? [] };
}

export function useLegacyCampaign(id?: bigint) {
  const q = useReadContract({
    address: legacyAddress,
    abi: legacyAbi,
    functionName: "getCampaign",
    args: id !== undefined ? [id] : undefined,
    chainId: LEGACY_CHAIN_ID,
    query: { enabled: id !== undefined },
  });
  return { ...q, campaign: q.data as Campaign | undefined };
}

export function useLegacyMilestones(id?: bigint) {
  const q = useReadContract({
    address: legacyAddress,
    abi: legacyAbi,
    functionName: "getMilestones",
    args: id !== undefined ? [id] : undefined,
    chainId: LEGACY_CHAIN_ID,
    query: { enabled: id !== undefined },
  });
  return { ...q, milestones: (q.data as Milestone[] | undefined) ?? [] };
}
