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

// Per-milestone UI status derived from on-chain state (PRD §14 MilestoneTimeline).
export type MilestoneStatus =
  | "locked"
  | "awaiting-evidence"
  | "evidence-submitted"
  | "awaiting-approval"
  | "ready-to-release"
  | "released";
