// The events emitted by Covenant.sol (proof/review flow). The indexer only
// needs the EVENT fragments of the ABI — it never calls functions, it only
// listens. These signatures match contracts/Covenant.sol exactly.
export const COVENANT_EVENTS = [
  {
    type: "event",
    name: "CampaignCreated",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "title", type: "string", indexed: false },
      { name: "goalAmount", type: "uint256", indexed: false },
      { name: "milestoneCount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DonationReceived",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "donor", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "totalRaised", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ProofSubmitted",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "milestoneIndex", type: "uint256", indexed: true },
      { name: "submissionIndex", type: "uint256", indexed: false },
      { name: "manifestHash", type: "bytes32", indexed: false },
      { name: "summary", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ProofReviewed",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "milestoneIndex", type: "uint256", indexed: true },
      { name: "reviewer", type: "address", indexed: true },
      { name: "submissionIndex", type: "uint256", indexed: false },
      { name: "approved", type: "bool", indexed: false },
      { name: "notes", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MilestoneReleased",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "milestoneIndex", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "creator", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CampaignCompleted",
    inputs: [{ name: "campaignId", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "CampaignCancelled",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "milestoneIndex", type: "uint256", indexed: false },
      { name: "voluntary", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RefundClaimed",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "donor", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreatorApprovalChanged",
    inputs: [
      { name: "creator", type: "address", indexed: true },
      { name: "approved", type: "bool", indexed: false },
    ],
  },
];

// Read-only function fragments the indexer calls (never writes) to check
// per-reviewer evidence authorization against live on-chain state — see
// EVIDENCE_ACCESS_MODE=per-reviewer in index.js. Kept separate from
// COVENANT_EVENTS because these are functions, not events.
export const COVENANT_READS = [
  {
    type: "function",
    name: "isReviewer",
    stateMutability: "view",
    inputs: [
      { name: "campaignId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getCampaign",
    stateMutability: "view",
    inputs: [{ name: "campaignId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "creator", type: "address" },
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "kind", type: "uint8" },
          { name: "goalAmount", type: "uint256" },
          { name: "totalRaised", type: "uint256" },
          { name: "totalReleased", type: "uint256" },
          { name: "active", type: "bool" },
          { name: "completed", type: "bool" },
          { name: "cancelledAt", type: "uint64" },
          { name: "currentMilestone", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "donorCount", type: "uint256" },
          { name: "milestoneCount", type: "uint256" },
        ],
      },
    ],
  },
];
