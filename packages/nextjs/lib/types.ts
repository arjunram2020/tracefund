// Shapes that mirror the Covenant.sol structs. viem decodes named tuple
// outputs into objects with these exact field names; enum values arrive as
// plain numbers matching Solidity declaration order.

export const ApprovalModel = {
  /** Any donor may vote; releases once approving weight clears the campaign's threshold %. */
  WeightedApproval: 0,
  DesignatedReviewers: 1,
  PlatformOperator: 2,
} as const;
export type ApprovalModelValue = (typeof ApprovalModel)[keyof typeof ApprovalModel];

export const MilestoneState = {
  Pending: 0,
  Submitted: 1,
  ChangesRequested: 2,
  Approved: 3,
} as const;
export type MilestoneStateValue = (typeof MilestoneState)[keyof typeof MilestoneState];

export const CampaignKind = {
  Charity: 0,
  Startup: 1,
  Grant: 2,
  Other: 3,
} as const;
export type CampaignKindValue = (typeof CampaignKind)[keyof typeof CampaignKind];

/** What the reviewer evaluates. Evidence stays flexible; criteria don't. */
export interface MilestoneCriteria {
  title: string;
  successDefinition: string;
  reportingPeriod: string;
  expectedMetrics: string;
  requiredProof: string;
  /** Unix seconds; 0n = no deadline (no timeout/refund path for this milestone). */
  proofDeadline: bigint;
}

export interface Milestone {
  criteria: MilestoneCriteria;
  amount: bigint;
  state: MilestoneStateValue;
  submissionCount: number;
  approvalCount: number;
  /** Sum of (per-voter capped) donations from approving voters on the latest submission (WeightedApproval). */
  approvedWeight: bigint;
  /** totalRaised snapshotted when the latest submission was made — the WeightedApproval denominator. */
  weightSnapshot: bigint;
  /** Distinct donor addresses who voted yes on the latest submission (WeightedApproval). */
  weightedApproverCount: number;
  /** Set when a reviewer rejects: the creator must resubmit by this time. */
  revisionDeadline: bigint;
  released: boolean;
}

/** On-chain record of one proof package. The full package (narrative,
 *  justification, metrics, evidence links) lives off-chain; the chain holds
 *  its keccak256 hash, an optional public pointer, and a short summary. */
export interface ProofSubmission {
  manifestHash: `0x${string}`;
  manifestURI: string;
  summary: string;
  submittedAt: bigint;
}

export interface ReviewDecision {
  reviewer: `0x${string}`;
  approved: boolean;
  notes: string;
  decidedAt: bigint;
  submissionIndex: number;
}

export interface ApprovalConfig {
  model: ApprovalModelValue;
  reviewers: readonly `0x${string}`[];
  threshold: number;
}

export interface Campaign {
  id: bigint;
  creator: `0x${string}`;
  title: string;
  description: string;
  kind: CampaignKindValue;
  goalAmount: bigint;
  totalRaised: bigint;
  totalReleased: bigint;
  active: boolean;
  completed: boolean;
  /** 0n = not cancelled. Non-zero opens pro-rata refunds for donors. */
  cancelledAt: bigint;
  currentMilestone: bigint;
  createdAt: bigint;
  donorCount: bigint;
  milestoneCount: bigint;
}

export interface CreatorStats {
  campaignsCreated: bigint;
  campaignsCompleted: bigint;
  totalRaised: bigint;
  totalReleased: bigint;
  /** Reviewer-verified milestone completions — the only thing reputation rewards. */
  milestonesApproved: bigint;
  /** Informational; submissions never move the trust score. */
  proofSubmissions: bigint;
}

// Per-milestone UI status derived from on-chain state + funding + deadlines.
export type MilestoneStatus =
  | "locked" //             future milestone, not yet reachable
  | "funding" //            active, tranche not yet covered by donations
  | "awaiting-proof" //     funded, waiting on the creator's proof package
  | "under-review" //       proof submitted, reviewers deciding
  | "changes-requested" //  rejected with notes, creator revising
  | "approved" //           reviewers approved; funds released
  | "expired"; //           deadline blown — campaign can be failed / refunded

export const APPROVAL_MODEL_LABELS: Record<ApprovalModelValue, string> = {
  [ApprovalModel.WeightedApproval]: "Weighted donor approval",
  [ApprovalModel.DesignatedReviewers]: "Designated reviewers",
  [ApprovalModel.PlatformOperator]: "Platform operator",
};

export const CAMPAIGN_KIND_LABELS: Record<CampaignKindValue, string> = {
  [CampaignKind.Charity]: "Charity / community",
  [CampaignKind.Startup]: "Startup / VC",
  [CampaignKind.Grant]: "Grant program",
  [CampaignKind.Other]: "Other",
};
