// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TraceFund
 * @notice Milestone-based crowdfunding with proof-gated accountability.
 *
 * Donors lock ETH into on-chain escrow. The total campaign goal is split
 * evenly across N milestones. The creator can only withdraw milestone N
 * after:
 *   1. Enough ETH has accumulated in escrow to cover milestones 0..N.
 *   2. The creator has submitted public evidence for milestone N-1 (no
 *      prerequisite for the very first milestone).
 *
 * This enforces a "prove before you progress" rule: money unlocks in
 * tranches, and each tranche requires on-chain proof of how the previous
 * tranche was used. Every donation, evidence post, and withdrawal is a
 * permanent on-chain record, building a tamper-resistant accountability
 * trail and a creator reputation history.
 */
contract TraceFund is ReentrancyGuard {
    uint256 public constant MAX_MILESTONES = 5;

    struct Milestone {
        string description;
        uint256 amount;           // wei released when this milestone is withdrawn
        string evidence;          // proof the creator posted for this milestone
        bool evidenceSubmitted;   // whether any evidence has been posted
        bool released;            // whether the creator has withdrawn these funds
    }

    struct Campaign {
        uint256 id;
        address creator;
        string title;
        string description;
        uint256 goalAmount;       // total ETH to raise (sum of all milestone amounts)
        uint256 totalRaised;
        uint256 totalReleased;
        bool active;
        bool completed;
        uint256 currentMilestone; // index of the next milestone available to withdraw
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

    /**
     * @notice Create a campaign with explicit per-milestone ETH amounts.
     * @param title             Campaign title.
     * @param description       Campaign description.
     * @param milestoneDescs    One description string per milestone.
     * @param milestoneAmounts  ETH amount (wei) unlocked at each milestone. goalAmount = sum.
     */
    function createCampaign(
        string calldata title,
        string calldata description,
        string[] calldata milestoneDescs,
        uint256[] calldata milestoneAmounts
    ) external returns (uint256 campaignId) {
        require(bytes(title).length > 0, "Title required");
        require(bytes(description).length > 0, "Description required");

        uint256 n = milestoneDescs.length;
        require(n >= 1, "At least one milestone");
        require(n <= MAX_MILESTONES, "Too many milestones");
        require(milestoneAmounts.length == n, "Amounts length mismatch");

        uint256 totalGoal = 0;
        for (uint256 i = 0; i < n; i++) {
            require(milestoneAmounts[i] > 0, "Each milestone amount must be > 0");
            totalGoal += milestoneAmounts[i];
        }

        campaignId = campaignCount++;

        for (uint256 i = 0; i < n; i++) {
            require(bytes(milestoneDescs[i]).length > 0, "Milestone description required");
            _milestones[campaignId].push(
                Milestone({
                    description: milestoneDescs[i],
                    amount: milestoneAmounts[i],
                    evidence: "",
                    evidenceSubmitted: false,
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

    /**
     * @notice Donate ETH into a campaign's escrow.
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
     * @notice Post (or update) evidence for any milestone. The creator can post
     *         proof for a milestone after withdrawing it, which is what unlocks
     *         the next milestone for withdrawal.
     * @param campaignId     The campaign.
     * @param milestoneIndex Which milestone this evidence is for.
     * @param evidence       URL, IPFS CID, or plain text proof.
     */
    function submitEvidence(
        uint256 campaignId,
        uint256 milestoneIndex,
        string calldata evidence
    ) external campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        require(msg.sender == c.creator, "Only creator");
        require(bytes(evidence).length > 0, "Evidence required");
        require(milestoneIndex < c.milestoneCount, "Invalid milestone index");

        Milestone storage m = _milestones[campaignId][milestoneIndex];
        m.evidence = evidence;
        m.evidenceSubmitted = true;
        _creatorStats[c.creator].evidenceUpdates += 1;

        emit EvidenceSubmitted(campaignId, milestoneIndex, evidence);
    }

    /**
     * @notice Withdraw the current milestone's funds. Only the creator may call this.
     *
     * Two gates must be satisfied:
     *   1. Funding: totalRaised >= sum of amounts for milestones 0..currentMilestone.
     *   2. Proof: for milestones after the first, the previous milestone must have
     *             evidence submitted on-chain.
     *
     * After withdrawal the creator should post evidence for this milestone so that
     * the next milestone becomes available.
     */
    function releaseMilestoneFunds(uint256 campaignId)
        external
        campaignExists(campaignId)
        nonReentrant
    {
        Campaign storage c = _campaigns[campaignId];
        require(msg.sender == c.creator, "Only creator");
        require(!c.completed, "Campaign completed");

        uint256 mi = c.currentMilestone;
        require(mi < c.milestoneCount, "No active milestone");

        Milestone storage m = _milestones[campaignId][mi];
        require(!m.released, "Already released");

        // Gate 1 — enough raised to cover this tranche cumulatively.
        uint256 cumulativeTarget = 0;
        for (uint256 i = 0; i <= mi; i++) {
            cumulativeTarget += _milestones[campaignId][i].amount;
        }
        require(c.totalRaised >= cumulativeTarget, "Funding threshold not reached");

        // Gate 2 — proof of previous milestone (waived for the first).
        if (mi > 0) {
            require(
                _milestones[campaignId][mi - 1].evidenceSubmitted,
                "Submit proof for previous milestone first"
            );
        }

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
        if (completed) emit CampaignCompleted(campaignId);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

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

    /**
     * @notice A 0-100 trust score derived from a creator's on-chain track record.
     *         Labels: 0-19 New, 20-49 Early, 50-79 Proven, 80-100 Trusted.
     */
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
