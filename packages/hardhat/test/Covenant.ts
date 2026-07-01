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
  "A transparent emergency fundraiser where each milestone's funds unlock only after the creator posts on-chain proof.";
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

  // A fixture with a created campaign fully funded into escrow by two donors.
  async function fundedFixture() {
    const base = await deployFixture();
    const { covenant, creator, donorA, donorB } = base;
    const id = await createDemoCampaign(covenant, creator);
    await covenant.connect(donorA).donate(id, { value: ethers.parseEther("0.02") });
    await covenant.connect(donorB).donate(id, { value: ethers.parseEther("0.03") });
    // totalRaised = 0.05 (= goal)
    return { ...base, id };
  }

  describe("Deployment", function () {
    it("exposes the expected constants", async function () {
      const { covenant } = await loadFixture(deployFixture);
      expect(await covenant.MAX_MILESTONES()).to.equal(5n);
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

    it("allows reaching exactly the goal but reverts a donation that would exceed it", async function () {
      const { covenant, creator, donorA, donorB } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator);

      await covenant.connect(donorA).donate(id, { value: ethers.parseEther("0.02") });
      await covenant.connect(donorB).donate(id, { value: ethers.parseEther("0.03") });

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

    it("reverts once the campaign is completed (no longer active)", async function () {
      const { covenant, creator, donorA, id } = await loadFixture(fundedFixture);
      for (let i = 0; i < 3; i++) {
        await covenant.connect(creator).submitEvidence(id, `ipfs://receipt-${i + 1}`);
      }
      await expect(
        covenant.connect(donorA).donate(id, { value: DA }),
      ).to.be.revertedWith("Campaign not active");
    });
  });

  describe("submitEvidence (auto-release)", function () {
    it("records evidence and releases exactly the milestone amount to the creator", async function () {
      const { covenant, creator, id } = await loadFixture(fundedFixture);

      const tx = covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await expect(tx)
        .to.emit(covenant, "EvidenceSubmitted")
        .withArgs(id, 0n, "ipfs://receipt-1")
        .and.to.emit(covenant, "MilestoneReleased")
        .withArgs(id, 0n, M1, creator.address);
      await expect(tx).to.changeEtherBalances([creator, covenant], [M1, -M1]);

      const m = await covenant.getMilestone(id, 0);
      expect(m.evidenceSubmitted).to.equal(true);
      expect(m.evidence).to.equal("ipfs://receipt-1");
      expect(m.released).to.equal(true);

      const c = await covenant.getCampaign(id);
      expect(c.totalReleased).to.equal(M1);
      expect(c.currentMilestone).to.equal(1n); // advanced to the next milestone
      expect(c.completed).to.equal(false);

      // Remaining funds stay locked for future milestones.
      expect(await ethers.provider.getBalance(await covenant.getAddress())).to.equal(GOAL - M1);

      const stats = await covenant.getCreatorStats(creator.address);
      expect(stats.evidenceUpdates).to.equal(1n);
      expect(stats.milestonesCompleted).to.equal(1n);
      expect(stats.totalReleased).to.equal(M1);
    });

    it("reverts when the milestone is not yet funded", async function () {
      const { covenant, creator, donorA } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator);

      // Nothing donated at all.
      await expect(
        covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1"),
      ).to.be.revertedWith("Milestone not funded");

      // Partially funded (below M1 = 0.02) is still not enough.
      await covenant.connect(donorA).donate(id, { value: ethers.parseEther("0.01") });
      await expect(
        covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1"),
      ).to.be.revertedWith("Milestone not funded");

      // Topping up to cover milestone one unlocks the release.
      await covenant.connect(donorA).donate(id, { value: ethers.parseEther("0.01") });
      await expect(covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1"))
        .to.emit(covenant, "MilestoneReleased")
        .withArgs(id, 0n, M1, creator.address);
    });

    it("cannot pay one campaign's milestone out of another campaign's escrow", async function () {
      const { covenant, creator, donorA, outsider } = await loadFixture(deployFixture);

      // Campaign 0 holds real donations in escrow.
      const funded = await createDemoCampaign(covenant, creator);
      await covenant.connect(donorA).donate(funded, { value: ethers.parseEther("0.02") });

      // The attacker creates their own campaign with zero donations and tries
      // to cash out its first milestone from the shared contract balance.
      await covenant
        .connect(outsider)
        .createCampaign("Attack", "drain", ["m"], [ethers.parseEther("0.02")]);
      await expect(
        covenant.connect(outsider).submitEvidence(1, "fake proof"),
      ).to.be.revertedWith("Milestone not funded");

      // Campaign 0's escrow is untouched.
      expect(await ethers.provider.getBalance(await covenant.getAddress())).to.equal(
        ethers.parseEther("0.02"),
      );
    });

    it("gates each subsequent milestone on cumulative funding", async function () {
      const { covenant, creator, donorA } = await loadFixture(deployFixture);
      const id = await createDemoCampaign(covenant, creator);

      // Fund only milestone one (0.02) and release it.
      await covenant.connect(donorA).donate(id, { value: M1 });
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");

      // Milestone two (0.015) has no backing donations yet.
      await expect(
        covenant.connect(creator).submitEvidence(id, "ipfs://receipt-2"),
      ).to.be.revertedWith("Milestone not funded");

      await covenant.connect(donorA).donate(id, { value: M2 });
      await expect(covenant.connect(creator).submitEvidence(id, "ipfs://receipt-2"))
        .to.emit(covenant, "MilestoneReleased")
        .withArgs(id, 1n, M2, creator.address);
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

    it("reverts when the campaign does not exist", async function () {
      const { covenant, creator } = await loadFixture(deployFixture);
      await expect(
        covenant.connect(creator).submitEvidence(99, "ipfs://receipt-1"),
      ).to.be.revertedWith("Campaign does not exist");
    });
  });

  describe("Full lifecycle & campaign completion", function () {
    it("releases all milestones, completes the campaign, and drains escrow to zero", async function () {
      const { covenant, creator, id } = await loadFixture(fundedFixture);

      for (let i = 0; i < 3; i++) {
        await covenant.connect(creator).submitEvidence(id, `ipfs://receipt-${i + 1}`);
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

    it("emits CampaignCompleted on the final milestone and blocks further evidence", async function () {
      const { covenant, creator, id } = await loadFixture(fundedFixture);

      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-2");

      await expect(covenant.connect(creator).submitEvidence(id, "ipfs://receipt-3"))
        .to.emit(covenant, "MilestoneReleased")
        .and.to.emit(covenant, "CampaignCompleted")
        .withArgs(id);

      // Cannot submit evidence on a completed campaign.
      await expect(
        covenant.connect(creator).submitEvidence(id, "late"),
      ).to.be.revertedWith("Campaign not active");
    });
  });

  describe("Reputation / trust score", function () {
    it("starts at zero and increases as milestones are proven and the campaign completes", async function () {
      const { covenant, creator, id } = await loadFixture(fundedFixture);

      // Brand new creator with one created campaign: base score of 10 (New Creator).
      expect(await covenant.trustScore(creator.address)).to.equal(10n);

      // Complete milestone 1 (1 evidence + 1 milestone): 10 + 12 + 3 = 25 (Early Creator).
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-1");
      expect(await covenant.trustScore(creator.address)).to.equal(25n);

      // Complete the remaining two milestones and the campaign.
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-2");
      await covenant.connect(creator).submitEvidence(id, "ipfs://receipt-3");

      // 10 base + 3*12 milestones + 1*15 campaign + min(3*3,15)=9 evidence = 70 (Proven Creator).
      expect(await covenant.trustScore(creator.address)).to.equal(70n);
    });

    it("returns zero for an address that has never created a campaign", async function () {
      const { covenant, outsider } = await loadFixture(deployFixture);
      expect(await covenant.trustScore(outsider.address)).to.equal(0n);
    });
  });
});
