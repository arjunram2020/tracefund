// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Covenant
 * @notice Milestone-based USDC escrow with explicit acceptance criteria,
 *         optionally reviewer-gated releases, and donor refunds.
 *
 * All value flows in USDC (an ERC-20 with 6 decimals); every amount in this
 * contract is denominated in USDC base units. Donors must approve() this
 * contract before donating.
 *
 * Flow per milestone:
 *   1. Donors send USDC into escrow via donate() (after approving it).
 *   2. Once donations cover the milestone, the creator submits a proof
 *      package via submitProof(). This does NOT release funds.
 *   3. The campaign's configured approvers evaluate the proof against the
 *      milestone's acceptance criteria and approve or reject it. Funds
 *      release only when the approval threshold is met. On rejection the
 *      creator revises and resubmits; escrow stays locked.
 *
 * Approval authority is configured per campaign:
 *   - WeightedApproval: any donor may vote, weighted by how much USDC they've
 *     personally donated to this campaign; releases once the approving
 *     weight reaches the campaign's configured percentage of total raised.
 *   - DesignatedReviewers: an explicit reviewer set + threshold (committee
 *     when threshold > 1).
 *   - PlatformOperator: the contract owner (grant administrator / platform).
 *
 * Evidence privacy boundary: the chain stores a short public summary plus a
 * keccak256 hash of the full proof-package manifest (and, only when the
 * creator opts in, a public manifest URI). Sensitive raw evidence is never
 * required to live on-chain; the hash lets any reviewer verify an off-chain
 * package byte-for-byte.
 *
 * Failure handling: each milestone can carry a proof deadline. If the
 * creator misses it (or reviewers go silent past a grace window), anyone can
 * cancel the campaign and every donor can reclaim their share of the
 * unreleased escrow. A milestone can only release from this campaign's own
 * donations (totalReleased + amount <= totalRaised), so one campaign can
 * never be paid out of another campaign's escrow.
 */
