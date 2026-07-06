import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { Covenant, MockUSDC } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// All amounts are USDC base units (6 decimals).
const usdc6 = (v: string) => ethers.parseUnits(v, 6);

// Demo campaign milestone amounts. Kept tiny to mirror the safe demo values.
const M1 = usdc6("0.02");
const M2 = usdc6("0.015");
const M3 = usdc6("0.015");
const GOAL = M1 + M2 + M3; // 0.05 USDC

const TITLE = "Community Medical Relief Fund";
const DESCRIPTION =
  "A transparent emergency fundraiser where each milestone's funds unlock only after reviewers approve the creator's proof.";

// Contract enums (must match Covenant.sol declaration order).
const ApprovalModel = {
  DesignatedReviewers: 0,
  LeadDonor: 1,
  PlatformOperator: 2,
  DonorVote: 3,
} as const;
const MilestoneState = { Pending: 0, Submitted: 1, ChangesRequested: 2, Approved: 3 } as const;
const CampaignKind = { Charity: 0, Startup: 1, Grant: 2, Other: 3 } as const;

const REVIEW_WINDOW = 14 * 24 * 60 * 60;
const DAY = 24 * 60 * 60;

// Plenty of USDC for every donor in every test.
const DONOR_FUNDING = usdc6("1000");

const HASH1 = ethers.keccak256(ethers.toUtf8Bytes("proof-manifest-1"));
const HASH2 = ethers.keccak256(ethers.toUtf8Bytes("proof-manifest-2"));

function criteria(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: "Hospital deposit paid",
    successDefinition: "Deposit receipt from the hospital matching the milestone amount",
    reportingPeriod: "Once, within the treatment window",
    expectedMetrics: "",
    requiredProof: "Receipt photo or PDF, hospital reference number",
    proofDeadline: 0,
    ...overrides,
  };
}

function milestoneInputs(
  amounts: bigint[] = [M1, M2, M3],
  perMilestone: Array<Partial<Record<string, unknown>>> = [],
) {
  return amounts.map((amount, i) => ({
    criteria: criteria({ title: `Milestone ${i + 1} deliverable`, ...(perMilestone[i] ?? {}) }),
    amount,
  }));
}

