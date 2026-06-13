// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TraceFund
 * @notice Milestone-based crowdfunding with enforced accountability.
 *
 * Donations are held in escrow by this contract. A campaign creator can only
 * withdraw money one milestone at a time, and only after:
 *   1. submitting public evidence for the milestone, and
 *   2. donors representing at least 50% of the raised funds approving it.
 *
 * Approval is weighted by how much each donor contributed, so the people who
 * funded the campaign control whether the money is released. Every donation,
 * evidence submission, approval and release is recorded on-chain, building a
 * tamper-resistant accountability trail and a creator reputation history.
 *
 * @dev Designed as a generic EVM contract (no chain-specific assumptions) so the
 *      same architecture can be deployed to Base Mainnet and later Ethereum Mainnet.
 */
contract TraceFund is ReentrancyGuard {
    /// @notice Maximum number of milestones a single campaign may define.
    uint256 public constant MAX_MILESTONES = 5;

    /// @notice Approval threshold expressed in basis points (5000 = 50%).
    uint256 public constant APPROVAL_THRESHOLD_BPS = 5000;

    /// @notice Basis-point denominator (10000 = 100%).
    uint256 public constant BPS_DENOMINATOR = 10000;

    struct Milestone {
        string description; // what this milestone delivers
        uint256 amount; // amount of ETH unlocked when released (wei)
        string evidence; // proof submitted by the creator (URL / IPFS CID / text)
        bool evidenceSubmitted; // whether evidence has been submitted
        uint256 approvalWeight; // sum of donations of donors who approved this milestone
        uint256 approvalBase; // snapshot of total raised at the latest approval (denominator)
        bool released; // whether the milestone funds have been released
    }

    struct Campaign {
        uint256 id;
        address creator;
        string title;
        string description;
        uint256 goalAmount; // sum of all milestone amounts
        uint256 totalRaised; // total ETH donated into escrow
        uint256 totalReleased; // total ETH released to the creator so far
        bool active; // accepting donations / in progress
        bool completed; // all milestones released
        uint256 currentMilestone; // index of the milestone currently in progress
        uint256 createdAt; // creation timestamp
        uint256 donorCount; // number of unique donors
        uint256 milestoneCount; // number of milestones
    }

    struct CreatorStats {
        uint256 campaignsCreated;
        uint256 campaignsCompleted;
        uint256 totalRaised;
        uint256 totalReleased;
        uint256 milestonesCompleted;
        uint256 evidenceUpdates;
    }

    /// @notice Total number of campaigns ever created. Valid ids are [0, campaignCount).
    uint256 public campaignCount;

    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => Milestone[]) private _milestones;

    /// @notice donations[campaignId][donor] => total amount donated (wei).
    mapping(uint256 => mapping(address => uint256)) public donations;
    mapping(uint256 => address[]) private _donors;

    /// @notice approved[campaignId][milestoneIndex][donor] => whether the donor approved.
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public approved;

    mapping(address => CreatorStats) private _creatorStats;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        string title,
        uint256 goalAmount,
        uint256 milestoneCount
    );
    event DonationReceived(
        uint256 indexed campaignId,
        address indexed donor,
        uint256 amount,
        uint256 totalRaised
    );
    event EvidenceSubmitted(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        string evidence
    );
    event MilestoneApproved(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        address indexed donor,
        uint256 weight,
        uint256 totalApprovalWeight
    );
    event MilestoneReleased(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 amount,
        address creator
    );
    event CampaignCompleted(uint256 indexed campaignId);

    modifier campaignExists(uint256 campaignId) {
        require(campaignId < campaignCount, "Campaign does not exist");
        _;
    }

    // -------------------------------------------------------------------------
    // Core write functions
    // -------------------------------------------------------------------------

    /**
     * @notice Create a campaign. The goal amount is the sum of milestone amounts.
     * @param title Campaign title (required).
     * @param description Campaign description (required).
     * @param milestoneDescriptions Description for each milestone.
     * @param milestoneAmounts Amount (wei) unlocked by each milestone, must be > 0.
     * @return campaignId The id of the newly created campaign.
     */
    function createCampaign(
        string calldata title,
        string calldata description,
        string[] calldata milestoneDescriptions,
        uint256[] calldata milestoneAmounts
    ) external returns (uint256 campaignId) {
        require(bytes(title).length > 0, "Title required");
        require(bytes(description).length > 0, "Description required");

        uint256 n = milestoneDescriptions.length;
        require(n == milestoneAmounts.length, "Milestone length mismatch");
        require(n >= 1, "At least one milestone");
        require(n <= MAX_MILESTONES, "Too many milestones");

        campaignId = campaignCount++;

        uint256 goal;
        for (uint256 i = 0; i < n; i++) {
            require(milestoneAmounts[i] > 0, "Milestone amount must be > 0");
            require(bytes(milestoneDescriptions[i]).length > 0, "Milestone description required");

            _milestones[campaignId].push(
                Milestone({
                    description: milestoneDescriptions[i],
                    amount: milestoneAmounts[i],
                    evidence: "",
                    evidenceSubmitted: false,
                    approvalWeight: 0,
                    approvalBase: 0,
                    released: false
                })
            );
            goal += milestoneAmounts[i];
        }

        Campaign storage c = _campaigns[campaignId];
        c.id = campaignId;
        c.creator = msg.sender;
        c.title = title;
        c.description = description;
        c.goalAmount = goal;
        c.active = true;
        c.createdAt = block.timestamp;
        c.milestoneCount = n;

        _creatorStats[msg.sender].campaignsCreated += 1;

        emit CampaignCreated(campaignId, msg.sender, title, goal, n);
    }

    /**
     * @notice Donate ETH into a campaign's escrow.
     * @param campaignId The campaign to donate to.
     */
    function donate(uint256 campaignId) external payable campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        require(c.active, "Campaign not active");
        require(msg.value > 0, "Donation must be > 0");

        if (donations[campaignId][msg.sender] == 0) {
            _donors[campaignId].push(msg.sender);
            c.donorCount += 1;
        }
        donations[campaignId][msg.sender] += msg.value;
        c.totalRaised += msg.value;
        _creatorStats[c.creator].totalRaised += msg.value;

        emit DonationReceived(campaignId, msg.sender, msg.value, c.totalRaised);
    }

    /**
     * @notice Submit (or update) evidence for the current milestone. Does not release funds.
     * @param campaignId The campaign.
     * @param evidence Proof string: URL, IPFS CID, or text.
     */
    function submitEvidence(uint256 campaignId, string calldata evidence)
        external
        campaignExists(campaignId)
    {
        Campaign storage c = _campaigns[campaignId];
        require(msg.sender == c.creator, "Only creator");
        require(!c.completed, "Campaign completed");
        require(bytes(evidence).length > 0, "Evidence required");

        uint256 mi = c.currentMilestone;
        require(mi < c.milestoneCount, "No active milestone");

        Milestone storage m = _milestones[campaignId][mi];
        require(!m.released, "Milestone already released");

        m.evidence = evidence;
        m.evidenceSubmitted = true;
        _creatorStats[c.creator].evidenceUpdates += 1;

        emit EvidenceSubmitted(campaignId, mi, evidence);
    }

    /**
     * @notice Approve the current milestone. Approval weight equals the caller's donation.
     * @param campaignId The campaign.
     */
    function approveMilestone(uint256 campaignId) external campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        require(!c.completed, "Campaign completed");

        uint256 mi = c.currentMilestone;
        require(mi < c.milestoneCount, "No active milestone");

        Milestone storage m = _milestones[campaignId][mi];
        require(m.evidenceSubmitted, "Evidence not submitted");
        require(!m.released, "Milestone already released");

        uint256 weight = donations[campaignId][msg.sender];
        require(weight > 0, "Not a donor");
        require(!approved[campaignId][mi][msg.sender], "Already approved");

        approved[campaignId][mi][msg.sender] = true;
        m.approvalWeight += weight;
        m.approvalBase = c.totalRaised;

        emit MilestoneApproved(campaignId, mi, msg.sender, weight, m.approvalWeight);
    }

    /**
     * @notice Release the current milestone's funds once the approval threshold is met.
     *         Transfers exactly the milestone amount to the creator and advances the campaign.
     * @param campaignId The campaign.
     */
    function releaseMilestoneFunds(uint256 campaignId)
        external
        campaignExists(campaignId)
        nonReentrant
    {
        Campaign storage c = _campaigns[campaignId];
        require(!c.completed, "Campaign completed");

        uint256 mi = c.currentMilestone;
        require(mi < c.milestoneCount, "No active milestone");

        Milestone storage m = _milestones[campaignId][mi];
        require(m.evidenceSubmitted, "Evidence not submitted");
        require(!m.released, "Milestone already released");
        require(
            _thresholdReached(c.totalRaised, m.approvalWeight),
            "Approval threshold not reached"
        );
        require(address(this).balance >= m.amount, "Insufficient escrow balance");

        // Effects
        m.released = true;
        c.totalReleased += m.amount;
        c.currentMilestone += 1;

        CreatorStats storage s = _creatorStats[c.creator];
        s.totalReleased += m.amount;
        s.milestonesCompleted += 1;

        bool completed = c.currentMilestone >= c.milestoneCount;
        if (completed) {
            c.completed = true;
            c.active = false;
            s.campaignsCompleted += 1;
        }

        // Interaction
        (bool ok, ) = payable(c.creator).call{value: m.amount}("");
        require(ok, "Transfer failed");

        emit MilestoneReleased(campaignId, mi, m.amount, c.creator);
        if (completed) {
            emit CampaignCompleted(campaignId);
        }
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @notice Whether the current milestone has enough approval weight to be released.
    function isThresholdReached(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (bool)
    {
        Campaign storage c = _campaigns[campaignId];
        if (c.currentMilestone >= c.milestoneCount) return true;
        Milestone storage m = _milestones[campaignId][c.currentMilestone];
        return _thresholdReached(c.totalRaised, m.approvalWeight);
    }

    /// @notice Approval progress for the current milestone.
    function getApprovalProgress(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (uint256 approvalWeight, uint256 totalRaised, bool thresholdReached)
    {
        Campaign storage c = _campaigns[campaignId];
        totalRaised = c.totalRaised;
        if (c.currentMilestone >= c.milestoneCount) {
            return (0, totalRaised, true);
        }
        approvalWeight = _milestones[campaignId][c.currentMilestone].approvalWeight;
        thresholdReached = _thresholdReached(totalRaised, approvalWeight);
    }

    function getCampaign(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (Campaign memory)
    {
        return _campaigns[campaignId];
    }

    /// @notice Return every campaign. Convenience for the frontend campaign list.
    function getAllCampaigns() external view returns (Campaign[] memory list) {
        list = new Campaign[](campaignCount);
        for (uint256 i = 0; i < campaignCount; i++) {
            list[i] = _campaigns[i];
        }
    }

    function getMilestones(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (Milestone[] memory)
    {
        return _milestones[campaignId];
    }

    function getMilestone(uint256 campaignId, uint256 index)
        external
        view
        campaignExists(campaignId)
        returns (Milestone memory)
    {
        require(index < _milestones[campaignId].length, "Milestone does not exist");
        return _milestones[campaignId][index];
    }

    function getDonors(uint256 campaignId) external view returns (address[] memory) {
        return _donors[campaignId];
    }

    function getDonation(uint256 campaignId, address donor) external view returns (uint256) {
        return donations[campaignId][donor];
    }

    function hasApproved(uint256 campaignId, uint256 milestoneIndex, address donor)
        external
        view
        returns (bool)
    {
        return approved[campaignId][milestoneIndex][donor];
    }

    function getCreatorStats(address creator) external view returns (CreatorStats memory) {
        return _creatorStats[creator];
    }

    /**
     * @notice A 0-100 trust score derived from a creator's on-chain track record.
     *         Suggested labels: 0-19 New, 20-49 Early, 50-79 Proven, 80-100 Trusted.
     */
    function trustScore(address creator) public view returns (uint256) {
        CreatorStats memory s = _creatorStats[creator];
        if (s.campaignsCreated == 0) return 0;

        uint256 score = 10; // base for having launched a campaign
        score += s.milestonesCompleted * 12; // proof-backed delivery is the dominant signal
        score += s.campaignsCompleted * 15; // finishing campaigns matters

        uint256 evidencePoints = s.evidenceUpdates * 3;
        if (evidencePoints > 15) evidencePoints = 15; // capped so it can't be farmed
        score += evidencePoints;

        if (score > 100) score = 100;
        return score;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _thresholdReached(uint256 totalRaised, uint256 approvalWeight)
        internal
        pure
        returns (bool)
    {
        if (totalRaised == 0) return false;
        return approvalWeight * BPS_DENOMINATOR >= totalRaised * APPROVAL_THRESHOLD_BPS;
    }
}
