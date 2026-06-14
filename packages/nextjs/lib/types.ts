// Shapes that mirror the TraceFund.sol structs. viem decodes named tuple
// outputs into objects with these exact field names.

export interface Milestone {
  description: string;
  amount: bigint;
  evidence: string;
  evidenceSubmitted: boolean;
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
  | "locked"             // future milestone or proof gate not yet met
  | "funding"            // proof gate passed but not enough raised yet
  | "ready-to-withdraw"  // threshold reached and proof gate passed
  | "withdrawn"          // creator withdrew, proof not yet submitted
  | "proven";            // withdrawn and evidence submitted
