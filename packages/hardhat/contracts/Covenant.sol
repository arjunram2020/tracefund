// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Covenant
 * @notice Milestone-based crowdfunding with on-chain evidence gates.
 *
 * All value flows in USDC (an ERC-20 with 6 decimals); every amount in this
 * contract is denominated in USDC base units. Donors must approve() this
 * contract before donating.
 *
 * Flow per milestone:
 *   1. Donors send USDC into escrow via donate() (after approving it).
 *   2. Once donations cover the milestone, the creator posts on-chain proof via
 *      submitEvidence() for the current milestone.
 *   3. Funds are automatically released to the creator and the next milestone begins.
 *
 * A milestone can only release once this campaign's own donations cover it
 * (totalReleased + amount <= totalRaised), so one campaign can never be paid
 * out of another campaign's escrow.
 */
contract Covenant is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_MILESTONES = 5;

    // Anti-spam limits. Campaign creation is nearly free on an L2, so an
    // unapproved address gets a small lifetime allowance and a cooldown;
    // beyond that the platform owner must approve the creator. NOTE: these
    // limits are per-address, not per-person — a determined spammer can rotate
    // wallets. They raise friction; curation/identity is the full answer.
    uint256 public constant FREE_CAMPAIGNS = 2;
    uint256 public constant CREATION_COOLDOWN = 1 days;

    /// @notice Creators vetted by the platform — exempt from the limits above.
    mapping(address => bool) public approvedCreators;
    /// @notice Last createCampaign timestamp per creator, for the cooldown.
    mapping(address => uint256) public lastCampaignAt;

    /// @notice The ERC-20 token (USDC) all donations and releases are settled in.
    IERC20 public immutable usdc;

    struct Milestone {
        string description;
        uint256 amount;
        string evidence;
        bool evidenceSubmitted;
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
    event CreatorApprovalChanged(address indexed creator, bool approved);

    modifier campaignExists(uint256 campaignId) {
        require(campaignId < campaignCount, "Campaign does not exist");
        _;
    }

    constructor(IERC20 usdc_) Ownable(msg.sender) {
        require(address(usdc_) != address(0), "USDC address required");
        usdc = usdc_;
    }

    /// @notice Vet (or un-vet) a creator, lifting the per-address spam limits.
    function setCreatorApproval(address creator, bool approved) external onlyOwner {
        approvedCreators[creator] = approved;
        emit CreatorApprovalChanged(creator, approved);
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
        if (!approvedCreators[msg.sender]) {
            require(
                _creatorStats[msg.sender].campaignsCreated < FREE_CAMPAIGNS,
                "Campaign limit reached - request creator approval"
            );
            require(
                block.timestamp >= lastCampaignAt[msg.sender] + CREATION_COOLDOWN,
                "One campaign per day - try again later"
            );
        }
        lastCampaignAt[msg.sender] = block.timestamp;

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
     * @notice Donate USDC into this campaign's escrow.
     * @param amount USDC base units; the donor must have approve()d at least
     *        this much to the contract beforehand.
     */
    function donate(uint256 campaignId, uint256 amount) external campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        require(c.active, "Campaign not active");
        // Creators can't fund their own campaign: self-donations would let them
        // farm trust score for free (donate -> junk evidence -> auto-release
        // back to themselves) and inflate totalRaised with wash donations.
        require(msg.sender != c.creator, "Creator cannot donate to own campaign");
        require(amount > 0, "Donation must be > 0");
        require(c.totalRaised + amount <= c.goalAmount, "Donation exceeds campaign goal");

        if (donations[campaignId][msg.sender] == 0) {
            _donors[campaignId].push(msg.sender);
            c.donorCount += 1;
        }
        donations[campaignId][msg.sender] += amount;
        c.totalRaised += amount;
        _creatorStats[c.creator].totalRaised += amount;

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit DonationReceived(campaignId, msg.sender, amount, c.totalRaised);
    }

    /**
     * @notice Creator submits proof for the current milestone.
     *         Funds are automatically released to the creator upon submission.
     */
    function submitEvidence(
        uint256 campaignId,
        string calldata evidence
    ) external campaignExists(campaignId) nonReentrant {
        Campaign storage c = _campaigns[campaignId];
        require(msg.sender == c.creator, "Only creator");
        require(bytes(evidence).length > 0, "Evidence required");
        require(c.active && !c.completed, "Campaign not active");

        uint256 mi = c.currentMilestone;
        require(mi < c.milestoneCount, "No active milestone");

        Milestone storage m = _milestones[campaignId][mi];
        require(!m.released, "Already released");
        // Release only what this campaign's own donations cover — otherwise the
        // transfer below would be paid out of other campaigns' escrow.
        require(c.totalReleased + m.amount <= c.totalRaised, "Milestone not funded");

        m.evidence = evidence;
        m.evidenceSubmitted = true;
        _creatorStats[c.creator].evidenceUpdates += 1;

        emit EvidenceSubmitted(campaignId, mi, evidence);

        // Auto-release: transfer this milestone's funds to the creator
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

        usdc.safeTransfer(c.creator, m.amount);

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
