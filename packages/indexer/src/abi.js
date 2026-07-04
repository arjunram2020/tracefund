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
