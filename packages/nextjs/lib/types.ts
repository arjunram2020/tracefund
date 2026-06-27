// Shapes that mirror the TraceFund.sol structs. viem decodes named tuple
// outputs into objects with these exact field names.

export interface Milestone {
  description: string;
  amount: bigint;
  evidence: string;
  evidenceSubmitted: boolean;
  approvalWeight: bigint;
  approvalBase: bigint;
  released: boolean;
}

export interface Campaign {
  id: bigint;
  creator: `0x${string}`;
  title: string;
  description: string;
  goalAmount: bigint;
  totalRaised: bigint;
  totalReleased: bigint;
  active: boolean;
  completed: boolean;
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
  milestonesCompleted: bigint;
  evidenceUpdates: bigint;
}

// Per-milestone UI status derived from on-chain state.
export type MilestoneStatus =
  | "locked"              // future milestone, not yet reachable
  | "funding"             // active but no donations yet — approval impossible
  | "awaiting-evidence"   // active, has donations, creator hasn't posted proof yet
  | "awaiting-approval"   // evidence submitted, waiting for donors to reach 50%
  | "ready-to-release"    // 50% approval threshold met — anyone can trigger release
  | "released";           // funds released to creator
