import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { TraceFund } from "../typechain-types";
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

describe("TraceFund", function () {
  async function deployFixture() {
    const [creator, donorA, donorB, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TraceFund");
    const traceFund = (await Factory.deploy()) as TraceFund;
    await traceFund.waitForDeployment();
    return { traceFund, creator, donorA, donorB, outsider };
  }

  async function createDemoCampaign(traceFund: TraceFund, creator: HardhatEthersSigner) {
    await traceFund
      .connect(creator)
      .createCampaign(TITLE, DESCRIPTION, MILESTONE_DESCRIPTIONS, MILESTONE_AMOUNTS);
    return 0n; // first campaign id
  }

  // A fixture with a created campaign and two donors funded into escrow.
  async function fundedFixture() {
    const base = await deployFixture();
    const { traceFund, creator, donorA, donorB } = base;
    const id = await createDemoCampaign(traceFund, creator);
    await traceFund.connect(donorA).donate(id, { value: ethers.parseEther("0.02") });
    await traceFund.connect(donorB).donate(id, { value: ethers.parseEther("0.03") });
    // totalRaised = 0.05, 50% threshold = 0.025
    return { ...base, id };
  }

  describe("Deployment", function () {
    it("exposes the expected constants", async function () {
      const { traceFund } = await loadFixture(deployFixture);
      expect(await traceFund.MAX_MILESTONES()).to.equal(5n);
      expect(await traceFund.APPROVAL_THRESHOLD_BPS()).to.equal(5000n);
      expect(await traceFund.campaignCount()).to.equal(0n);
    });
  });

  describe("createCampaign", function () {
    it("creates a campaign and sums milestone amounts into the goal", async function () {
      const { traceFund, creator } = await loadFixture(deployFixture);

      await expect(
        traceFund
          .connect(creator)
          .createCampaign(TITLE, DESCRIPTION, MILESTONE_DESCRIPTIONS, MILESTONE_AMOUNTS),
      )
        .to.emit(traceFund, "CampaignCreated")
        .withArgs(0n, creator.address, TITLE, GOAL, 3n);

      expect(await traceFund.campaignCount()).to.equal(1n);

      const c = await traceFund.getCampaign(0);
      expect(c.creator).to.equal(creator.address);
      expect(c.title).to.equal(TITLE);
      expect(c.goalAmount).to.equal(GOAL);
      expect(c.totalRaised).to.equal(0n);
      expect(c.active).to.equal(true);
      expect(c.completed).to.equal(false);
      expect(c.currentMilestone).to.equal(0n);
      expect(c.milestoneCount).to.equal(3n);

      const milestones = await traceFund.getMilestones(0);
      expect(milestones.length).to.equal(3);
      expect(milestones[0].description).to.equal("Hospital deposit receipt");
      expect(milestones[0].amount).to.equal(M1);
      expect(milestones[0].released).to.equal(false);

      // Creator reputation reflects a created campaign.
      const stats = await traceFund.getCreatorStats(creator.address);
      expect(stats.campaignsCreated).to.equal(1n);
    });

    it("reverts on empty title", async function () {
      const { traceFund, creator } = await loadFixture(deployFixture);
      await expect(
        traceFund.connect(creator).createCampaign("", DESCRIPTION, ["m"], [M1]),
      ).to.be.revertedWith("Title required");
    });

    it("reverts on empty description", async function () {
      const { traceFund, creator } = await loadFixture(deployFixture);
      await expect(
        traceFund.connect(creator).createCampaign(TITLE, "", ["m"], [M1]),
      ).to.be.revertedWith("Description required");
    });

    it("reverts when there are no milestones", async function () {
      const { traceFund, creator } = await loadFixture(deployFixture);
      await expect(
        traceFund.connect(creator).createCampaign(TITLE, DESCRIPTION, [], []),
      ).to.be.revertedWith("At least one milestone");
    });

    it("reverts with more than five milestones", async function () {
      const { traceFund, creator } = await loadFixture(deployFixture);
      const descs = ["a", "b", "c", "d", "e", "f"];
      const amts = [M1, M1, M1, M1, M1, M1];
      await expect(
        traceFund.connect(creator).createCampaign(TITLE, DESCRIPTION, descs, amts),
      ).to.be.revertedWith("Too many milestones");
    });

    it("reverts when a milestone amount is zero", async function () {
      const { traceFund, creator } = await loadFixture(deployFixture);
      await expect(
        traceFund.connect(creator).createCampaign(TITLE, DESCRIPTION, ["m"], [0]),
      ).to.be.revertedWith("Milestone amount must be > 0");
    });

    it("reverts when descriptions and amounts length mismatch", async function () {
      const { traceFund, creator } = await loadFixture(deployFixture);
      await expect(
        traceFund.connect(creator).createCampaign(TITLE, DESCRIPTION, ["m"], [M1, M2]),
      ).to.be.revertedWith("Milestone length mismatch");
    });
  });

  describe("donate", function () {
    it("accepts donations, tracks donor and raised totals, and locks ETH in escrow", async function () {
      const { traceFund, creator, donorA, donorB } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(traceFund, creator);

      await expect(traceFund.connect(donorA).donate(id, { value: M1 }))
        .to.emit(traceFund, "DonationReceived")
        .withArgs(id, donorA.address, M1, M1);

      // ETH is held by the contract (escrow), not forwarded to the creator.
      expect(await ethers.provider.getBalance(await traceFund.getAddress())).to.equal(M1);

      await traceFund.connect(donorB).donate(id, { value: M2 });

      const c = await traceFund.getCampaign(id);
      expect(c.totalRaised).to.equal(M1 + M2);
      expect(c.donorCount).to.equal(2n);

      expect(await traceFund.getDonation(id, donorA.address)).to.equal(M1);
      const donors = await traceFund.getDonors(id);
      expect(donors).to.deep.equal([donorA.address, donorB.address]);
    });

    it("accumulates repeated donations from the same donor without double-counting donors", async function () {
      const { traceFund, creator, donorA } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(traceFund, creator);

      await traceFund.connect(donorA).donate(id, { value: M1 });
      await traceFund.connect(donorA).donate(id, { value: M2 });

      const c = await traceFund.getCampaign(id);
      expect(c.donorCount).to.equal(1n);
      expect(await traceFund.getDonation(id, donorA.address)).to.equal(M1 + M2);
    });

    it("reverts on a zero-value donation", async function () {
      const { traceFund, creator, donorA } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(traceFund, creator);
      await expect(
        traceFund.connect(donorA).donate(id, { value: 0 }),
      ).to.be.revertedWith("Donation must be > 0");
    });

    it("reverts when the campaign does not exist", async function () {
      const { traceFund, donorA } = await loadFixture(deployFixture);
      await expect(
        traceFund.connect(donorA).donate(99, { value: M1 }),
      ).to.be.revertedWith("Campaign does not exist");
    });
  });

  describe("submitEvidence", function () {
    it("lets the creator submit evidence without releasing funds", async function () {
      const { traceFund, creator, id } = await loadFixture(fundedFixture);

      await expect(traceFund.connect(creator).submitEvidence(id, "ipfs://receipt-1"))
        .to.emit(traceFund, "EvidenceSubmitted")
        .withArgs(id, 0n, "ipfs://receipt-1");

      const m = await traceFund.getMilestone(id, 0);
      expect(m.evidenceSubmitted).to.equal(true);
      expect(m.evidence).to.equal("ipfs://receipt-1");
      expect(m.released).to.equal(false);

      // No money moved.
      const c = await traceFund.getCampaign(id);
      expect(c.totalReleased).to.equal(0n);

      const stats = await traceFund.getCreatorStats(creator.address);
      expect(stats.evidenceUpdates).to.equal(1n);
    });

    it("reverts when a non-creator submits evidence", async function () {
      const { traceFund, donorA, id } = await loadFixture(fundedFixture);
      await expect(
        traceFund.connect(donorA).submitEvidence(id, "ipfs://hack"),
      ).to.be.revertedWith("Only creator");
    });

    it("reverts on empty evidence", async function () {
      const { traceFund, creator, id } = await loadFixture(fundedFixture);
      await expect(
        traceFund.connect(creator).submitEvidence(id, ""),
      ).to.be.revertedWith("Evidence required");
    });
  });

  describe("approveMilestone", function () {
    it("records weighted approval from a donor", async function () {
      const { traceFund, creator, donorA, id } = await loadFixture(fundedFixture);
      await traceFund.connect(creator).submitEvidence(id, "ipfs://receipt-1");

      await expect(traceFund.connect(donorA).approveMilestone(id))
        .to.emit(traceFund, "MilestoneApproved")
        .withArgs(id, 0n, donorA.address, ethers.parseEther("0.02"), ethers.parseEther("0.02"));

      const m = await traceFund.getMilestone(id, 0);
      expect(m.approvalWeight).to.equal(ethers.parseEther("0.02"));
      expect(await traceFund.hasApproved(id, 0, donorA.address)).to.equal(true);
    });

    it("reverts when approving before evidence is submitted", async function () {
      const { traceFund, donorA, id } = await loadFixture(fundedFixture);
      await expect(
        traceFund.connect(donorA).approveMilestone(id),
      ).to.be.revertedWith("Evidence not submitted");
    });

    it("reverts when a non-donor tries to approve", async function () {
      const { traceFund, creator, outsider, id } = await loadFixture(fundedFixture);
      await traceFund.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await expect(
        traceFund.connect(outsider).approveMilestone(id),
      ).to.be.revertedWith("Not a donor");
    });

    it("reverts when a donor approves twice", async function () {
      const { traceFund, creator, donorA, id } = await loadFixture(fundedFixture);
      await traceFund.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await traceFund.connect(donorA).approveMilestone(id);
      await expect(
        traceFund.connect(donorA).approveMilestone(id),
      ).to.be.revertedWith("Already approved");
    });
  });

  describe("releaseMilestoneFunds", function () {
    it("reverts when no donors have approved", async function () {
      const { traceFund, creator, id } = await loadFixture(fundedFixture);
      await traceFund.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await expect(
        traceFund.connect(creator).releaseMilestoneFunds(id),
      ).to.be.revertedWith("Approval threshold not reached");
    });

    it("reverts when approval weight is below the 50% threshold", async function () {
      const { traceFund, creator, donorA, id } = await loadFixture(fundedFixture);
      await traceFund.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      // donorA gave 0.02 of 0.05 (40%) — not enough on its own.
      await traceFund.connect(donorA).approveMilestone(id);
      expect(await traceFund.isThresholdReached(id)).to.equal(false);
      await expect(
        traceFund.connect(creator).releaseMilestoneFunds(id),
      ).to.be.revertedWith("Approval threshold not reached");
    });

    it("releases exactly the milestone amount once the weighted threshold is met", async function () {
      const { traceFund, creator, donorB, id } = await loadFixture(fundedFixture);
      await traceFund.connect(creator).submitEvidence(id, "ipfs://receipt-1");

      // donorB gave 0.03 of 0.05 (60%) — crosses the 50% threshold alone.
      await traceFund.connect(donorB).approveMilestone(id);
      expect(await traceFund.isThresholdReached(id)).to.equal(true);

      // Exactly M1 is transferred to the creator, no more.
      await expect(
        traceFund.connect(donorB).releaseMilestoneFunds(id),
      ).to.changeEtherBalances([creator, traceFund], [M1, -M1]);

      const c = await traceFund.getCampaign(id);
      expect(c.totalReleased).to.equal(M1);
      expect(c.currentMilestone).to.equal(1n); // advanced to next milestone
      expect(c.completed).to.equal(false);

      const m0 = await traceFund.getMilestone(id, 0);
      expect(m0.released).to.equal(true);

      // Remaining funds stay locked for future milestones.
      expect(await ethers.provider.getBalance(await traceFund.getAddress())).to.equal(GOAL - M1);
    });

    it("reverts on a second release of an already-released milestone", async function () {
      const { traceFund, creator, donorB, id } = await loadFixture(fundedFixture);
      await traceFund.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await traceFund.connect(donorB).approveMilestone(id);
      await traceFund.connect(creator).releaseMilestoneFunds(id);

      // Milestone 0 is released; calling again now targets milestone 1 which has no evidence.
      await expect(
        traceFund.connect(creator).releaseMilestoneFunds(id),
      ).to.be.revertedWith("Evidence not submitted");
    });
  });

  describe("Full lifecycle & campaign completion", function () {
    it("releases all milestones, completes the campaign, and drains escrow to zero", async function () {
      const { traceFund, creator, donorA, donorB, id } = await loadFixture(fundedFixture);

      for (let i = 0; i < 3; i++) {
        await traceFund.connect(creator).submitEvidence(id, `ipfs://receipt-${i + 1}`);
        await traceFund.connect(donorA).approveMilestone(id);
        await traceFund.connect(donorB).approveMilestone(id); // 0.05 of 0.05 approves
        await traceFund.connect(creator).releaseMilestoneFunds(id);
      }

      const c = await traceFund.getCampaign(id);
      expect(c.completed).to.equal(true);
      expect(c.active).to.equal(false);
      expect(c.currentMilestone).to.equal(3n);
      expect(c.totalReleased).to.equal(GOAL);

      // All escrowed ETH has been released.
      expect(await ethers.provider.getBalance(await traceFund.getAddress())).to.equal(0n);

      const stats = await traceFund.getCreatorStats(creator.address);
      expect(stats.campaignsCompleted).to.equal(1n);
      expect(stats.milestonesCompleted).to.equal(3n);
    });

    it("emits CampaignCompleted on the final milestone release", async function () {
      const { traceFund, creator, donorB, id } = await loadFixture(fundedFixture);

      // First two milestones.
      for (let i = 0; i < 2; i++) {
        await traceFund.connect(creator).submitEvidence(id, `ipfs://receipt-${i + 1}`);
        await traceFund.connect(donorB).approveMilestone(id);
        await traceFund.connect(creator).releaseMilestoneFunds(id);
      }

      // Final milestone.
      await traceFund.connect(creator).submitEvidence(id, "ipfs://receipt-3");
      await traceFund.connect(donorB).approveMilestone(id);
      await expect(traceFund.connect(creator).releaseMilestoneFunds(id))
        .to.emit(traceFund, "MilestoneReleased")
        .and.to.emit(traceFund, "CampaignCompleted")
        .withArgs(id);

      // Cannot submit evidence on a completed campaign.
      await expect(
        traceFund.connect(creator).submitEvidence(id, "late"),
      ).to.be.revertedWith("Campaign completed");
    });
  });

  describe("Reputation / trust score", function () {
    it("starts at zero and increases as milestones are proven and the campaign completes", async function () {
      const { traceFund, creator, donorA, donorB, id } = await loadFixture(fundedFixture);

      // Brand new creator with one created campaign: base score of 10 (New Creator).
      expect(await traceFund.trustScore(creator.address)).to.equal(10n);

      // Complete milestone 1 (1 evidence + 1 milestone): 10 + 12 + 3 = 25 (Early Creator).
      await traceFund.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await traceFund.connect(donorB).approveMilestone(id);
      await traceFund.connect(creator).releaseMilestoneFunds(id);
      expect(await traceFund.trustScore(creator.address)).to.equal(25n);

      // Complete the remaining two milestones and the campaign.
      for (let i = 1; i < 3; i++) {
        await traceFund.connect(creator).submitEvidence(id, `ipfs://receipt-${i + 1}`);
        await traceFund.connect(donorA).approveMilestone(id);
        await traceFund.connect(donorB).approveMilestone(id);
        await traceFund.connect(creator).releaseMilestoneFunds(id);
      }

      // 10 base + 3*12 milestones + 1*15 campaign + min(3*3,15)=9 evidence = 70 (Proven Creator).
      expect(await traceFund.trustScore(creator.address)).to.equal(70n);
    });

    it("returns zero for an address that has never created a campaign", async function () {
      const { traceFund, outsider } = await loadFixture(deployFixture);
      expect(await traceFund.trustScore(outsider.address)).to.equal(0n);
    });
  });
});
