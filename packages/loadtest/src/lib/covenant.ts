import type { Abi, PublicClient } from "viem";
import type { Deployment } from "./chain.js";

/**
 * Typed views over the Covenant contract + the client-side rules the frontend
 * layers on top (per-milestone donation caps and the donation pause while a
 * milestone is under review). Actor behavior must match what real users can
 * actually do through the UI, so those rules live here, not in the actors.
 */

export enum ApprovalModel {
  WeightedApproval = 0,
  DesignatedReviewers = 1,
  PlatformOperator = 2,
}

export enum MilestoneState {
  Pending = 0,
  Submitted = 1,
  ChangesRequested = 2,
  Approved = 3,
}

export interface CampaignView {
  id: bigint;
  creator: `0x${string}`;
  title: string;
  description: string;
  kind: number;
  goalAmount: bigint;
  totalRaised: bigint;
  totalReleased: bigint;
  active: boolean;
  completed: boolean;
  cancelledAt: bigint;
  currentMilestone: bigint;
  createdAt: bigint;
  donorCount: bigint;
  milestoneCount: bigint;
}

export interface MilestoneView {
  criteria: {
    title: string;
    successDefinition: string;
    reportingPeriod: string;
    expectedMetrics: string;
    requiredProof: string;
    proofDeadline: bigint;
  };
  amount: bigint;
  state: number;
  submissionCount: number;
  approvalCount: number;
  approvedWeight: bigint;
  revisionDeadline: bigint;
  released: boolean;
}

export class Covenant {
  readonly address: `0x${string}`;
  readonly abi: Abi;

  constructor(
    deployment: Deployment,
    private client: PublicClient,
  ) {
    this.address = deployment.covenant.address;
    this.abi = deployment.covenant.abi;
  }

  private read<T>(functionName: string, args: unknown[] = []): Promise<T> {
    return this.client.readContract({
      address: this.address,
      abi: this.abi,
      functionName,
      args,
    }) as Promise<T>;
  }

  campaignCount = () => this.read<bigint>("campaignCount");
  getAllCampaigns = () => this.read<CampaignView[]>("getAllCampaigns");
  getCampaign = (id: bigint) => this.read<CampaignView>("getCampaign", [id]);
  getMilestones = (id: bigint) => this.read<MilestoneView[]>("getMilestones", [id]);
  getApprovalConfig = (id: bigint) =>
    this.read<{ model: number; reviewers: `0x${string}`[]; threshold: number }>(
      "getApprovalConfig",
      [id],
    );
  getDonation = (id: bigint, donor: `0x${string}`) =>
    this.read<bigint>("getDonation", [id, donor]);
  trustScore = (creator: `0x${string}`) => this.read<bigint>("trustScore", [creator]);
  getCreatorStats = (creator: `0x${string}`) => this.read<unknown>("getCreatorStats", [creator]);
  isReviewer = (id: bigint, account: `0x${string}`) =>
    this.read<boolean>("isReviewer", [id, account]);
  refundOf = (id: bigint, donor: `0x${string}`) => this.read<bigint>("refundOf", [id, donor]);
  getSubmissions = (id: bigint, mi: bigint) =>
    this.read<unknown[]>("getSubmissions", [id, mi]);
  getReviews = (id: bigint, mi: bigint) => this.read<unknown[]>("getReviews", [id, mi]);
}

/**
 * Frontend-mirrored funding state of a campaign's current milestone.
 * DonationPanel blocks donations entirely once the current milestone's
 * cumulative tranche is funded, until review resolves — so the simulated
 * donors must too, or the harness would measure flows real users can't reach.
 */
export function currentMilestoneFunding(c: CampaignView, milestones: MilestoneView[]) {
  const mi = Math.min(Number(c.currentMilestone), Math.max(milestones.length - 1, 0));
  const m = milestones[mi];
  const cumulativeTarget = milestones
    .slice(0, mi + 1)
    .reduce((s, x) => s + x.amount, 0n);
  const remainingToMilestone =
    cumulativeTarget > c.totalRaised ? cumulativeTarget - c.totalRaised : 0n;
  const locked =
    m !== undefined &&
    (m.state === MilestoneState.Submitted ||
      m.state === MilestoneState.ChangesRequested ||
      (m.state === MilestoneState.Pending && remainingToMilestone === 0n)); // funded, awaiting proof
  return { mi, milestone: m, cumulativeTarget, remainingToMilestone, locked };
}

/** Random-ish but valid milestone inputs for generated campaigns. */
export function milestoneInputs(amounts: bigint[], tag: string) {
  return amounts.map((amount, i) => ({
    criteria: {
      title: `Milestone ${i + 1} — ${tag}`,
      successDefinition: `Deliverable ${i + 1} for ${tag} is complete and verifiable by a stranger.`,
      reportingPeriod: "Per phase",
      expectedMetrics: "",
      requiredProof: "Receipts",
      proofDeadline: 0n,
    },
    amount,
  }));
}
