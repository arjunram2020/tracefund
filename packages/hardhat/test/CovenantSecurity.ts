import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { Covenant, MockUSDC } from "../typechain-types";

/**
 * Security-focused test suite for Covenant, complementing the functional tests
 * in Covenant.ts. Each block maps to a risk in docs/CONTRACT_SECURITY_REVIEW.md.
 * These assert the *adversarial* properties: reentrancy safety, escrow
 * isolation, refund-accounting soundness, and the known limits of weighted
 * approval. Some tests document a KNOWN LIMITATION (they assert current
 * behavior) rather than a bug — those are labeled inline.
 */

const usdc6 = (v: string) => ethers.parseUnits(v, 6);
const u = (n: number) => BigInt(n); // raw base units, for exact-rounding tests

const ApprovalModel = { WeightedApproval: 0, DesignatedReviewers: 1, PlatformOperator: 2 } as const;
const CampaignKind = { Charity: 0, Startup: 1, Grant: 2, Other: 3 } as const;
const HASH = ethers.keccak256(ethers.toUtf8Bytes("proof-manifest"));

function criteria(o: Record<string, unknown> = {}) {
  return {
    title: "Deliverable",
    successDefinition: "Done as described",
    reportingPeriod: "",
    expectedMetrics: "",
    requiredProof: "",
    proofDeadline: 0,
    ...o,
  };
}
const milestones = (amounts: bigint[]) =>
  amounts.map((amount, i) => ({ criteria: criteria({ title: `M${i + 1}` }), amount }));