describe("Covenant", function () {
  async function deployFixture() {
    const [creator, donorA, donorB, outsider, reviewer1, reviewer2, reviewer3] =
      await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("MockUSDC");
    const usdc = (await TokenFactory.deploy()) as MockUSDC;
    await usdc.waitForDeployment();

    const Factory = await ethers.getContractFactory("Covenant");
    const covenant = (await Factory.deploy(await usdc.getAddress())) as Covenant;
    await covenant.waitForDeployment();

    // Fund the donors and pre-approve the escrow so tests can donate freely.
    for (const donor of [donorA, donorB, outsider]) {
      await usdc.mint(donor.address, DONOR_FUNDING);
      await usdc.connect(donor).approve(await covenant.getAddress(), DONOR_FUNDING);
    }

    return { covenant, usdc, creator, donorA, donorB, outsider, reviewer1, reviewer2, reviewer3 };
  }

  /** Create the demo campaign with two designated reviewers, threshold 1. */
  async function createDemoCampaign(
    covenant: Covenant,
    creator: HardhatEthersSigner,
    reviewers: string[],
    opts: {
      threshold?: number;
      model?: number;
      items?: ReturnType<typeof milestoneInputs>;
      kind?: number;
    } = {},
  ) {
    await covenant.connect(creator).createCampaign(
      TITLE,
      DESCRIPTION,
      opts.kind ?? CampaignKind.Charity,
      {
        model: opts.model ?? ApprovalModel.DesignatedReviewers,
        reviewers,
        threshold: opts.threshold ?? 1,
      },
      opts.items ?? milestoneInputs(),
    );
    return (await covenant.campaignCount()) - 1n;
  }

  // A campaign fully funded into escrow by two donors, reviewed by reviewer1/2.
  async function fundedFixture() {
    const base = await deployFixture();
    const { covenant, creator, donorA, donorB, reviewer1, reviewer2 } = base;
    const id = await createDemoCampaign(covenant, creator, [
      reviewer1.address,
      reviewer2.address,
    ]);
    await covenant.connect(donorA).donate(id, usdc6("0.01"));
    await covenant.connect(donorA).donate(id, usdc6("0.01")); // donorA total 0.02
    await covenant.connect(donorB).donate(id, usdc6("0.019"));
    await covenant.connect(donorB).donate(id, usdc6("0.011")); // donorB total 0.03
    // totalRaised = 0.05 (= goal)
    return { ...base, id };
  }

  // fundedFixture, plus proof already submitted for milestone one.
  async function submittedFixture() {
    const base = await fundedFixture();
    await base.covenant
      .connect(base.creator)
      .submitProof(base.id, "Deposit paid — receipt in proof package", HASH1, "");
    return base;
  }

  describe("Deployment", function () {
    it("exposes the expected constants", async function () {
      const { covenant, usdc } = await loadFixture(deployFixture);
      expect(await covenant.MAX_MILESTONES()).to.equal(5n);
      expect(await covenant.MAX_REVIEWERS()).to.equal(7n);
      expect(await covenant.REVIEW_WINDOW()).to.equal(BigInt(REVIEW_WINDOW));
      expect(await covenant.campaignCount()).to.equal(0n);
      expect(await covenant.usdc()).to.equal(await usdc.getAddress());
    });

    it("reverts when deployed without a USDC address", async function () {
      const Factory = await ethers.getContractFactory("Covenant");
      await expect(Factory.deploy(ethers.ZeroAddress)).to.be.revertedWith(
        "USDC address required",
      );
    });
  });

  describe("createCampaign", function () {
    it("stores milestone acceptance criteria and the approval config", async function () {
      const { covenant, creator, reviewer1, reviewer2 } = await loadFixture(deployFixture);
      const deadline = (await time.latest()) + 30 * DAY;

      await expect(
        covenant.connect(creator).createCampaign(
          TITLE,
          DESCRIPTION,
          CampaignKind.Startup,
          { model: ApprovalModel.DesignatedReviewers, reviewers: [reviewer1.address, reviewer2.address], threshold: 2 },
          milestoneInputs([M1, M2, M3], [
            {
              successDefinition: "500 weekly active users with 20% retention",
              reportingPeriod: "Every 2 weeks",
              expectedMetrics: "WAU >= 500, W4 retention >= 20%",
              requiredProof: "Analytics dashboard screenshots, usage export",
              proofDeadline: deadline,
            },
          ]),
        ),
      )
        .to.emit(covenant, "CampaignCreated")
        .withArgs(0n, creator.address, TITLE, GOAL, 3n);

      const c = await covenant.getCampaign(0);
      expect(c.creator).to.equal(creator.address);
      expect(c.kind).to.equal(CampaignKind.Startup);
      expect(c.goalAmount).to.equal(GOAL);
      expect(c.active).to.equal(true);
      expect(c.completed).to.equal(false);
      expect(c.cancelledAt).to.equal(0n);
      expect(c.currentMilestone).to.equal(0n);
      expect(c.milestoneCount).to.equal(3n);

      const milestones = await covenant.getMilestones(0);
      expect(milestones.length).to.equal(3);
      expect(milestones[0].criteria.successDefinition).to.equal(
        "500 weekly active users with 20% retention",
      );
      expect(milestones[0].criteria.expectedMetrics).to.equal("WAU >= 500, W4 retention >= 20%");
      expect(milestones[0].criteria.proofDeadline).to.equal(BigInt(deadline));
      expect(milestones[0].amount).to.equal(M1);
      expect(milestones[0].state).to.equal(MilestoneState.Pending);
      expect(milestones[0].released).to.equal(false);

      const cfg = await covenant.getApprovalConfig(0);
      expect(cfg.model).to.equal(ApprovalModel.DesignatedReviewers);
      expect(cfg.reviewers).to.deep.equal([reviewer1.address, reviewer2.address]);
      expect(cfg.threshold).to.equal(2n);

      const stats = await covenant.getCreatorStats(creator.address);
      expect(stats.campaignsCreated).to.equal(1n);
    });

    it("reverts on empty title, description, milestone list or oversized list", async function () {
      const { covenant, creator, reviewer1 } = await loadFixture(deployFixture);
      const cfg = { model: ApprovalModel.DesignatedReviewers, reviewers: [reviewer1.address], threshold: 1 };

      await expect(
        covenant.connect(creator).createCampaign("", DESCRIPTION, 0, cfg, milestoneInputs([M1])),
      ).to.be.revertedWith("Title required");
      await expect(
        covenant.connect(creator).createCampaign(TITLE, "", 0, cfg, milestoneInputs([M1])),
      ).to.be.revertedWith("Description required");
      await expect(
        covenant.connect(creator).createCampaign(TITLE, DESCRIPTION, 0, cfg, []),
      ).to.be.revertedWith("At least one milestone");
      await expect(
        covenant
          .connect(creator)
          .createCampaign(TITLE, DESCRIPTION, 0, cfg, milestoneInputs([M1, M1, M1, M1, M1, M1])),
      ).to.be.revertedWith("Too many milestones");
    });

    it("reverts on incomplete milestone criteria", async function () {
      const { covenant, creator, reviewer1 } = await loadFixture(deployFixture);
      const cfg = { model: ApprovalModel.DesignatedReviewers, reviewers: [reviewer1.address], threshold: 1 };

      await expect(
        covenant
          .connect(creator)
          .createCampaign(TITLE, DESCRIPTION, 0, cfg, [{ criteria: criteria(), amount: 0 }]),
      ).to.be.revertedWith("Milestone amount must be > 0");
      await expect(
        covenant
          .connect(creator)
          .createCampaign(TITLE, DESCRIPTION, 0, cfg, [
            { criteria: criteria({ title: "" }), amount: M1 },
          ]),
      ).to.be.revertedWith("Milestone title required");
      await expect(
        covenant
          .connect(creator)
          .createCampaign(TITLE, DESCRIPTION, 0, cfg, [
            { criteria: criteria({ successDefinition: "" }), amount: M1 },
          ]),
      ).to.be.revertedWith("Milestone success definition required");

      const past = (await time.latest()) - 1;
      await expect(
        covenant
          .connect(creator)
          .createCampaign(TITLE, DESCRIPTION, 0, cfg, [
            { criteria: criteria({ proofDeadline: past }), amount: M1 },
          ]),
      ).to.be.revertedWith("Milestone deadline must be in the future");
    });

    it("validates the approval config", async function () {
      const { covenant, creator, reviewer1, reviewer2 } = await loadFixture(deployFixture);
      const items = milestoneInputs([M1]);
      const make = (cfg: { model: number; reviewers: string[]; threshold: number }) =>
        covenant.connect(creator).createCampaign(TITLE, DESCRIPTION, 0, cfg, items);

      await expect(
        make({ model: ApprovalModel.DesignatedReviewers, reviewers: [], threshold: 1 }),
      ).to.be.revertedWith("Reviewers required");
      await expect(
        make({ model: ApprovalModel.DesignatedReviewers, reviewers: [reviewer1.address], threshold: 0 }),
      ).to.be.revertedWith("Threshold must be 1..reviewer count");
      await expect(
        make({ model: ApprovalModel.DesignatedReviewers, reviewers: [reviewer1.address], threshold: 2 }),
      ).to.be.revertedWith("Threshold must be 1..reviewer count");
      await expect(
        make({ model: ApprovalModel.DesignatedReviewers, reviewers: [ethers.ZeroAddress], threshold: 1 }),
      ).to.be.revertedWith("Reviewer cannot be zero address");
      await expect(
        make({ model: ApprovalModel.DesignatedReviewers, reviewers: [creator.address], threshold: 1 }),
      ).to.be.revertedWith("Creator cannot review own campaign");
      await expect(
        make({
          model: ApprovalModel.DesignatedReviewers,
          reviewers: [reviewer1.address, reviewer1.address],
          threshold: 1,
        }),
      ).to.be.revertedWith("Duplicate reviewer");
      await expect(
        make({ model: ApprovalModel.LeadDonor, reviewers: [reviewer2.address], threshold: 1 }),
      ).to.be.revertedWith("Reviewers only for designated model");
      await expect(
        make({ model: ApprovalModel.LeadDonor, reviewers: [], threshold: 2 }),
      ).to.be.revertedWith("Threshold must be 1 for this model");
      await expect(
        make({ model: ApprovalModel.DonorVote, reviewers: [], threshold: 1 }),
      ).to.be.revertedWith("Donor voting not supported yet");
    });
  });

  describe("Creation limits (anti-spam)", function () {
    const create = (covenant: Covenant, signer: HardhatEthersSigner, reviewer: string) =>
      covenant.connect(signer).createCampaign(
        TITLE,
        DESCRIPTION,
        CampaignKind.Charity,
        { model: ApprovalModel.DesignatedReviewers, reviewers: [reviewer], threshold: 1 },
        milestoneInputs([M1]),
      );

    it("enforces a 24h cooldown between campaigns for unapproved creators", async function () {
      const { covenant, creator, reviewer1 } = await loadFixture(deployFixture);
      await create(covenant, creator, reviewer1.address);
      await expect(create(covenant, creator, reviewer1.address)).to.be.revertedWith(
        "One campaign per day - try again later",
      );
      await time.increase(DAY);
      await expect(create(covenant, creator, reviewer1.address)).to.emit(
        covenant,
        "CampaignCreated",
      );
    });

    it("caps unapproved creators at FREE_CAMPAIGNS lifetime campaigns", async function () {
      const { covenant, creator, reviewer1 } = await loadFixture(deployFixture);
      await create(covenant, creator, reviewer1.address);
      await time.increase(DAY);
      await create(covenant, creator, reviewer1.address);
      await time.increase(DAY);
      await expect(create(covenant, creator, reviewer1.address)).to.be.revertedWith(
        "Campaign limit reached - request creator approval",
      );
    });

    it("owner approval lifts both the cap and the cooldown", async function () {
      const { covenant, creator, outsider, reviewer1 } = await loadFixture(deployFixture);
      await expect(covenant.connect(creator).setCreatorApproval(outsider.address, true))
        .to.emit(covenant, "CreatorApprovalChanged")
        .withArgs(outsider.address, true);

      for (let i = 0; i < 4; i++) {
        await expect(create(covenant, outsider, reviewer1.address)).to.emit(
          covenant,
          "CampaignCreated",
        );
      }
    });

    it("rejects approval changes from anyone but the owner", async function () {
      const { covenant, outsider } = await loadFixture(deployFixture);
      await expect(
        covenant.connect(outsider).setCreatorApproval(outsider.address, true),
      ).to.be.revertedWithCustomError(covenant, "OwnableUnauthorizedAccount");
    });
  });

  describe("donate", function () {
    const DA = usdc6("0.01");
    const DB = usdc6("0.015");

    it("accepts donations, tracks donors and the lead donor, and locks USDC in escrow", async function () {
      const { covenant, usdc, creator, donorA, donorB, reviewer1 } =
        await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator, [reviewer1.address]);

      await expect(covenant.connect(donorA).donate(id, DA))
        .to.emit(covenant, "DonationReceived")
        .withArgs(id, donorA.address, DA, DA);

      // USDC is held by the contract (escrow), not forwarded to the creator.
      expect(await usdc.balanceOf(await covenant.getAddress())).to.equal(DA);
      expect(await covenant.leadDonor(id)).to.equal(donorA.address);

      await covenant.connect(donorB).donate(id, DB);
      expect(await covenant.leadDonor(id)).to.equal(donorB.address); // outdonated A

      const c = await covenant.getCampaign(id);
      expect(c.totalRaised).to.equal(DA + DB);
      expect(c.donorCount).to.equal(2n);
      expect(await covenant.getDonation(id, donorA.address)).to.equal(DA);
      expect(await covenant.getDonors(id)).to.deep.equal([donorA.address, donorB.address]);
    });

    it("accumulates repeated donations without double-counting donors", async function () {
      const { covenant, creator, donorA, reviewer1 } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator, [reviewer1.address]);

      await covenant.connect(donorA).donate(id, DA);
      await covenant.connect(donorA).donate(id, DB);

      const c = await covenant.getCampaign(id);
      expect(c.donorCount).to.equal(1n);
      expect(await covenant.getDonation(id, donorA.address)).to.equal(DA + DB);
    });

    it("reverts on zero donations, self-donations, over-goal donations and unknown campaigns", async function () {
      const { covenant, usdc, creator, donorA, donorB, reviewer1 } =
        await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator, [reviewer1.address]);

      await expect(covenant.connect(donorA).donate(id, 0)).to.be.revertedWith(
        "Donation must be > 0",
      );

      await usdc.mint(creator.address, DONOR_FUNDING);
      await usdc.connect(creator).approve(await covenant.getAddress(), DONOR_FUNDING);
      await expect(covenant.connect(creator).donate(id, DA)).to.be.revertedWith(
        "Creator cannot donate to own campaign",
      );

      await covenant.connect(donorA).donate(id, usdc6("0.02"));
      await covenant.connect(donorB).donate(id, usdc6("0.03"));
      await expect(covenant.connect(donorB).donate(id, usdc6("0.0001"))).to.be.revertedWith(
        "Donation exceeds campaign goal",
      );

      await expect(covenant.connect(donorA).donate(99, M1)).to.be.revertedWith(
        "Campaign does not exist",
      );
    });

    it("reverts when the donor has not approved enough USDC", async function () {
      const { covenant, usdc, creator, donorA, reviewer1 } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator, [reviewer1.address]);

      await usdc.connect(donorA).approve(await covenant.getAddress(), 0);
      await expect(covenant.connect(donorA).donate(id, DA)).to.be.revertedWithCustomError(
        usdc,
        "ERC20InsufficientAllowance",
      );
    });

    it("stops accepting donations once the current milestone's deadline has passed", async function () {
      const { covenant, creator, donorA, reviewer1 } = await loadFixture(deployFixture);
      const deadline = (await time.latest()) + 10 * DAY;
      const id = await createDemoCampaign(covenant, creator, [reviewer1.address], {
        items: milestoneInputs([M1], [{ proofDeadline: deadline }]),
      });

      await covenant.connect(donorA).donate(id, usdc6("0.01"));
      await time.increaseTo(deadline + 1);
      await expect(covenant.connect(donorA).donate(id, usdc6("0.01"))).to.be.revertedWith(
        "Milestone deadline passed",
      );
    });
  });

  describe("submitProof", function () {
    it("records the proof package WITHOUT releasing any funds", async function () {
      const { covenant, usdc, creator, id } = await loadFixture(fundedFixture);

      await expect(
        covenant
          .connect(creator)
          .submitProof(id, "Deposit paid — receipts in package", HASH1, "data:app/json;base64,xyz"),
      )
        .to.emit(covenant, "ProofSubmitted")
        .withArgs(id, 0n, 0n, HASH1, "Deposit paid — receipts in package");

      // Escrow untouched; nothing released; milestone not advanced.
      expect(await usdc.balanceOf(await covenant.getAddress())).to.equal(GOAL);
      const c = await covenant.getCampaign(id);
      expect(c.totalReleased).to.equal(0n);
      expect(c.currentMilestone).to.equal(0n);

      const m = await covenant.getMilestone(id, 0);
      expect(m.state).to.equal(MilestoneState.Submitted);
      expect(m.submissionCount).to.equal(1n);
      expect(m.released).to.equal(false);

      const subs = await covenant.getSubmissions(id, 0);
      expect(subs.length).to.equal(1);
      expect(subs[0].manifestHash).to.equal(HASH1);
      expect(subs[0].manifestURI).to.equal("data:app/json;base64,xyz");
      expect(subs[0].summary).to.equal("Deposit paid — receipts in package");
    });

    it("requires the milestone tranche to be funded first", async function () {
      const { covenant, creator, donorA, reviewer1 } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator, [reviewer1.address]);

      await expect(
        covenant.connect(creator).submitProof(id, "s", HASH1, ""),
      ).to.be.revertedWith("Milestone not funded");

      await covenant.connect(donorA).donate(id, usdc6("0.01"));
      await expect(
        covenant.connect(creator).submitProof(id, "s", HASH1, ""),
      ).to.be.revertedWith("Milestone not funded");

      await covenant.connect(donorA).donate(id, usdc6("0.01"));
      await expect(covenant.connect(creator).submitProof(id, "s", HASH1, "")).to.emit(
        covenant,
        "ProofSubmitted",
      );
    });

    it("validates sender, summary, hash, deadline and state", async function () {
      const { covenant, creator, donorA, id } = await loadFixture(fundedFixture);

      await expect(
        covenant.connect(donorA).submitProof(id, "s", HASH1, ""),
      ).to.be.revertedWith("Only creator");
      await expect(
        covenant.connect(creator).submitProof(id, "", HASH1, ""),
      ).to.be.revertedWith("Summary required");
      await expect(
        covenant.connect(creator).submitProof(id, "s", ethers.ZeroHash, ""),
      ).to.be.revertedWith("Manifest hash required");

      // Double-submit while a package is already under review.
      await covenant.connect(creator).submitProof(id, "s", HASH1, "");
      await expect(
        covenant.connect(creator).submitProof(id, "again", HASH2, ""),
      ).to.be.revertedWith("Milestone not awaiting proof");
    });

    it("rejects submissions after the proof deadline", async function () {
      const { covenant, creator, donorA, reviewer1 } = await loadFixture(deployFixture);
      const deadline = (await time.latest()) + 10 * DAY;
      const id = await createDemoCampaign(covenant, creator, [reviewer1.address], {
        items: milestoneInputs([M1], [{ proofDeadline: deadline }]),
      });
      await covenant.connect(donorA).donate(id, M1);

      await time.increaseTo(deadline + 1);
      await expect(
        covenant.connect(creator).submitProof(id, "late", HASH1, ""),
      ).to.be.revertedWith("Proof deadline passed");
    });
  });

  describe("reviewProof", function () {
    it("rejects reviews from anyone without review authority", async function () {
      const { covenant, outsider, donorA, id } = await loadFixture(submittedFixture);
      await expect(
        covenant.connect(outsider).reviewProof(id, true, ""),
      ).to.be.revertedWith("Not an authorized reviewer");
      await expect(
        covenant.connect(donorA).reviewProof(id, true, ""),
      ).to.be.revertedWith("Not an authorized reviewer");
    });

    it("releases exactly the milestone amount once the threshold is met", async function () {
      const { covenant, usdc, creator, reviewer1, id } = await loadFixture(submittedFixture);

      const tx = covenant.connect(reviewer1).reviewProof(id, true, "Receipt checks out");
      await expect(tx)
        .to.emit(covenant, "ProofReviewed")
        .withArgs(id, 0n, reviewer1.address, 0n, true, "Receipt checks out")
        .and.to.emit(covenant, "MilestoneReleased")
        .withArgs(id, 0n, M1, creator.address);
      await expect(tx).to.changeTokenBalances(usdc, [creator, covenant], [M1, -M1]);

      const m = await covenant.getMilestone(id, 0);
      expect(m.state).to.equal(MilestoneState.Approved);
      expect(m.released).to.equal(true);

      const c = await covenant.getCampaign(id);
      expect(c.totalReleased).to.equal(M1);
      expect(c.currentMilestone).to.equal(1n);
      expect(c.completed).to.equal(false);

      const stats = await covenant.getCreatorStats(creator.address);
      expect(stats.milestonesApproved).to.equal(1n);
      expect(stats.totalReleased).to.equal(M1);
    });

    it("holds funds until a committee reaches its threshold", async function () {
      const { covenant, usdc, creator, donorA, reviewer1, reviewer2, reviewer3 } =
        await loadFixture(deployFixture);
      const id = await createDemoCampaign(
        covenant,
        creator,
        [reviewer1.address, reviewer2.address, reviewer3.address],
        { threshold: 2, items: milestoneInputs([M1]) },
      );
      await covenant.connect(donorA).donate(id, M1);
      await covenant.connect(creator).submitProof(id, "s", HASH1, "");

      // First approval: below threshold, nothing moves.
      await covenant.connect(reviewer1).reviewProof(id, true, "");
      expect(await usdc.balanceOf(await covenant.getAddress())).to.equal(M1);
      let m = await covenant.getMilestone(id, 0);
      expect(m.state).to.equal(MilestoneState.Submitted);
      expect(m.approvalCount).to.equal(1n);

      // A reviewer cannot vote twice on the same submission.
      await expect(
        covenant.connect(reviewer1).reviewProof(id, true, ""),
      ).to.be.revertedWith("Already reviewed this submission");

      // Second approval crosses the threshold and releases.
      await expect(covenant.connect(reviewer2).reviewProof(id, true, ""))
        .to.emit(covenant, "MilestoneReleased")
        .withArgs(id, 0n, M1, creator.address);
      expect(await usdc.balanceOf(await covenant.getAddress())).to.equal(0n);
    });

    it("requires notes on rejection and keeps escrow locked", async function () {
      const { covenant, usdc, reviewer1, id } = await loadFixture(submittedFixture);

      await expect(
        covenant.connect(reviewer1).reviewProof(id, false, ""),
      ).to.be.revertedWith("Rejection notes required");

      await expect(
        covenant
          .connect(reviewer1)
          .reviewProof(id, false, "Receipt does not show the hospital name — please re-scan"),
      )
        .to.emit(covenant, "ProofReviewed")
        .withArgs(
          id,
          0n,
          reviewer1.address,
          0n,
          false,
          "Receipt does not show the hospital name — please re-scan",
        );

      // Nothing released; milestone back with the creator.
      expect(await usdc.balanceOf(await covenant.getAddress())).to.equal(GOAL);
      const m = await covenant.getMilestone(id, 0);
      expect(m.state).to.equal(MilestoneState.ChangesRequested);
      expect(m.released).to.equal(false);

      const reviews = await covenant.getReviews(id, 0);
      expect(reviews.length).to.equal(1);
      expect(reviews[0].approved).to.equal(false);
      expect(reviews[0].notes).to.contain("hospital name");
    });

    it("lets the creator revise and resubmit after rejection, resetting approvals", async function () {
      const { covenant, creator, reviewer1, reviewer2, id } =
        await loadFixture(submittedFixture);

      await covenant.connect(reviewer1).reviewProof(id, false, "Wrong document");

      // No review possible while the creator is revising.
      await expect(
        covenant.connect(reviewer2).reviewProof(id, true, ""),
      ).to.be.revertedWith("No proof awaiting review");

      // Resubmission opens a fresh review round; the same reviewer votes again.
      await covenant.connect(creator).submitProof(id, "Fixed — correct receipt", HASH2, "");
      const m = await covenant.getMilestone(id, 0);
      expect(m.state).to.equal(MilestoneState.Submitted);
      expect(m.submissionCount).to.equal(2n);
      expect(m.approvalCount).to.equal(0n);

      await expect(covenant.connect(reviewer1).reviewProof(id, true, "Looks right now"))
        .to.emit(covenant, "MilestoneReleased");
    });

    it("supports the lead-donor approval model, tracking the current lead", async function () {
      const { covenant, creator, donorA, donorB } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator, [], {
        model: ApprovalModel.LeadDonor,
        items: milestoneInputs([M1, M2]),
      });

      await covenant.connect(donorA).donate(id, usdc6("0.01"));
      await covenant.connect(donorB).donate(id, usdc6("0.025")); // donorB is lead

      await covenant.connect(creator).submitProof(id, "s", HASH1, "");

      expect(await covenant.isReviewer(id, donorB.address)).to.equal(true);
      expect(await covenant.isReviewer(id, donorA.address)).to.equal(false);
      await expect(covenant.connect(donorA).reviewProof(id, true, "")).to.be.revertedWith(
        "Not an authorized reviewer",
      );
      await expect(covenant.connect(donorB).reviewProof(id, true, "")).to.emit(
        covenant,
        "MilestoneReleased",
      );
    });

    it("supports the platform-operator approval model", async function () {
      const { covenant, creator, outsider, donorA } = await loadFixture(deployFixture);
      // `creator` (signers[0]) is the contract owner, so the campaign must
      // belong to someone else — owners can't review their own campaigns.
      const id = await createDemoCampaign(covenant, outsider, [], {
        model: ApprovalModel.PlatformOperator,
        items: milestoneInputs([M1]),
      });
      await covenant.connect(donorA).donate(id, M1);
      await covenant.connect(outsider).submitProof(id, "s", HASH1, "");

      await expect(covenant.connect(donorA).reviewProof(id, true, "")).to.be.revertedWith(
        "Not an authorized reviewer",
      );
      await expect(covenant.connect(creator).reviewProof(id, true, "")).to.emit(
        covenant,
        "MilestoneReleased",
      );
    });

    it("blocks the platform operator from reviewing their own campaign", async function () {
      const { covenant, creator, donorA } = await loadFixture(deployFixture);
      // creator IS the owner here.
      const id = await createDemoCampaign(covenant, creator, [], {
        model: ApprovalModel.PlatformOperator,
        items: milestoneInputs([M1]),
      });
      await covenant.connect(donorA).donate(id, M1);
      await covenant.connect(creator).submitProof(id, "s", HASH1, "");
      await expect(covenant.connect(creator).reviewProof(id, true, "")).to.be.revertedWith(
        "Creator cannot review own campaign",
      );
    });

    it("reverts when there is no submission to review", async function () {
      const { covenant, reviewer1, id } = await loadFixture(fundedFixture);
      await expect(
        covenant.connect(reviewer1).reviewProof(id, true, ""),
      ).to.be.revertedWith("No proof awaiting review");
    });
  });

  describe("Full lifecycle & campaign completion", function () {
    it("walks all milestones through submit → approve and completes the campaign", async function () {
      const { covenant, usdc, creator, reviewer1, id } = await loadFixture(fundedFixture);

      for (let i = 0; i < 3; i++) {
        await covenant.connect(creator).submitProof(id, `Milestone ${i + 1} done`, HASH1, "");
        await covenant.connect(reviewer1).reviewProof(id, true, "Verified");
      }

      const c = await covenant.getCampaign(id);
      expect(c.completed).to.equal(true);
      expect(c.active).to.equal(false);
      expect(c.currentMilestone).to.equal(3n);
      expect(c.totalReleased).to.equal(GOAL);
      expect(await usdc.balanceOf(await covenant.getAddress())).to.equal(0n);

      const stats = await covenant.getCreatorStats(creator.address);
      expect(stats.campaignsCompleted).to.equal(1n);
      expect(stats.milestonesApproved).to.equal(3n);
      expect(stats.proofSubmissions).to.equal(3n);
    });

    it("emits CampaignCompleted on the final release and blocks further writes", async function () {
      const { covenant, creator, donorA, reviewer1, id } = await loadFixture(fundedFixture);

      for (let i = 0; i < 2; i++) {
        await covenant.connect(creator).submitProof(id, `m${i + 1}`, HASH1, "");
        await covenant.connect(reviewer1).reviewProof(id, true, "");
      }
      await covenant.connect(creator).submitProof(id, "m3", HASH1, "");
      await expect(covenant.connect(reviewer1).reviewProof(id, true, ""))
        .to.emit(covenant, "CampaignCompleted")
        .withArgs(id);

      await expect(
        covenant.connect(creator).submitProof(id, "late", HASH1, ""),
      ).to.be.revertedWith("Campaign not active");
      await expect(covenant.connect(donorA).donate(id, usdc6("0.01"))).to.be.revertedWith(
        "Campaign not active",
      );
    });
  });

  describe("Deadlines, cancellation and refunds", function () {
    async function deadlineFixture() {
      const base = await deployFixture();
      const { covenant, creator, donorA, donorB, reviewer1 } = base;
      const deadline = (await time.latest()) + 10 * DAY;
      const id = await createDemoCampaign(covenant, creator, [reviewer1.address], {
        items: milestoneInputs([M1, M2], [{ proofDeadline: deadline }, {}]),
      });
      // donorA 0.01, donorB 0.025 — total 0.035 = M1 + M2
      await covenant.connect(donorA).donate(id, usdc6("0.01"));
      await covenant.connect(donorB).donate(id, usdc6("0.025"));
      return { ...base, id, deadline };
    }

    it("cannot be failed before the deadline, and never with no deadline set", async function () {
      const { covenant, outsider, id } = await loadFixture(deadlineFixture);
      expect(await covenant.milestoneFailed(id)).to.equal(false);
      await expect(covenant.connect(outsider).failCampaign(id)).to.be.revertedWith(
        "Deadline has not passed",
      );
    });

    it("lets anyone fail a campaign whose creator missed the proof deadline, then refunds donors pro-rata", async function () {
      const { covenant, usdc, donorA, donorB, outsider, id, deadline } =
        await loadFixture(deadlineFixture);

      await time.increaseTo(deadline + 1);
      expect(await covenant.milestoneFailed(id)).to.equal(true);

      await expect(covenant.connect(outsider).failCampaign(id))
        .to.emit(covenant, "CampaignCancelled")
        .withArgs(id, 0n, false);

      const c = await covenant.getCampaign(id);
      expect(c.active).to.equal(false);
      expect(c.cancelledAt).to.not.equal(0n);

      // Nothing was released, so each donor gets back exactly what they gave.
      expect(await covenant.refundOf(id, donorA.address)).to.equal(usdc6("0.01"));
      expect(await covenant.refundOf(id, donorB.address)).to.equal(usdc6("0.025"));

      await expect(covenant.connect(donorA).claimRefund(id)).to.changeTokenBalances(
        usdc,
        [donorA, covenant],
        [usdc6("0.01"), -usdc6("0.01")],
      );
      await expect(covenant.connect(donorB).claimRefund(id))
        .to.emit(covenant, "RefundClaimed")
        .withArgs(id, donorB.address, usdc6("0.025"));

      expect(await usdc.balanceOf(await covenant.getAddress())).to.equal(0n);

      // No double claims; nothing for non-donors.
      await expect(covenant.connect(donorA).claimRefund(id)).to.be.revertedWith(
        "Nothing to refund",
      );
      await expect(covenant.connect(outsider).claimRefund(id)).to.be.revertedWith(
        "Nothing to refund",
      );
    });

    it("gives reviewers a grace window when proof is submitted, then allows failure", async function () {
      const { covenant, creator, outsider, id, deadline } = await loadFixture(deadlineFixture);

      await covenant.connect(creator).submitProof(id, "on time", HASH1, "");

      // Deadline passes with the submission stuck in review — not yet failable.
      await time.increaseTo(deadline + 1);
      expect(await covenant.milestoneFailed(id)).to.equal(false);
      await expect(covenant.connect(outsider).failCampaign(id)).to.be.revertedWith(
        "Deadline has not passed",
      );

      // Once the review grace window lapses, donors can recover their funds.
      await time.increaseTo(deadline + REVIEW_WINDOW + 1);
      expect(await covenant.milestoneFailed(id)).to.equal(true);
      await expect(covenant.connect(outsider).failCampaign(id)).to.emit(
        covenant,
        "CampaignCancelled",
      );
    });

    it("gives a rejected creator a bounded revision window even with no milestone deadline", async function () {
      // No proofDeadline at all — the rejection itself must start the clock.
      const { covenant, creator, donorA, reviewer1, outsider } =
        await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator, [reviewer1.address], {
        items: milestoneInputs([M1]),
      });
      await covenant.connect(donorA).donate(id, M1);
      await covenant.connect(creator).submitProof(id, "v1", HASH1, "");
      await covenant.connect(reviewer1).reviewProof(id, false, "Not sufficient");

      const m = await covenant.getMilestone(id, 0);
      expect(m.revisionDeadline).to.be.greaterThan(0n);

      // Inside the window: resubmission works, failure doesn't.
      expect(await covenant.milestoneFailed(id)).to.equal(false);
      await expect(covenant.connect(outsider).failCampaign(id)).to.be.revertedWith(
        "Deadline has not passed",
      );

      // Window lapses without a fix: resubmission is closed, refunds open.
      await time.increase(REVIEW_WINDOW + 1);
      await expect(
        covenant.connect(creator).submitProof(id, "too late", HASH2, ""),
      ).to.be.revertedWith("Revision window closed");
      expect(await covenant.milestoneFailed(id)).to.equal(true);
      await covenant.connect(outsider).failCampaign(id);
      expect(await covenant.refundOf(id, donorA.address)).to.equal(M1);
    });

    it("resubmitting inside the revision window restarts review cleanly", async function () {
      const { covenant, creator, reviewer1, id } = await loadFixture(submittedFixture);
      await covenant.connect(reviewer1).reviewProof(id, false, "Wrong file");
      await covenant.connect(creator).submitProof(id, "v2", HASH2, "");
      expect(await covenant.milestoneFailed(id)).to.equal(false);
      await expect(covenant.connect(reviewer1).reviewProof(id, true, "")).to.emit(
        covenant,
        "MilestoneReleased",
      );
    });

    it("lets donors recover funds when reviewers go silent on an undeadlined milestone", async function () {
      const { covenant, creator, donorA, reviewer1, outsider } =
        await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator, [reviewer1.address], {
        items: milestoneInputs([M1]), // no proofDeadline
      });
      await covenant.connect(donorA).donate(id, M1);
      await covenant.connect(creator).submitProof(id, "v1", HASH1, "");

      // Reviewers get REVIEW_WINDOW from submission; then anyone can fail.
      expect(await covenant.milestoneFailed(id)).to.equal(false);
      await time.increase(REVIEW_WINDOW + 1);
      expect(await covenant.milestoneFailed(id)).to.equal(true);
      await covenant.connect(outsider).failCampaign(id);
      expect(await covenant.refundOf(id, donorA.address)).to.equal(M1);
    });

    it("refunds only the unreleased escrow after a mid-campaign cancellation", async function () {
      const { covenant, usdc, creator, donorA, donorB, reviewer1, id } =
        await loadFixture(deadlineFixture);

      // Milestone one (0.02) releases legitimately.
      await covenant.connect(creator).submitProof(id, "m1 done", HASH1, "");
      await covenant.connect(reviewer1).reviewProof(id, true, "");

      // Creator then cancels. Unreleased escrow = 0.035 - 0.02 = 0.015.
      await expect(covenant.connect(creator).cancelCampaign(id))
        .to.emit(covenant, "CampaignCancelled")
        .withArgs(id, 1n, true);

      // Pro-rata: donorA 0.01/0.035, donorB 0.025/0.035 of 0.015.
      const unreleased = usdc6("0.015");
      const expectA = (usdc6("0.01") * unreleased) / usdc6("0.035");
      const expectB = (usdc6("0.025") * unreleased) / usdc6("0.035");
      expect(await covenant.refundOf(id, donorA.address)).to.equal(expectA);
      expect(await covenant.refundOf(id, donorB.address)).to.equal(expectB);

      await covenant.connect(donorA).claimRefund(id);
      await covenant.connect(donorB).claimRefund(id);

      // Only integer-division dust (< 2 units) may remain.
      expect(await usdc.balanceOf(await covenant.getAddress())).to.be.lessThan(2n);
    });

    it("blocks refunds while the campaign is live, and all writes after cancellation", async function () {
      const { covenant, creator, donorA, reviewer1, id } = await loadFixture(deadlineFixture);

      await expect(covenant.connect(donorA).claimRefund(id)).to.be.revertedWith(
        "Campaign not cancelled",
      );
      await expect(covenant.connect(donorA).cancelCampaign(id)).to.be.revertedWith(
        "Only creator",
      );

      await covenant.connect(creator).cancelCampaign(id);

      await expect(covenant.connect(donorA).donate(id, usdc6("0.001"))).to.be.revertedWith(
        "Campaign not active",
      );
      await expect(
        covenant.connect(creator).submitProof(id, "s", HASH1, ""),
      ).to.be.revertedWith("Campaign not active");
      await expect(covenant.connect(reviewer1).reviewProof(id, true, "")).to.be.revertedWith(
        "Campaign not active",
      );
      await expect(covenant.connect(creator).cancelCampaign(id)).to.be.revertedWith(
        "Campaign not active",
      );
    });
  });

  describe("Reputation / trust score", function () {
    it("scores verified outcomes only — raw submissions and rejections earn nothing", async function () {
      const { covenant, creator, reviewer1, id } = await loadFixture(fundedFixture);

      // One created campaign: base score.
      expect(await covenant.trustScore(creator.address)).to.equal(10n);

      // Submitting proof does NOT move the score.
      await covenant.connect(creator).submitProof(id, "m1", HASH1, "");
      expect(await covenant.trustScore(creator.address)).to.equal(10n);

      // A rejection doesn't either.
      await covenant.connect(reviewer1).reviewProof(id, false, "Insufficient");
      expect(await covenant.trustScore(creator.address)).to.equal(10n);

      // A verified approval does: 10 + 12.
      await covenant.connect(creator).submitProof(id, "m1 fixed", HASH2, "");
      await covenant.connect(reviewer1).reviewProof(id, true, "");
      expect(await covenant.trustScore(creator.address)).to.equal(22n);

      // Completing the campaign: 10 + 3*12 + 15 = 61.
      for (let i = 0; i < 2; i++) {
        await covenant.connect(creator).submitProof(id, `m${i + 2}`, HASH1, "");
        await covenant.connect(reviewer1).reviewProof(id, true, "");
      }
      expect(await covenant.trustScore(creator.address)).to.equal(61n);
    });

    it("returns zero for an address that has never created a campaign", async function () {
      const { covenant, outsider } = await loadFixture(deployFixture);
      expect(await covenant.trustScore(outsider.address)).to.equal(0n);
    });
  });
});