contract Covenant is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_MILESTONES = 5;
    uint256 public constant MAX_REVIEWERS = 7;
    /// @notice How long reviewers have to act on a submission before the
    ///         campaign can be failed and donors refunded. Runs from the
    ///         later of the submission time and the proof deadline.
    uint256 public constant REVIEW_WINDOW = 14 days;
    /// @notice How long a creator has to revise and resubmit after a
    ///         rejection. After it lapses (or the milestone's own deadline,
    ///         whichever comes first), donors can recover their funds.
    uint256 public constant REVISION_WINDOW = 14 days;

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

    /// @notice The ERC-20 token (USDC) all donations, releases and refunds settle in.
    IERC20 public immutable usdc;

    // -------------------------------------------------------------------------
    // Data model
    // -------------------------------------------------------------------------

    /// @notice Who has the authority to approve milestone proof.
    enum ApprovalModel {
        WeightedApproval,    // any donor may vote, weighted by their USDC donated
        DesignatedReviewers, // explicit reviewer set + threshold (committee when threshold > 1)
        PlatformOperator     // the contract owner (grant administrator / platform)
    }

    /// @notice Review lifecycle of a single milestone. "Expired" is derived
    ///         from the deadline in views, not stored.
    enum MilestoneState {
        Pending,          // no proof submitted yet
        Submitted,        // proof awaiting review
        ChangesRequested, // rejected with notes; creator may revise and resubmit
        Approved          // threshold met, funds released
    }

    /// @notice Campaign flavor. Only used by clients (defaults, drafting); the
    ///         contract applies identical rules to every kind.
    enum CampaignKind {
        Charity,
        Startup,
        Grant,
        Other
    }

    /// @notice What the reviewer is evaluating. Evidence stays flexible; the
    ///         acceptance criteria cannot stay vague.
    struct MilestoneCriteria {
        string title;             // short label, e.g. "Hospital deposit paid"
        string successDefinition; // what "done" means, in plain language
        string reportingPeriod;   // e.g. "every 2 weeks", "once, by distribution day"
        string expectedMetrics;   // e.g. "500 MAU, 20% retention" ("" if n/a)
        string requiredProof;     // e.g. "receipts, analytics screenshots"
        uint64 proofDeadline;     // unix seconds; 0 = no deadline (no timeout path)
    }

    struct Milestone {
        MilestoneCriteria criteria;
        uint256 amount;           // USDC released when approved
        MilestoneState state;
        uint32 submissionCount;   // proof packages submitted so far
        uint8 approvalCount;      // approvals for the latest submission (count-based models)
        uint256 approvedWeight;   // approving donor weight for the latest submission (WeightedApproval)
        uint64 revisionDeadline;  // set on rejection: resubmit by this time or fail
        bool released;
    }

    /// @notice One proof package. The full package (narrative, justification,
    ///         metrics, evidence links) lives off-chain; the chain keeps its
    ///         hash, an optional public pointer, and a short public summary.
    struct ProofSubmission {
        bytes32 manifestHash; // keccak256 of the canonical manifest JSON
        string manifestURI;   // optional public pointer (data:/https/ipfs); "" = private
        string summary;       // short, non-sensitive, public
        uint64 submittedAt;
    }

    struct ReviewDecision {
        address reviewer;
        bool approved;
        string notes;           // required when rejecting
        uint64 decidedAt;
        uint32 submissionIndex; // which proof package this decision reviewed
    }

    struct ApprovalConfig {
        ApprovalModel model;
        address[] reviewers; // only for DesignatedReviewers
        uint8 threshold;     // approvals needed (count models), or percent 1-100 (WeightedApproval)
    }

    /// @notice createCampaign input for one milestone.
    struct MilestoneInput {
        MilestoneCriteria criteria;
        uint256 amount;
    }

    struct Campaign {
        uint256 id;
        address creator;
        string title;
        string description;
        CampaignKind kind;
        uint256 goalAmount;
        uint256 totalRaised;
        uint256 totalReleased;
        bool active;
        bool completed;
        uint64 cancelledAt; // 0 = not cancelled; set on voluntary cancel or deadline failure
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
        uint256 milestonesApproved; // verified by reviewers — drives reputation
        uint256 proofSubmissions;   // informational only; never scores
    }

    uint256 public campaignCount;

    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => Milestone[]) private _milestones;
    mapping(uint256 => ApprovalConfig) private _approvals;
    mapping(uint256 => mapping(uint256 => ProofSubmission[])) private _submissions;
    mapping(uint256 => mapping(uint256 => ReviewDecision[])) private _reviews;
    // campaignId => milestoneIndex => submissionIndex => reviewer => voted
    mapping(uint256 => mapping(uint256 => mapping(uint256 => mapping(address => bool))))
        private _reviewed;
    mapping(uint256 => mapping(address => uint256)) public donations;
    mapping(uint256 => address[]) private _donors;
    mapping(address => CreatorStats) private _creatorStats;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

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
    event ProofSubmitted(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 submissionIndex,
        bytes32 manifestHash,
        string summary
    );
    event ProofReviewed(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        address indexed reviewer,
        uint256 submissionIndex,
        bool approved,
        string notes
    );
    event MilestoneReleased(
        uint256 indexed campaignId,
        uint256 indexed milestoneIndex,
        uint256 amount,
        address creator
    );
    event CampaignCompleted(uint256 indexed campaignId);
    event CampaignCancelled(
        uint256 indexed campaignId,
        uint256 milestoneIndex,
        bool voluntary
    );
    event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 amount);
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
        CampaignKind kind,
        ApprovalConfig calldata approval,
        MilestoneInput[] calldata items
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
        uint256 n = items.length;
        require(n >= 1, "At least one milestone");
        require(n <= MAX_MILESTONES, "Too many milestones");

        _validateApprovalConfig(approval);

        campaignId = campaignCount++;

        uint256 totalGoal = 0;
        for (uint256 i = 0; i < n; i++) {
            MilestoneInput calldata item = items[i];
            require(item.amount > 0, "Milestone amount must be > 0");
            require(bytes(item.criteria.title).length > 0, "Milestone title required");
            require(
                bytes(item.criteria.successDefinition).length > 0,
                "Milestone success definition required"
            );
            require(
                item.criteria.proofDeadline == 0 ||
                    item.criteria.proofDeadline > block.timestamp,
                "Milestone deadline must be in the future"
            );
            totalGoal += item.amount;

            _milestones[campaignId].push(
                Milestone({
                    criteria: item.criteria,
                    amount: item.amount,
                    state: MilestoneState.Pending,
                    submissionCount: 0,
                    approvalCount: 0,
                    approvedWeight: 0,
                    revisionDeadline: 0,
                    released: false
                })
            );
        }

        ApprovalConfig storage cfg = _approvals[campaignId];
        cfg.model = approval.model;
        cfg.threshold = approval.threshold;
        for (uint256 i = 0; i < approval.reviewers.length; i++) {
            cfg.reviewers.push(approval.reviewers[i]);
        }

        Campaign storage c = _campaigns[campaignId];
        c.id = campaignId;
        c.creator = msg.sender;
        c.title = title;
        c.description = description;
        c.kind = kind;
        c.goalAmount = totalGoal;
        c.active = true;
        c.createdAt = block.timestamp;
        c.milestoneCount = n;

        _creatorStats[msg.sender].campaignsCreated += 1;
        emit CampaignCreated(campaignId, msg.sender, title, totalGoal, n);
    }

    function _validateApprovalConfig(ApprovalConfig calldata approval) private view {
        if (approval.model == ApprovalModel.DesignatedReviewers) {
            uint256 rn = approval.reviewers.length;
            require(rn >= 1, "Reviewers required");
            require(rn <= MAX_REVIEWERS, "Too many reviewers");
            require(
                approval.threshold >= 1 && approval.threshold <= rn,
                "Threshold must be 1..reviewer count"
            );
            for (uint256 i = 0; i < rn; i++) {
                address r = approval.reviewers[i];
                require(r != address(0), "Reviewer cannot be zero address");
                require(r != msg.sender, "Creator cannot review own campaign");
                for (uint256 j = i + 1; j < rn; j++) {
                    require(r != approval.reviewers[j], "Duplicate reviewer");
                }
            }
        } else if (approval.model == ApprovalModel.PlatformOperator) {
            require(approval.reviewers.length == 0, "Reviewers only for designated model");
            require(approval.threshold == 1, "Threshold must be 1 for this model");
        } else {
            // ApprovalModel.WeightedApproval — no reviewer list; threshold is
            // the percent (1-100) of donated weight required to approve.
            require(approval.reviewers.length == 0, "Reviewers only for designated model");
            require(
                approval.threshold >= 1 && approval.threshold <= 100,
                "Threshold must be 1..100 percent"
            );
        }
    }

    /**
     * @notice Donate USDC into this campaign's escrow.
     * @param amount USDC base units; the donor must have approve()d at least
     *        this much to the contract beforehand.
     */
    function donate(uint256 campaignId, uint256 amount) external campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        require(c.active, "Campaign not active");
        // A campaign past its milestone deadline is headed for cancellation;
        // taking new escrow into it would only grow the refund pool.
        require(!milestoneFailed(campaignId), "Milestone deadline passed");
        // Creators can't fund their own campaign: self-donations would let them
        // farm trust score and inflate totalRaised with wash donations.
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
     * @notice Creator submits a proof package for the current milestone.
     *         Funds are NOT released here — the campaign's approvers must
     *         approve the package against the milestone's acceptance criteria.
     * @param summary Short public summary (keep sensitive detail off-chain).
     * @param manifestHash keccak256 of the canonical proof-package manifest.
     * @param manifestURI Optional public pointer to the manifest; pass "" to
     *        keep the package private (reviewers verify it via the hash).
     */
    function submitProof(
        uint256 campaignId,
        string calldata summary,
        bytes32 manifestHash,
        string calldata manifestURI
    ) external campaignExists(campaignId) nonReentrant {
        Campaign storage c = _campaigns[campaignId];
        require(msg.sender == c.creator, "Only creator");
        require(c.active, "Campaign not active");
        require(bytes(summary).length > 0, "Summary required");
        require(manifestHash != bytes32(0), "Manifest hash required");

        uint256 mi = c.currentMilestone;
        require(mi < c.milestoneCount, "No active milestone");

        Milestone storage m = _milestones[campaignId][mi];
        require(
            m.state == MilestoneState.Pending || m.state == MilestoneState.ChangesRequested,
            "Milestone not awaiting proof"
        );
        uint64 deadline = m.criteria.proofDeadline;
        require(deadline == 0 || block.timestamp <= deadline, "Proof deadline passed");
        // Resubmissions after a rejection must land inside the revision window.
        if (m.state == MilestoneState.ChangesRequested) {
            require(block.timestamp <= m.revisionDeadline, "Revision window closed");
        }
        // The tranche must be funded before review starts; releasing an
        // underfunded milestone would draw from other campaigns' escrow.
        require(c.totalReleased + m.amount <= c.totalRaised, "Milestone not funded");

        uint256 submissionIndex = _submissions[campaignId][mi].length;
        _submissions[campaignId][mi].push(
            ProofSubmission({
                manifestHash: manifestHash,
                manifestURI: manifestURI,
                summary: summary,
                submittedAt: uint64(block.timestamp)
            })
        );
        m.state = MilestoneState.Submitted;
        m.approvalCount = 0;
        m.approvedWeight = 0;
        m.submissionCount += 1;
        _creatorStats[c.creator].proofSubmissions += 1;

        emit ProofSubmitted(campaignId, mi, submissionIndex, manifestHash, summary);
    }

    /**
     * @notice An authorized reviewer approves or rejects the latest proof
     *         package for the current milestone. Rejection requires notes and
     *         sends the milestone back to the creator for revision; approval
     *         releases funds once the campaign's threshold is met.
     */
    function reviewProof(
        uint256 campaignId,
        bool approve,
        string calldata notes
    ) external campaignExists(campaignId) nonReentrant {
        Campaign storage c = _campaigns[campaignId];
        require(c.active, "Campaign not active");
        require(isReviewer(campaignId, msg.sender), "Not an authorized reviewer");
        require(msg.sender != c.creator, "Creator cannot review own campaign");

        uint256 mi = c.currentMilestone;
        require(mi < c.milestoneCount, "No active milestone");
        Milestone storage m = _milestones[campaignId][mi];
        require(m.state == MilestoneState.Submitted, "No proof awaiting review");

        uint256 submissionIndex = _submissions[campaignId][mi].length - 1;
        require(
            !_reviewed[campaignId][mi][submissionIndex][msg.sender],
            "Already reviewed this submission"
        );
        _reviewed[campaignId][mi][submissionIndex][msg.sender] = true;

        if (!approve) {
            require(bytes(notes).length > 0, "Rejection notes required");
        }

        _reviews[campaignId][mi].push(
            ReviewDecision({
                reviewer: msg.sender,
                approved: approve,
                notes: notes,
                decidedAt: uint64(block.timestamp),
                submissionIndex: uint32(submissionIndex)
            })
        );

        emit ProofReviewed(campaignId, mi, msg.sender, submissionIndex, approve, notes);

        if (!approve) {
            // One rejection sends the package back for revision. Escrow stays
            // locked, and the creator gets a bounded window to fix the proof —
            // after that, donors can fail the campaign and reclaim their funds.
            m.state = MilestoneState.ChangesRequested;
            m.revisionDeadline = uint64(block.timestamp + REVISION_WINDOW);
            return;
        }

        if (_approvals[campaignId].model == ApprovalModel.WeightedApproval) {
            // Weighted by how much USDC this voter has personally donated.
            // Uses the *current* totalRaised as the denominator — donations
            // landing mid-vote can shift the bar; a hard snapshot would need
            // its own design (see docs). Existing votes' recorded weight
            // isn't affected either way.
            m.approvedWeight += donations[campaignId][msg.sender];
            if (
                c.totalRaised > 0 &&
                m.approvedWeight * 100 >= c.totalRaised * _approvals[campaignId].threshold
            ) {
                _releaseMilestone(campaignId, c, m, mi);
            }
        } else {
            m.approvalCount += 1;
            if (m.approvalCount >= _approvals[campaignId].threshold) {
                _releaseMilestone(campaignId, c, m, mi);
            }
        }
    }

    function _releaseMilestone(
        uint256 campaignId,
        Campaign storage c,
        Milestone storage m,
        uint256 mi
    ) private {
        m.state = MilestoneState.Approved;
        m.released = true;
        c.totalReleased += m.amount;
        c.currentMilestone += 1;

        CreatorStats storage s = _creatorStats[c.creator];
        s.totalReleased += m.amount;
        s.milestonesApproved += 1;

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

    /**
     * @notice Creator voluntarily cancels their campaign, opening refunds for
     *         all unreleased escrow.
     */
    function cancelCampaign(uint256 campaignId) external campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        require(msg.sender == c.creator, "Only creator");
        require(c.active, "Campaign not active");
        _cancel(campaignId, c, true);
    }

    /**
     * @notice Anyone can fail a campaign whose current milestone missed its
     *         proof deadline (plus REVIEW_WINDOW when a submission is stuck in
     *         review), opening refunds. This is the recovery path when a
     *         creator disappears — or when reviewers do.
     */
    function failCampaign(uint256 campaignId) external campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        require(c.active, "Campaign not active");
        require(milestoneFailed(campaignId), "Deadline has not passed");
        _cancel(campaignId, c, false);
    }

    function _cancel(uint256 campaignId, Campaign storage c, bool voluntary) private {
        c.active = false;
        c.cancelledAt = uint64(block.timestamp);
        emit CampaignCancelled(campaignId, c.currentMilestone, voluntary);
    }

    /**
     * @notice After cancellation, each donor reclaims their pro-rata share of
     *         the unreleased escrow: donation * (totalRaised - totalReleased)
     *         / totalRaised. Funds already released for approved milestones
     *         are not clawed back.
     */
    function claimRefund(uint256 campaignId) external campaignExists(campaignId) nonReentrant {
        Campaign storage c = _campaigns[campaignId];
        require(c.cancelledAt != 0, "Campaign not cancelled");

        uint256 amount = refundOf(campaignId, msg.sender);
        require(amount > 0, "Nothing to refund");

        donations[campaignId][msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit RefundClaimed(campaignId, msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @notice A donor's claimable refund (0 unless the campaign is cancelled).
    function refundOf(uint256 campaignId, address donor)
        public
        view
        campaignExists(campaignId)
        returns (uint256)
    {
        Campaign storage c = _campaigns[campaignId];
        if (c.cancelledAt == 0 || c.totalRaised == 0) return 0;
        uint256 unreleased = c.totalRaised - c.totalReleased;
        return (donations[campaignId][donor] * unreleased) / c.totalRaised;
    }

    /**
     * @notice True when the current milestone is stuck without an approved
     *         release and donors should be able to recover their funds:
     *         - Pending past its proof deadline (creator disappeared),
     *         - Submitted but unreviewed for REVIEW_WINDOW past the later of
     *           submission time and deadline (reviewers disappeared),
     *         - ChangesRequested past the revision window or the deadline
     *           (creator never fixed the rejected proof).
     *         When true, failCampaign() can be called by anyone.
     */
    function milestoneFailed(uint256 campaignId)
        public
        view
        campaignExists(campaignId)
        returns (bool)
    {
        Campaign storage c = _campaigns[campaignId];
        if (!c.active) return false;
        uint256 mi = c.currentMilestone;
        if (mi >= c.milestoneCount) return false;
        Milestone storage m = _milestones[campaignId][mi];
        uint64 deadline = m.criteria.proofDeadline;

        if (m.state == MilestoneState.Submitted) {
            ProofSubmission[] storage subs = _submissions[campaignId][mi];
            uint256 submittedAt = subs[subs.length - 1].submittedAt;
            uint256 reviewStart = deadline > submittedAt ? deadline : submittedAt;
            return block.timestamp > reviewStart + REVIEW_WINDOW;
        }
        if (m.state == MilestoneState.ChangesRequested) {
            if (block.timestamp > m.revisionDeadline) return true;
            return deadline != 0 && block.timestamp > deadline;
        }
        // Pending: the creator had until the deadline to submit anything at
        // all. With no deadline set there is no timeout path — the UI pushes
        // creators to set one, and voluntary cancellation stays available.
        return deadline != 0 && block.timestamp > deadline;
    }

    /// @notice Whether an address currently holds review authority for a campaign.
    function isReviewer(uint256 campaignId, address account)
        public
        view
        campaignExists(campaignId)
        returns (bool)
    {
        ApprovalConfig storage cfg = _approvals[campaignId];
        if (cfg.model == ApprovalModel.DesignatedReviewers) {
            for (uint256 i = 0; i < cfg.reviewers.length; i++) {
                if (cfg.reviewers[i] == account) return true;
            }
            return false;
        }
        if (cfg.model == ApprovalModel.PlatformOperator) {
            return account == owner();
        }
        if (cfg.model == ApprovalModel.WeightedApproval) {
            return account != address(0) && donations[campaignId][account] > 0;
        }
        return false;
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

    function getApprovalConfig(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (ApprovalConfig memory)
    {
        return _approvals[campaignId];
    }

    function getSubmissions(uint256 campaignId, uint256 milestoneIndex)
        external
        view
        campaignExists(campaignId)
        returns (ProofSubmission[] memory)
    {
        return _submissions[campaignId][milestoneIndex];
    }

    function getReviews(uint256 campaignId, uint256 milestoneIndex)
        external
        view
        campaignExists(campaignId)
        returns (ReviewDecision[] memory)
    {
        return _reviews[campaignId][milestoneIndex];
    }

    /// @notice Whether a reviewer has already voted on a given submission.
    function hasReviewed(
        uint256 campaignId,
        uint256 milestoneIndex,
        uint256 submissionIndex,
        address reviewer
    ) external view returns (bool) {
        return _reviewed[campaignId][milestoneIndex][submissionIndex][reviewer];
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
     * @notice Reputation out of 100. Only reviewer-verified outcomes score:
     *         approved milestones and completed campaigns. Raw proof
     *         submissions deliberately earn nothing.
     */
    function trustScore(address creator) public view returns (uint256) {
        CreatorStats memory s = _creatorStats[creator];
        if (s.campaignsCreated == 0) return 0;

        uint256 score = 10;
        score += s.milestonesApproved * 12;
        score += s.campaignsCompleted * 15;

        if (score > 100) score = 100;
        return score;
    }
}
