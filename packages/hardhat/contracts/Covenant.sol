// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Covenant
 * @notice Milestone-based crowdfunding with donor-weighted approval gates.
 *
 * Flow per milestone:
 *   1. Donors send ETH into escrow via donate().
 *   2. Creator posts on-chain evidence via submitEvidence() for the current milestone.
 *   3. Donors call approveMilestone() — each vote is weighted by their donation amount.
 *   4. Once cumulative approval weight >= 50% of totalRaised, anyone can call
 *      releaseMilestoneFunds() to transfer that tranche to the creator.
 *   5. currentMilestone advances; repeat from step 2.
 */
contract Covenant is ReentrancyGuard {
    uint256 public constant MAX_MILESTONES = 5;
    uint256 public constant APPROVAL_THRESHOLD_BPS = 5000; // 50%
    uint256 public constant BPS_DENOMINATOR = 10000;

    struct Milestone {
        string description;
        uint256 amount;
        string evidence;
        bool evidenceSubmitted;
        uint256 approvalWeight; // cumulative donation weight of approving donors
        uint256 approvalBase;   // totalRaised snapshot at last approval (informational)
        bool released;
    }

    struct Campaign {
        uint256 id;
        address creator;
        string title;
        string description;
        uint256 goalAmount;
        uint256 totalRaised;
        uint256 totalReleased;
        bool active;
        bool completed;
        uint256 currentMilestone;
        uint256 createdAt;
        uint256 donorCount;
        uint256 milestoneCount;
    }

    struct CreatorStats {
        uint256 campaignsCreated;
        uint256 campaignsCompleted;
        uint256 totalRaised;
        uint256 totalReleased;
        uint256 milestonesCompleted;
        uint256 evidenceUpdates;
    }

    uint256 public campaignCount;

    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => Milestone[]) private _milestones;
    mapping(uint256 => mapping(address => uint256)) public donations;
    mapping(uint256 => address[]) private _donors;
    mapping(address => CreatorStats) private _creatorStats;
    // approved[campaignId][milestoneIndex][donor] = true once they approve
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public approved;

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
    // Write functions
    // -------------------------------------------------------------------------

    function createCampaign(
        string calldata title,
        string calldata description,
        string[] calldata milestoneDescriptions,
        uint256[] calldata milestoneAmounts
    ) external returns (uint256 campaignId) {
        require(bytes(title).length > 0, "Title required");
        require(bytes(description).length > 0, "Description required");
        uint256 n = milestoneDescriptions.length;
        require(n >= 1, "At least one milestone");
        require(n <= MAX_MILESTONES, "Too many milestones");
        require(milestoneAmounts.length == n, "Milestone length mismatch");

        uint256 totalGoal = 0;
        for (uint256 i = 0; i < n; i++) {
            require(milestoneAmounts[i] > 0, "Milestone amount must be > 0");
            totalGoal += milestoneAmounts[i];
        }

        campaignId = campaignCount++;

        for (uint256 i = 0; i < n; i++) {
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
        }

        Campaign storage c = _campaigns[campaignId];
        c.id = campaignId;
        c.creator = msg.sender;
        c.title = title;
        c.description = description;
        c.goalAmount = totalGoal;
        c.active = true;
        c.createdAt = block.timestamp;
        c.milestoneCount = n;

        _creatorStats[msg.sender].campaignsCreated += 1;
        emit CampaignCreated(campaignId, msg.sender, title, totalGoal, n);
    }

    function donate(uint256 campaignId) external payable campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        require(c.active, "Campaign not active");
        require(msg.value > 0, "Donation must be > 0");

        // A single donation must stay strictly below the current milestone's
        // amount, so no one donor can single-handedly fund (and then dominate the
        // weighted approval of) a milestone in one shot. An active campaign always
        // has a valid current milestone (completion flips `active` to false).
        Milestone storage current = _milestones[campaignId][c.currentMilestone];
        require(msg.value < current.amount, "Donation must be below milestone amount");
        // A campaign can never raise more than its goal (sum of all milestones).
        require(c.totalRaised + msg.value <= c.goalAmount, "Donation exceeds campaign goal");

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
     * @notice Creator submits proof for the current milestone.
     *         This is a prerequisite before donors can approve and funds can be released.
     */
    function submitEvidence(
        uint256 campaignId,
        string calldata evidence
    ) external campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        require(msg.sender == c.creator, "Only creator");
        require(bytes(evidence).length > 0, "Evidence required");
        require(!c.completed, "Campaign completed");

        uint256 mi = c.currentMilestone;
        require(mi < c.milestoneCount, "No active milestone");

        Milestone storage m = _milestones[campaignId][mi];
        m.evidence = evidence;
        m.evidenceSubmitted = true;
        _creatorStats[c.creator].evidenceUpdates += 1;

        emit EvidenceSubmitted(campaignId, mi, evidence);
    }

    /**
     * @notice Donor approves the current milestone. Vote weight = their donation amount.
     *         Requires evidence to have been submitted first.
     */
    function approveMilestone(uint256 campaignId) external campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        require(c.active, "Campaign not active");
        require(!c.completed, "Campaign completed");

        uint256 mi = c.currentMilestone;
        require(mi < c.milestoneCount, "No active milestone");

        Milestone storage m = _milestones[campaignId][mi];
        require(m.evidenceSubmitted, "Evidence not submitted");

        uint256 donorAmount = donations[campaignId][msg.sender];
        require(donorAmount > 0, "Not a donor");
        require(!approved[campaignId][mi][msg.sender], "Already approved");

        approved[campaignId][mi][msg.sender] = true;
        m.approvalWeight += donorAmount;
        m.approvalBase = c.totalRaised;

        emit MilestoneApproved(campaignId, mi, msg.sender, donorAmount, m.approvalWeight);
    }

    /**
     * @notice Release the current milestone's funds to the creator.
     *         Can be called by anyone once evidence is submitted and the 50% approval
     *         threshold is met (weighted by donation amount).
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
        require(!m.released, "Already released");
        require(m.evidenceSubmitted, "Evidence not submitted");
        require(
            c.totalRaised > 0 &&
                m.approvalWeight * BPS_DENOMINATOR >= c.totalRaised * APPROVAL_THRESHOLD_BPS,
            "Approval threshold not reached"
        );

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

        (bool ok, ) = payable(c.creator).call{value: m.amount}("");
        require(ok, "Transfer failed");

        emit MilestoneReleased(campaignId, mi, m.amount, c.creator);
        if (completed) emit CampaignCompleted(campaignId);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    function getApprovalProgress(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (uint256 approvalWeight, uint256 totalRaised, bool thresholdReached)
    {
        Campaign storage c = _campaigns[campaignId];
        totalRaised = c.totalRaised;
        uint256 mi = c.currentMilestone;
        if (mi >= c.milestoneCount) return (0, totalRaised, false);
        approvalWeight = _milestones[campaignId][mi].approvalWeight;
        thresholdReached = totalRaised > 0 &&
            approvalWeight * BPS_DENOMINATOR >= totalRaised * APPROVAL_THRESHOLD_BPS;
    }

    function hasApproved(uint256 campaignId, uint256 milestoneIndex, address donor)
        external
        view
        returns (bool)
    {
        return approved[campaignId][milestoneIndex][donor];
    }

    function isThresholdReached(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (bool)
    {
        Campaign storage c = _campaigns[campaignId];
        uint256 mi = c.currentMilestone;
        if (mi >= c.milestoneCount || c.totalRaised == 0) return false;
        Milestone storage m = _milestones[campaignId][mi];
        return m.approvalWeight * BPS_DENOMINATOR >= c.totalRaised * APPROVAL_THRESHOLD_BPS;
    }

    function getCampaign(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (Campaign memory)
    {
        return _campaigns[campaignId];
    }

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

    function getCreatorStats(address creator) external view returns (CreatorStats memory) {
        return _creatorStats[creator];
    }

    function trustScore(address creator) public view returns (uint256) {
        CreatorStats memory s = _creatorStats[creator];
        if (s.campaignsCreated == 0) return 0;

        uint256 score = 10;
        score += s.milestonesCompleted * 12;
        score += s.campaignsCompleted * 15;

        uint256 evidencePoints = s.evidenceUpdates * 3;
        if (evidencePoints > 15) evidencePoints = 15;
        score += evidencePoints;

        if (score > 100) score = 100;
        return score;
    }
}