describe("Covenant — security properties", function () {
  // ---------------------------------------------------------------------------
  // Reentrancy (risk: escrow drain via a malicious payout token)
  // ---------------------------------------------------------------------------
  describe("Reentrancy safety", function () {
    async function reentrantFixture() {
      const [creator, donorA, donorB, reviewer] = await ethers.getSigners();
      const Token = await ethers.getContractFactory("ReentrantToken");
      const token = await Token.deploy();
      await token.waitForDeployment();
      const Factory = await ethers.getContractFactory("Covenant");
      const covenant = (await Factory.deploy(await token.getAddress())) as unknown as Covenant;
      await covenant.waitForDeployment();

      const addr = await covenant.getAddress();
      for (const d of [donorA, donorB]) {
        await token.mint(d.address, usdc6("1"));
        await token.connect(d).approve(addr, usdc6("1"));
      }
      // One-milestone campaign, funded by two donors, then cancelled so refunds open.
      await covenant
        .connect(creator)
        .createCampaign("C", "D", CampaignKind.Charity, {
          model: ApprovalModel.DesignatedReviewers,
          reviewers: [reviewer.address],
          threshold: 1,
        }, milestones([usdc6("0.05")]));
      const id = (await covenant.campaignCount()) - 1n;
      await covenant.connect(donorA).donate(id, usdc6("0.02"));
      await covenant.connect(donorB).donate(id, usdc6("0.03"));
      await covenant.connect(creator).cancelCampaign(id);
      return { covenant, token, id, donorA, donorB, addr };
    }

    it("a reentrant-on-transfer token cannot cause a double refund", async function () {
      const { covenant, token, id, donorA, addr } = await loadFixture(reentrantFixture);

      // Arm the token to re-enter claimRefund during the payout transfer.
      await token.arm(addr, covenant.interface.encodeFunctionData("claimRefund", [id]));

      const before = await token.balanceOf(donorA.address);
      const contractBefore = await token.balanceOf(addr);
      await covenant.connect(donorA).claimRefund(id);
      const paid = (await token.balanceOf(donorA.address)) - before;

      // The reentry was attempted but MUST NOT have succeeded (nonReentrant + CEI).
      expect(await token.reentryAttempted()).to.equal(true);
      expect(await token.reentrySucceeded()).to.equal(false);
      // Donor paid exactly their share, once; contract balance dropped by exactly that.
      expect(paid).to.equal(usdc6("0.02"));
      expect(await token.balanceOf(addr)).to.equal(contractBefore - usdc6("0.02"));
      // A second claim finds nothing — no double spend.
      await expect(covenant.connect(donorA).claimRefund(id)).to.be.revertedWith("Nothing to refund");
    });
  });

  // ---------------------------------------------------------------------------
  // Escrow isolation (risk: one campaign paid from another's escrow)
  // ---------------------------------------------------------------------------
  describe("Escrow isolation invariant", function () {
    async function twoCampaignFixture() {
      const [c1, c2, donorA, donorB, reviewer] = await ethers.getSigners();
      const Token = await ethers.getContractFactory("MockUSDC");
      const usdc = (await Token.deploy()) as MockUSDC;
      const Factory = await ethers.getContractFactory("Covenant");
      const covenant = (await Factory.deploy(await usdc.getAddress())) as Covenant;
      const addr = await covenant.getAddress();
      for (const d of [donorA, donorB]) {
        await usdc.mint(d.address, usdc6("10"));
        await usdc.connect(d).approve(addr, usdc6("10"));
      }
      const mk = async (creator: typeof c1) => {
        await covenant.connect(creator).createCampaign("C", "D", CampaignKind.Other, {
          model: ApprovalModel.DesignatedReviewers,
          reviewers: [reviewer.address],
          threshold: 1,
        }, milestones([usdc6("0.02"), usdc6("0.03")]));
        return (await covenant.campaignCount()) - 1n;
      };
      const idA = await mk(c1);
      const idB = await mk(c2);
      return { covenant, usdc, addr, idA, idB, c1, c2, donorA, donorB, reviewer };
    }

    // Contract token balance must always equal the sum of unreleased escrow.
    async function assertBalanceEqualsUnreleased(covenant: Covenant, usdc: MockUSDC, addr: string) {
      const n = await covenant.campaignCount();
      let sum = 0n;
      for (let i = 0n; i < n; i++) {
        const c = await covenant.getCampaign(i);
        sum += c.totalRaised - c.totalReleased;
      }
      expect(await usdc.balanceOf(addr)).to.equal(sum);
    }

    it("releasing or refunding one campaign never touches another's escrow", async function () {
      // Called directly (not via loadFixture): this multi-campaign fixture reads
      // campaignCount in its invariant check, so we want a fresh, uncached deploy.
      const { covenant, usdc, addr, idA, idB, c1, c2, donorA, donorB, reviewer } =
        await twoCampaignFixture();

      await covenant.connect(donorA).donate(idA, usdc6("0.02"));
      await covenant.connect(donorB).donate(idB, usdc6("0.05"));
      await assertBalanceEqualsUnreleased(covenant, usdc, addr);

      // Release milestone 1 of campaign A.
      await covenant.connect(c1).submitProof(idA, "done", HASH, "");
      await covenant.connect(reviewer).reviewProof(idA, true, "");
      const bAfterRelease = await usdc.balanceOf(addr);
      await assertBalanceEqualsUnreleased(covenant, usdc, addr);

      // Campaign B's escrow is exactly what donorB put in — untouched by A's release.
      const cB = await covenant.getCampaign(idB);
      expect(cB.totalReleased).to.equal(0n);
      expect(cB.totalRaised).to.equal(usdc6("0.05"));

      // Cancel + refund campaign B; campaign A's remaining escrow is unchanged.
      // (The raised−released invariant intentionally isn't re-checked here: a
      // refund removes tokens without touching totalRaised/totalReleased, so the
      // exact post-refund balance is asserted concretely below instead.)
      const cAbefore = await covenant.getCampaign(idA);
      await covenant.connect(c2).cancelCampaign(idB);
      await covenant.connect(donorB).claimRefund(idB);
      const cAafter = await covenant.getCampaign(idA);
      expect(cAafter.totalRaised).to.equal(cAbefore.totalRaised);
      expect(cAafter.totalReleased).to.equal(cAbefore.totalReleased);
      // Campaign A still holds its own unreleased tranche.
      expect(await usdc.balanceOf(addr)).to.equal(bAfterRelease - usdc6("0.05"));
    });
  });

  // ---------------------------------------------------------------------------
  // Refund accounting / rounding dust (risk: locked or over-paid escrow)
  // ---------------------------------------------------------------------------
  describe("Refund rounding is safe (never over-pays; dust is bounded)", function () {
    it("pro-rata refunds never exceed unreleased escrow; residue is < donor count", async function () {
      const [creator, dA, dB, dC, reviewer] = await ethers.getSigners();
      const usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as MockUSDC;
      const Factory = await ethers.getContractFactory("Covenant");
      const covenant = (await Factory.deploy(await usdc.getAddress())) as Covenant;
      const addr = await covenant.getAddress();
      for (const d of [dA, dB, dC]) {
        await usdc.mint(d.address, u(1000));
        await usdc.connect(d).approve(addr, u(1000));
      }
      // Two milestones summing to 7 base units. Donations 3 + 3 + 1 = 7 (= goal).
      await covenant.connect(creator).createCampaign("C", "D", CampaignKind.Other, {
        model: ApprovalModel.DesignatedReviewers,
        reviewers: [reviewer.address],
        threshold: 1,
      }, milestones([u(2), u(5)]));
      const id = (await covenant.campaignCount()) - 1n;
      await covenant.connect(dA).donate(id, u(3));
      await covenant.connect(dB).donate(id, u(3));
      await covenant.connect(dC).donate(id, u(1)); // totalRaised = 7

      // Release milestone 1 (amount 2) → unreleased escrow becomes 5, denominator 7.
      await covenant.connect(creator).submitProof(id, "done", HASH, "");
      await covenant.connect(reviewer).reviewProof(id, true, "");
      await covenant.connect(creator).cancelCampaign(id);

      const unreleased = u(5);
      // refundOf = donation * 5 / 7 → 3*5/7=2, 3*5/7=2, 1*5/7=0 (truncated).
      expect(await covenant.refundOf(id, dA.address)).to.equal(u(2));
      expect(await covenant.refundOf(id, dB.address)).to.equal(u(2));
      expect(await covenant.refundOf(id, dC.address)).to.equal(u(0));

      const contractBefore = await usdc.balanceOf(addr);
      await covenant.connect(dA).claimRefund(id);
      await covenant.connect(dB).claimRefund(id);
      // dC's share rounds to zero — the contract correctly rejects an empty claim.
      await expect(covenant.connect(dC).claimRefund(id)).to.be.revertedWith("Nothing to refund");

      const paidOut = contractBefore - (await usdc.balanceOf(addr));
      // Never over-pays the unreleased pool...
      expect(paidOut).to.be.lte(unreleased);
      // ...and the locked dust is bounded (< number of donors), i.e. rounding-only.
      const dust = unreleased - paidOut;
      expect(dust).to.equal(u(1));
      expect(dust).to.be.lt(3n);
    });
  });

  // ---------------------------------------------------------------------------
  // Weighted approval concentration / Sybil (H1 hardening: per-voter weight cap
  // + minimum distinct approvers). This raises the cost of self-approval from
  // "one wallet" to "several well-funded wallets" — it does not make
  // money-weighted voting Sybil-proof (see docs/CONTRACT_SECURITY_REVIEW.md).
  // ---------------------------------------------------------------------------
  describe("Weighted approval concentration (H1 hardening)", function () {
    it("a single donor holding >= threshold weight can NO LONGER release escrow alone", async function () {
      // Same setup as the pre-hardening exploit: a creator's sockpuppet holds
      // 2/3 of the weight. It must no longer be able to release alone, even
      // though its weight alone clears the 51% threshold.
      const [creator, sock, realDonor] = await ethers.getSigners();
      const usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as MockUSDC;
      const Factory = await ethers.getContractFactory("Covenant");
      const covenant = (await Factory.deploy(await usdc.getAddress())) as Covenant;
      const addr = await covenant.getAddress();
      for (const d of [sock, realDonor]) {
        await usdc.mint(d.address, usdc6("1"));
        await usdc.connect(d).approve(addr, usdc6("1"));
      }
      await covenant.connect(creator).createCampaign("C", "D", CampaignKind.Startup, {
        model: ApprovalModel.WeightedApproval,
        reviewers: [],
        threshold: 51,
      }, milestones([usdc6("0.03")]));
      const id = (await covenant.campaignCount()) - 1n;

      await covenant.connect(sock).donate(id, usdc6("0.02")); // sockpuppet: 2/3 weight
      await covenant.connect(realDonor).donate(id, usdc6("0.01"));

      await covenant.connect(creator).submitProof(id, "done", HASH, "");
      // Sock alone approves; weight alone would clear 51%, but MIN_WEIGHTED_APPROVERS
      // (2) blocks release on a single yes-vote.
      await covenant.connect(sock).reviewProof(id, true, "");
      const m = await covenant.getMilestone(id, 0);
      expect(m.released).to.equal(false);
      expect(m.state).to.equal(1); // Submitted — still awaiting a second approver
    });

    it("per-voter weight is capped at MAX_VOTER_WEIGHT_BPS, so one whale can't dominate even with a second voter", async function () {
      const [creator, whale, tiny] = await ethers.getSigners();
      const usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as MockUSDC;
      const Factory = await ethers.getContractFactory("Covenant");
      const covenant = (await Factory.deploy(await usdc.getAddress())) as Covenant;
      const addr = await covenant.getAddress();
      for (const d of [whale, tiny]) {
        await usdc.mint(d.address, usdc6("1"));
        await usdc.connect(d).approve(addr, usdc6("1"));
      }
      // Threshold 51%. Whale holds 90% of the weight, tiny holds 10%.
      await covenant.connect(creator).createCampaign("C", "D", CampaignKind.Startup, {
        model: ApprovalModel.WeightedApproval,
        reviewers: [],
        threshold: 51,
      }, milestones([usdc6("0.10")]));
      const id = (await covenant.campaignCount()) - 1n;
      await covenant.connect(whale).donate(id, usdc6("0.09"));
      await covenant.connect(tiny).donate(id, usdc6("0.01"));

      await covenant.connect(creator).submitProof(id, "done", HASH, "");
      await covenant.connect(whale).reviewProof(id, true, "");
      // Whale's raw weight (0.09/0.10 = 90%) is capped at 50% of the snapshot
      // (0.05), so this single vote is NOT enough to hit 51% alone even before
      // the min-approver rule kicks in.
      let m = await covenant.getMilestone(id, 0);
      expect(m.approvedWeight).to.equal(usdc6("0.05"));
      expect(m.released).to.equal(false);

      // A second distinct approver pushes it over: 0.05 (capped whale) + 0.01 (tiny)
      // = 0.06 / 0.10 = 60% >= 51%, and weightedApproverCount reaches 2.
      await covenant.connect(tiny).reviewProof(id, true, "");
      m = await covenant.getMilestone(id, 0);
      expect(m.released).to.equal(true);
    });

    it("weight snapshot is fixed at submission time (M4 fix) — a mid-review donation can't shift the bar", async function () {
      const [creator, donorA, donorB, lateWhale] = await ethers.getSigners();
      const usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as MockUSDC;
      const Factory = await ethers.getContractFactory("Covenant");
      const covenant = (await Factory.deploy(await usdc.getAddress())) as Covenant;
      const addr = await covenant.getAddress();
      for (const d of [donorA, donorB, lateWhale]) {
        await usdc.mint(d.address, usdc6("10"));
        await usdc.connect(d).approve(addr, usdc6("10"));
      }
      // Goal is large enough that a late donation after submission doesn't
      // trip the over-goal guard.
      await covenant.connect(creator).createCampaign("C", "D", CampaignKind.Startup, {
        model: ApprovalModel.WeightedApproval,
        reviewers: [],
        threshold: 51,
      }, milestones([usdc6("0.10"), usdc6("0.10")])); // goal 0.20: M1 funded at 0.10, headroom for the late donation
      const id = (await covenant.campaignCount()) - 1n;
      await covenant.connect(donorA).donate(id, usdc6("0.05"));
      await covenant.connect(donorB).donate(id, usdc6("0.05"));
      // totalRaised = 0.10 at submission time → snapshot = 0.10; M1 (0.10) is exactly funded.
      await covenant.connect(creator).submitProof(id, "done", HASH, "");

      // A late donor arrives mid-review. Under the OLD (live-denominator) logic
      // this would have diluted the approval bar; with the snapshot it must not.
      await covenant.connect(lateWhale).donate(id, usdc6("0.05"));

      const mBefore = await covenant.getMilestone(id, 0);
      expect(mBefore.weightSnapshot).to.equal(usdc6("0.10"));

      // donorA (capped at 50% of 0.10 = 0.05, no-op here since raw weight is
      // already 0.05) + donorB (same) = 0.10/0.10 = 100% >= 51%, two distinct
      // approvers → releases, using the snapshot, not the post-donation 0.15 total.
      await covenant.connect(donorA).reviewProof(id, true, "");
      await covenant.connect(donorB).reviewProof(id, true, "");
      const m = await covenant.getMilestone(id, 0);
      expect(m.released).to.equal(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Approval integrity (double-vote) and refund integrity (double-claim)
  // ---------------------------------------------------------------------------
  describe("Vote and refund integrity", function () {
    async function committeeFixture() {
      const [creator, donorA, donorB, r1, r2] = await ethers.getSigners();
      const usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as MockUSDC;
      const Factory = await ethers.getContractFactory("Covenant");
      const covenant = (await Factory.deploy(await usdc.getAddress())) as Covenant;
      const addr = await covenant.getAddress();
      for (const d of [donorA, donorB]) {
        await usdc.mint(d.address, usdc6("1"));
        await usdc.connect(d).approve(addr, usdc6("1"));
      }
      await covenant.connect(creator).createCampaign("C", "D", CampaignKind.Other, {
        model: ApprovalModel.DesignatedReviewers,
        reviewers: [r1.address, r2.address],
        threshold: 2, // committee — needs both
      }, milestones([usdc6("0.05")]));
      const id = (await covenant.campaignCount()) - 1n;
      await covenant.connect(donorA).donate(id, usdc6("0.03"));
      await covenant.connect(donorB).donate(id, usdc6("0.02"));
      return { covenant, usdc, id, creator, donorA, r1, r2, addr };
    }

    it("a reviewer cannot double-vote to reach a committee threshold alone", async function () {
      const { covenant, id, creator, r1 } = await loadFixture(committeeFixture);
      await covenant.connect(creator).submitProof(id, "done", HASH, "");
      await covenant.connect(r1).reviewProof(id, true, "");
      await expect(covenant.connect(r1).reviewProof(id, true, "")).to.be.revertedWith(
        "Already reviewed this submission",
      );
      // Still Submitted (1/2), funds NOT released.
      const m = await covenant.getMilestone(id, 0);
      expect(m.released).to.equal(false);
    });

    it("a donor cannot claim a refund twice", async function () {
      const { covenant, id, creator, donorA } = await loadFixture(committeeFixture);
      await covenant.connect(creator).cancelCampaign(id);
      await covenant.connect(donorA).claimRefund(id);
      await expect(covenant.connect(donorA).claimRefund(id)).to.be.revertedWith("Nothing to refund");
    });
  });

  // ---------------------------------------------------------------------------
  // Circuit breaker (M1: emergency pause). Halts inflows + releases, but NEVER
  // traps user exits — refunds/cancel/fail/submit always work while paused.
  // ---------------------------------------------------------------------------
  describe("Circuit breaker (Pausable)", function () {
    // Signer 0 is the deployer/owner; signer 1 is the (distinct) campaign creator.
    async function pausableFixture() {
      const [owner, creator, donorA, donorB, reviewer] = await ethers.getSigners();
      const usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as MockUSDC;
      const covenant = (await (await ethers.getContractFactory("Covenant")).deploy(
        await usdc.getAddress(),
      )) as Covenant;
      const addr = await covenant.getAddress();
      for (const d of [donorA, donorB]) {
        await usdc.mint(d.address, usdc6("1"));
        await usdc.connect(d).approve(addr, usdc6("1"));
      }
      await covenant.connect(creator).createCampaign("C", "D", CampaignKind.Other, {
        model: ApprovalModel.DesignatedReviewers,
        reviewers: [reviewer.address],
        threshold: 1,
      }, milestones([usdc6("0.02"), usdc6("0.03")]));
      const id = (await covenant.campaignCount()) - 1n;
      // Fund milestone 1 (0.02) with headroom under the 0.05 goal so post-unpause
      // donations don't trip the over-goal guard.
      await covenant.connect(donorA).donate(id, usdc6("0.02"));
      await covenant.connect(donorB).donate(id, usdc6("0.02"));
      return { covenant, usdc, owner, creator, donorA, donorB, reviewer, id };
    }

    it("only the owner can pause / unpause", async function () {
      const { covenant, creator } = await loadFixture(pausableFixture);
      await expect(covenant.connect(creator).pause()).to.be.revertedWithCustomError(
        covenant,
        "OwnableUnauthorizedAccount",
      );
      await covenant.pause(); // owner = default signer
      expect(await covenant.paused()).to.equal(true);
      await expect(covenant.connect(creator).unpause()).to.be.revertedWithCustomError(
        covenant,
        "OwnableUnauthorizedAccount",
      );
      await covenant.unpause();
      expect(await covenant.paused()).to.equal(false);
    });

    it("pausing halts donations, new campaigns, and reviews", async function () {
      const { covenant, creator, donorA, reviewer, id } = await loadFixture(pausableFixture);
      await covenant.connect(creator).submitProof(id, "done", HASH, ""); // submit before pausing
      await covenant.pause();

      await expect(
        covenant.connect(donorA).donate(id, usdc6("0.001")),
      ).to.be.revertedWithCustomError(covenant, "EnforcedPause");
      await expect(
        covenant.connect(reviewer).reviewProof(id, true, ""),
      ).to.be.revertedWithCustomError(covenant, "EnforcedPause");
      await expect(
        covenant.connect(creator).createCampaign("X", "Y", CampaignKind.Other, {
          model: ApprovalModel.WeightedApproval,
          reviewers: [],
          threshold: 50,
        }, milestones([usdc6("0.01")])),
      ).to.be.revertedWithCustomError(covenant, "EnforcedPause");
    });

    it("never blocks exits: submitProof, cancel and refunds work while paused", async function () {
      const { covenant, creator, donorA, id } = await loadFixture(pausableFixture);
      await covenant.pause();
      // Creator can still submit proof (no money moves).
      await expect(covenant.connect(creator).submitProof(id, "done", HASH, "")).to.not.be.reverted;
      // Creator can still cancel, opening refunds.
      await expect(covenant.connect(creator).cancelCampaign(id)).to.not.be.reverted;
      // Donors can still recover their escrow.
      await expect(covenant.connect(donorA).claimRefund(id)).to.not.be.reverted;
    });

    it("failCampaign still works while paused (deadline recovery is never trapped)", async function () {
      const [owner, creator, donorA, , reviewer] = await ethers.getSigners();
      const usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as MockUSDC;
      const covenant = (await (await ethers.getContractFactory("Covenant")).deploy(
        await usdc.getAddress(),
      )) as Covenant;
      await usdc.mint(donorA.address, usdc6("1"));
      await usdc.connect(donorA).approve(await covenant.getAddress(), usdc6("1"));
      const deadline = (await time.latest()) + 3600;
      await covenant.connect(creator).createCampaign("C", "D", CampaignKind.Other, {
        model: ApprovalModel.DesignatedReviewers,
        reviewers: [reviewer.address],
        threshold: 1,
      }, [{ criteria: criteria({ title: "M1", proofDeadline: deadline }), amount: usdc6("0.05") }]);
      const id = (await covenant.campaignCount()) - 1n;
      await covenant.connect(donorA).donate(id, usdc6("0.05"));
      await time.increaseTo(deadline + 1);
      await covenant.connect(owner).pause();
      // Even paused, anyone can fail a deadline-blown campaign and donors refund.
      await expect(covenant.connect(donorA).failCampaign(id)).to.not.be.reverted;
      await expect(covenant.connect(donorA).claimRefund(id)).to.not.be.reverted;
    });

    it("unpausing restores donations and reviews", async function () {
      const { covenant, creator, donorA, reviewer, id } = await loadFixture(pausableFixture);
      await covenant.pause();
      await covenant.unpause();
      await expect(covenant.connect(donorA).donate(id, usdc6("0.001"))).to.not.be.reverted;
      await covenant.connect(creator).submitProof(id, "done", HASH, "");
      await expect(covenant.connect(reviewer).reviewProof(id, true, "")).to.not.be.reverted;
    });
  });
});
