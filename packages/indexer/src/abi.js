// The five events emitted by Covenant.sol. The indexer only needs the EVENT
// fragments of the ABI — it never calls functions, it only listens.
// These signatures match contracts/Covenant.sol exactly.
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
    name: "EvidenceSubmitted",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "milestoneIndex", type: "uint256", indexed: true },
      { name: "evidence", type: "string", indexed: false },
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
];
