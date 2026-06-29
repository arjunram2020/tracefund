import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Covenant } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// Demo campaign milestone amounts (PRD §15). Kept tiny to mirror the safe demo values.
const M1 = ethers.parseEther("0.02"); // Hospital deposit receipt
const M2 = ethers.parseEther("0.015"); // Medication purchase receipt
const M3 = ethers.parseEther("0.015"); // Follow-up appointment confirmation
const GOAL = M1 + M2 + M3; // 0.05 ETH

const TITLE = "Community Medical Relief Fund";
const DESCRIPTION =
  "A transparent emergency fundraiser where donations unlock only after milestone proof is submitted and donors approve the release.";
const MILESTONE_DESCRIPTIONS = [
  "Hospital deposit receipt",
  "Medication purchase receipt",
  "Follow-up appointment confirmation",
];
const MILESTONE_AMOUNTS = [M1, M2, M3];

describe("Covenant", function () {
  async function deployFixture() {
    const [creator, donorA, donorB, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("Covenant");
    const covenant = (await Factory.deploy()) as Covenant;
    await covenant.waitForDeployment();
    return { covenant, creator, donorA, donorB, outsider };
  }

  async function createDemoCampaign(covenant: Covenant, creator: HardhatEthersSigner) {
    await covenant
      .connect(creator)
      .createCampaign(TITLE, DESCRIPTION, MILESTONE_DESCRIPTIONS, MILESTONE_AMOUNTS);
    return 0n; // first campaign id
  }

  // A fixture with a created campaign and two donors funded into escrow.
  // Each individual donation must stay strictly below the current milestone
  // amount (M1 = 0.02) and the running total may not exceed the goal, so the
  // per-donor totals (0.02 for donorA, 0.03 for donorB) are reached across
  // multiple sub-cap donations.
  async function fundedFixture() {
    const base = await deployFixture();
    const { covenant, creator, donorA, donorB } = base;
    const id = await createDemoCampaign(covenant, creator);
    await covenant.connect(donorA).donate(id, { value: ethers.parseEther("0.01") });
    await covenant.connect(donorA).donate(id, { value: ethers.parseEther("0.01") }); // donorA total 0.02
    await covenant.connect(donorB).donate(id, { value: ethers.parseEther("0.019") });
    await covenant.connect(donorB).donate(id, { value: ethers.parseEther("0.011") }); // donorB total 0.03
    // totalRaised = 0.05 (= goal), 50% threshold = 0.025
    return { ...base, id };
  }

  describe("Deployment", function () {
    it("exposes the expected constants", async function () {
      const { covenant } = await loadFixture(deployFixture);
      expect(await covenant.MAX_MILESTONES()).to.equal(5n);
      expect(await covenant.APPROVAL_THRESHOLD_BPS()).to.equal(5000n);
      expect(await covenant.campaignCount()).to.equal(0n);
    });
  });

  describe("createCampaign", function () {
    it("creates a campaign and sums milestone amounts into the goal", async function () {
      const { covenant, creator } = await loadFixture(deployFixture);

      await expect(
        covenant
          .connect(creator)
          .createCampaign(TITLE, DESCRIPTION, MILESTONE_DESCRIPTIONS, MILESTONE_AMOUNTS),
      )
        .to.emit(covenant, "CampaignCreated")
        .withArgs(0n, creator.address, TITLE, GOAL, 3n);

      expect(await covenant.campaignCount()).to.equal(1n);

      const c = await covenant.getCampaign(0);
      expect(c.creator).to.equal(creator.address);
      expect(c.title).to.equal(TITLE);
      expect(c.goalAmount).to.equal(GOAL);
      expect(c.totalRaised).to.equal(0n);
      expect(c.active).to.equal(true);
      expect(c.completed).to.equal(false);
      expect(c.currentMilestone).to.equal(0n);
      expect(c.milestoneCount).to.equal(3n);

      const milestones = await covenant.getMilestones(0);
      expect(milestones.length).to.equal(3);
      expect(milestones[0].description).to.equal("Hospital deposit receipt");
      expect(milestones[0].amount).to.equal(M1);
      expect(milestones[0].released).to.equal(false);

      // Creator reputation reflects a created campaign.
      const stats = await covenant.getCreatorStats(creator.address);
      expect(stats.campaignsCreated).to.equal(1n);
    });

    it("reverts on empty title", async function () {
      const { covenant, creator } = await loadFixture(deployFixture);
      await expect(
        covenant.connect(creator).createCampaign("", DESCRIPTION, ["m"], [M1]),
      ).to.be.revertedWith("Title required");
    });

    it("reverts on empty description", async function () {
      const { covenant, creator } = await loadFixture(deployFixture);
      await expect(
        covenant.connect(creator).createCampaign(TITLE, "", ["m"], [M1]),
      ).to.be.revertedWith("Description required");
    });

    it("reverts when there are no milestones", async function () {
      const { covenant, creator } = await loadFixture(deployFixture);
      await expect(
        covenant.connect(creator).createCampaign(TITLE, DESCRIPTION, [], []),
      ).to.be.revertedWith("At least one milestone");
    });

    it("reverts with more than five milestones", async function () {
      const { covenant, creator } = await loadFixture(deployFixture);
      const descs = ["a", "b", "c", "d", "e", "f"];
      const amts = [M1, M1, M1, M1, M1, M1];
      await expect(
        covenant.connect(creator).createCampaign(TITLE, DESCRIPTION, descs, amts),
      ).to.be.revertedWith("Too many milestones");
    });

    it("reverts when a milestone amount is zero", async function () {
      const { covenant, creator } = await loadFixture(deployFixture);
      await expect(
        covenant.connect(creator).createCampaign(TITLE, DESCRIPTION, ["m"], [0]),
      ).to.be.revertedWith("Milestone amount must be > 0");
    });

    it("reverts when descriptions and amounts length mismatch", async function () {
      const { covenant, creator } = await loadFixture(deployFixture);
      await expect(
        covenant.connect(creator).createCampaign(TITLE, DESCRIPTION, ["m"], [M1, M2]),
      ).to.be.revertedWith("Milestone length mismatch");
    });
  });

  describe("donate", function () {
    // Sub-cap donation amounts (each strictly below the current milestone M1 = 0.02).
    const DA = ethers.parseEther("0.01");
    const DB = ethers.parseEther("0.015");

    it("accepts donations, tracks donor and raised totals, and locks ETH in escrow", async function () {
      const { covenant, creator, donorA, donorB } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator);

      await expect(covenant.connect(donorA).donate(id, { value: DA }))
        .to.emit(covenant, "DonationReceived")
        .withArgs(id, donorA.address, DA, DA);

      // ETH is held by the contract (escrow), not forwarded to the creator.
      expect(await ethers.provider.getBalance(await covenant.getAddress())).to.equal(DA);

      await covenant.connect(donorB).donate(id, { value: DB });

      const c = await covenant.getCampaign(id);
      expect(c.totalRaised).to.equal(DA + DB);
      expect(c.donorCount).to.equal(2n);

      expect(await covenant.getDonation(id, donorA.address)).to.equal(DA);
      const donors = await covenant.getDonors(id);
      expect(donors).to.deep.equal([donorA.address, donorB.address]);
    });

    it("accumulates repeated donations from the same donor without double-counting donors", async function () {
      const { covenant, creator, donorA } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator);

      await covenant.connect(donorA).donate(id, { value: DA });
      await covenant.connect(donorA).donate(id, { value: DB });

      const c = await covenant.getCampaign(id);
      expect(c.donorCount).to.equal(1n);
      expect(await covenant.getDonation(id, donorA.address)).to.equal(DA + DB);
    });

    it("reverts on a zero-value donation", async function () {
      const { covenant, creator, donorA } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator);
      await expect(
        covenant.connect(donorA).donate(id, { value: 0 }),
      ).to.be.revertedWith("Donation must be > 0");
    });

    it("reverts when a single donation equals the current milestone amount", async function () {
      const { covenant, creator, donorA } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator);
      // M1 is the current milestone amount; the donation must be strictly below it.
      await expect(
        covenant.connect(donorA).donate(id, { value: M1 }),
      ).to.be.revertedWith("Donation must be below milestone amount");
    });

    it("reverts when a single donation exceeds the current milestone amount", async function () {
      const { covenant, creator, donorA } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator);
      await expect(
        covenant.connect(donorA).donate(id, { value: M1 + 1n }),
      ).to.be.revertedWith("Donation must be below milestone amount");
    });

    it("allows reaching exactly the goal but reverts a donation that would exceed it", async function () {
      const { covenant, creator, donorA, donorB } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator);

      // Fund up to exactly the goal (0.05) with sub-cap donations.
      await covenant.connect(donorA).donate(id, { value: ethers.parseEther("0.019") });
      await covenant.connect(donorA).donate(id, { value: ethers.parseEther("0.019") });
      await covenant.connect(donorB).donate(id, { value: ethers.parseEther("0.012") });

      const c = await covenant.getCampaign(id);
      expect(c.totalRaised).to.equal(GOAL);

      // Any further donation pushes total above the goal and must revert.
      await expect(
        covenant.connect(donorB).donate(id, { value: ethers.parseEther("0.0001") }),
      ).to.be.revertedWith("Donation exceeds campaign goal");
    });

    it("reverts when the campaign does not exist", async function () {
      const { covenant, donorA } = await loadFixture(deployFixture);
      await expect(
        covenant.connect(donorA).donate(99, { value: M1 }),
      ).to.be.revertedWith("Campaign does not exist");
    });
  });

  describe("submitEvidence", function () {
    it("lets the creator submit evidence without releasing funds", async function () {
      const { covenant, creator, id } = await loadFixture(fundedFixture);

      await expect(covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1"))
        .to.emit(covenant, "EvidenceSubmitted")
        .withArgs(id, 0n, "ipfs://receipt-1");

      const m = await covenant.getMilestone(id, 0);
      expect(m.evidenceSubmitted).to.equal(true);
      expect(m.evidence).to.equal("ipfs://receipt-1");
      expect(m.released).to.equal(false);

      // No money moved.
      const c = await covenant.getCampaign(id);
      expect(c.totalReleased).to.equal(0n);

      const stats = await covenant.getCreatorStats(creator.address);
      expect(stats.evidenceUpdates).to.equal(1n);
    });

    it("reverts when a non-creator submits evidence", async function () {
      const { covenant, donorA, id } = await loadFixture(fundedFixture);
      await expect(
        covenant.connect(donorA).submitEvidence(id, "ipfs://hack"),
      ).to.be.revertedWith("Only creator");
    });

    it("reverts on empty evidence", async function () {
      const { covenant, creator, id } = await loadFixture(fundedFixture);
      await expect(
        covenant.connect(creator).submitEvidence(id, ""),
      ).to.be.revertedWith("Evidence required");
    });
  });

  describe("approveMilestone", function () {
    it("records weighted approval from a donor", async function () {
      const { covenant, creator, donorA, id } = await loadFixture(fundedFixture);
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");

      await expect(covenant.connect(donorA).approveMilestone(id))
        .to.emit(covenant, "MilestoneApproved")
        .withArgs(id, 0n, donorA.address, ethers.parseEther("0.02"), ethers.parseEther("0.02"));

      const m = await covenant.getMilestone(id, 0);
      expect(m.approvalWeight).to.equal(ethers.parseEther("0.02"));
      expect(await covenant.hasApproved(id, 0, donorA.address)).to.equal(true);
    });

    it("reverts when approving before evidence is submitted", async function () {
      const { covenant, donorA, id } = await loadFixture(fundedFixture);
      await expect(
        covenant.connect(donorA).approveMilestone(id),
      ).to.be.revertedWith("Evidence not submitted");
    });

    it("reverts when a non-donor tries to approve", async function () {
      const { covenant, creator, outsider, id } = await loadFixture(fundedFixture);
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await expect(
        covenant.connect(outsider).approveMilestone(id),
      ).to.be.revertedWith("Not a donor");
    });

    it("reverts when a donor approves twice", async function () {
      const { covenant, creator, donorA, id } = await loadFixture(fundedFixture);
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await covenant.connect(donorA).approveMilestone(id);
      await expect(
        covenant.connect(donorA).approveMilestone(id),
      ).to.be.revertedWith("Already approved");
    });
  });

  describe("releaseMilestoneFunds", function () {
    it("reverts when no donors have approved", async function () {
      const { covenant, creator, id } = await loadFixture(fundedFixture);
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await expect(
        covenant.connect(creator).releaseMilestoneFunds(id),
      ).to.be.revertedWith("Approval threshold not reached");
    });

    it("reverts when approval weight is below the 50% threshold", async function () {
      const { covenant, creator, donorA, id } = await loadFixture(fundedFixture);
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      // donorA gave 0.02 of 0.05 (40%) — not enough on its own.
      await covenant.connect(donorA).approveMilestone(id);
      expect(await covenant.isThresholdReached(id)).to.equal(false);
      await expect(
        covenant.connect(creator).releaseMilestoneFunds(id),
      ).to.be.revertedWith("Approval threshold not reached");
    });

    it("releases exactly the milestone amount once the weighted threshold is met", async function () {
      const { covenant, creator, donorB, id } = await loadFixture(fundedFixture);
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");

      // donorB gave 0.03 of 0.05 (60%) — crosses the 50% threshold alone.
      await covenant.connect(donorB).approveMilestone(id);
      expect(await covenant.isThresholdReached(id)).to.equal(true);

      // Exactly M1 is transferred to the creator, no more.
      await expect(
        covenant.connect(donorB).releaseMilestoneFunds(id),
      ).to.changeEtherBalances([creator, covenant], [M1, -M1]);

      const c = await covenant.getCampaign(id);
      expect(c.totalReleased).to.equal(M1);
      expect(c.currentMilestone).to.equal(1n); // advanced to next milestone
      expect(c.completed).to.equal(false);

      const m0 = await covenant.getMilestone(id, 0);
      expect(m0.released).to.equal(true);

      // Remaining funds stay locked for future milestones.
      expect(await ethers.provider.getBalance(await covenant.getAddress())).to.equal(GOAL - M1);
    });

    it("reverts on a second release of an already-released milestone", async function () {
      const { covenant, creator, donorB, id } = await loadFixture(fundedFixture);
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await covenant.connect(donorB).approveMilestone(id);
      await covenant.connect(creator).releaseMilestoneFunds(id);

      // Milestone 0 is released; calling again now targets milestone 1 which has no evidence.
      await expect(
        covenant.connect(creator).releaseMilestoneFunds(id),
      ).to.be.revertedWith("Evidence not submitted");
    });
  });

  describe("Full lifecycle & campaign completion", function () {
    it("releases all milestones, completes the campaign, and drains escrow to zero", async function () {
      const { covenant, creator, donorA, donorB, id } = await loadFixture(fundedFixture);

      for (let i = 0; i < 3; i++) {
        await covenant.connect(creator).submitEvidence(id, `ipfs://receipt-${i + 1}`);
        await covenant.connect(donorA).approveMilestone(id);
        await covenant.connect(donorB).approveMilestone(id); // 0.05 of 0.05 approves
        await covenant.connect(creator).releaseMilestoneFunds(id);
      }

      const c = await covenant.getCampaign(id);
      expect(c.completed).to.equal(true);
      expect(c.active).to.equal(false);
      expect(c.currentMilestone).to.equal(3n);
      expect(c.totalReleased).to.equal(GOAL);

      // All escrowed ETH has been released.
      expect(await ethers.provider.getBalance(await covenant.getAddress())).to.equal(0n);

      const stats = await covenant.getCreatorStats(creator.address);
      expect(stats.campaignsCompleted).to.equal(1n);
      expect(stats.milestonesCompleted).to.equal(3n);
    });

    it("emits CampaignCompleted on the final milestone release", async function () {
      const { covenant, creator, donorB, id } = await loadFixture(fundedFixture);

      // First two milestones.
      for (let i = 0; i < 2; i++) {
        await covenant.connect(creator).submitEvidence(id, `ipfs://receipt-${i + 1}`);
        await covenant.connect(donorB).approveMilestone(id);
        await covenant.connect(creator).releaseMilestoneFunds(id);
      }

      // Final milestone.
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-3");
      await covenant.connect(donorB).approveMilestone(id);
      await expect(covenant.connect(creator).releaseMilestoneFunds(id))
        .to.emit(covenant, "MilestoneReleased")
        .and.to.emit(covenant, "CampaignCompleted")
        .withArgs(id);

      // Cannot submit evidence on a completed campaign.
      await expect(
        covenant.connect(creator).submitEvidence(id, "late"),
      ).to.be.revertedWith("Campaign completed");
    });
  });

  describe("Reputation / trust score", function () {
    it("starts at zero and increases as milestones are proven and the campaign completes", async function () {
      const { covenant, creator, donorA, donorB, id } = await loadFixture(fundedFixture);

      // Brand new creator with one created campaign: base score of 10 (New Creator).
      expect(await covenant.trustScore(creator.address)).to.equal(10n);

      // Complete milestone 1 (1 evidence + 1 milestone): 10 + 12 + 3 = 25 (Early Creator).
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await covenant.connect(donorB).approveMilestone(id);
      await covenant.connect(creator).releaseMilestoneFunds(id);
      expect(await covenant.trustScore(creator.address)).to.equal(25n);

      // Complete the remaining two milestones and the campaign.
      for (let i = 1; i < 3; i++) {
        await covenant.connect(creator).submitEvidence(id, `ipfs://receipt-${i + 1}`);
        await covenant.connect(donorA).approveMilestone(id);
        await covenant.connect(donorB).approveMilestone(id);
        await covenant.connect(creator).releaseMilestoneFunds(id);
      }

      // 10 base + 3*12 milestones + 1*15 campaign + min(3*3,15)=9 evidence = 70 (Proven Creator).
      expect(await covenant.trustScore(creator.address)).to.equal(70n);
    });

    it("returns zero for an address that has never created a campaign", async function () {
      const { covenant, outsider } = await loadFixture(deployFixture);
      expect(await covenant.trustScore(outsider.address)).to.equal(0n);
    });
  });
});
