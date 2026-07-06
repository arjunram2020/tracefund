"use client";

import { useReadContract, useReadContracts } from "wagmi";
import {
  LEGACY_CHAIN_ID,
  archivedDeployments,
  type ArchivedDeployment,
  type LegacyCampaign,
  type LegacyMilestone,
} from "../lib/legacy";

/**
 * Read hooks for the retired Base Mainnet contracts shown in the History tab.
 * Always pinned to Base regardless of the connected wallet network, and
 * read-only by construction — there is no legacy write hook.
 */

export interface ArchivedCampaign {
  archive: ArchivedDeployment;
  campaign: LegacyCampaign;
}

/** Campaigns from EVERY archived deployment, tagged with their source. */
export function useArchivedCampaigns() {
  const q = useReadContracts({
    contracts: archivedDeployments.map((a) => ({
      address: a.address,
      abi: a.abi,
      functionName: "getAllCampaigns",
      chainId: LEGACY_CHAIN_ID,
    })),
    allowFailure: true,
  });

  const campaigns: ArchivedCampaign[] = (q.data ?? []).flatMap((result, i) => {
    if (result.status !== "success") return [];
    return (result.result as LegacyCampaign[]).map((campaign) => ({
      archive: archivedDeployments[i],
      campaign,
    }));
  });

  return { ...q, campaigns };
}

export function useLegacyCampaign(archive?: ArchivedDeployment, id?: bigint) {
  const q = useReadContract({
    address: archive?.address,
    abi: archive?.abi,
    functionName: "getCampaign",
    args: id !== undefined ? [id] : undefined,
    chainId: LEGACY_CHAIN_ID,
    query: { enabled: !!archive && id !== undefined },
  });
  return { ...q, campaign: q.data as LegacyCampaign | undefined };
}

export function useLegacyMilestones(archive?: ArchivedDeployment, id?: bigint) {
  const q = useReadContract({
    address: archive?.address,
    abi: archive?.abi,
    functionName: "getMilestones",
    args: id !== undefined ? [id] : undefined,
    chainId: LEGACY_CHAIN_ID,
    query: { enabled: !!archive && id !== undefined },
  });
  return { ...q, milestones: (q.data as LegacyMilestone[] | undefined) ?? [] };
}
