import { randomBytes } from "node:crypto";
import { keccak256, type Account } from "viem";
import { parseCliConfig, pick, randInt, sleep, type LoadtestConfig } from "./lib/config.js";
import { deriveActors, deriveWallet, type ActorSet, type ActorWallet } from "./lib/wallets.js";
import {
  loadDeployment,
  makePublicClient,
  makeWalletClient,
  usdc6,
  USDC_ABI,
  type Deployment,
} from "./lib/chain.js";
import { NonceManager } from "./lib/nonce.js";
import { Semaphore } from "./lib/pool.js";
import { Metrics } from "./lib/metrics.js";
import { sendTx, timedRead, type TxContext } from "./lib/tx.js";
import {
  ApprovalModel,
  Covenant,
  currentMilestoneFunding,
  milestoneInputs,
  MilestoneState,
} from "./lib/covenant.js";

/**
 * Blockchain-actor load: N distinct wallets behaving like creators, donors,
 * reviewers, and read-only browsers against the deployed Covenant contract.
 *
 *   yarn workspace @covenant/loadtest actors --users 1000 --scenario mixed-write --duration 120
 *
 * Run `seed` for the same --users first. See src/lib/config.ts for scenarios.
 */

interface CampaignInfo {
  id: bigint;
  creator: ActorWallet;
  model: "weighted" | "designated" | "operator";
  reviewers: ActorWallet[];
}

interface Runtime {
  cfg: LoadtestConfig;
  deployment: Deployment;
  ctx: TxContext;
  covenant: Covenant;
  actors: ActorSet;
  owner: Account; // platform operator (index 0)
  campaigns: CampaignInfo[];
  deadline: number;
}

const manifestHash = () => keccak256(randomBytes(32));

// ---------------------------------------------------------------------------
// Setup phase: creators bring campaigns into existence
// ---------------------------------------------------------------------------

async function setupCampaigns(rt: Runtime): Promise<void> {
  const { cfg, deployment, ctx, covenant, actors } = rt;
  const spec = cfg.scenario;
  const startCount = await covenant.campaignCount();

  const creations: Array<{ creator: ActorWallet; title: string; info: Omit<CampaignInfo, "id"> }> = [];
  actors.creators.forEach((creator, ci) => {
    for (let k = 0; k < spec.campaignsPerCreator; k++) {
      const model = spec.approvalModels[(ci + k) % spec.approvalModels.length];
      let reviewers: ActorWallet[] = [];
      if (model === "designated") {
        reviewers = spec.sharedReviewerCount
          ? actors.reviewers.slice(0, spec.sharedReviewerCount)
          : actors.reviewers.length
            ? Array.from(
                { length: Math.min(actors.reviewers.length, spec.reviewerThreshold + 1) },
                (_, r) => actors.reviewers[(ci + k + r) % actors.reviewers.length],
              ).filter((w, i, arr) => arr.findIndex((x) => x.address === w.address) === i)
            : [];
      }
      creations.push({
        creator,
        title: `LT ${cfg.label} c${ci}-${k}`,
        info: { creator, model, reviewers },
      });
    }
  });

  console.log(`Setup: creating ${creations.length} campaigns…`);
  await Promise.all(
    creations.map(async ({ creator, title, info }) => {
      let amounts: bigint[];
      if (spec.name === "weighted-vote") {
        // Milestone 1 sized so every donor's fixed 5 USDC donation fits exactly,
        // plus a second milestone so releasing #1 doesn't complete the campaign.
        amounts = [usdc6(actors.donors.length * 5), usdc6(50)];
      } else {
        amounts = Array.from({ length: randInt(2, 3) }, () => usdc6(randInt(50, 150)));
      }
      const threshold =
        info.model === "weighted"
          ? spec.weightedThreshold
          : info.model === "designated"
            ? Math.min(spec.reviewerThreshold, info.reviewers.length)
            : 1;
      await sendTx(ctx, {
        op: "createCampaign",
        role: "creator",
        account: creator.account,
        address: covenant.address,
        abi: covenant.abi,
        functionName: "createCampaign",
        args: [
          title,
          `Load-generated campaign (${info.model})`,
          3, // CampaignKind.Other
          {
            model:
              info.model === "weighted"
                ? ApprovalModel.WeightedApproval
                : info.model === "designated"
                  ? ApprovalModel.DesignatedReviewers
                  : ApprovalModel.PlatformOperator,
            reviewers: info.reviewers.map((r) => r.address),
            threshold,
          },
          milestoneInputs(amounts, title),
        ],
      });
    }),
  );

  // Recover ids by matching the unique titles we just wrote.
  const all = await covenant.getAllCampaigns();
  const byTitle = new Map(creations.map((c) => [c.title, c.info]));
  for (const c of all) {
    if (c.id < startCount) continue;
    const info = byTitle.get(c.title);
    if (info) rt.campaigns.push({ id: c.id, ...info });
  }
  console.log(`Setup: ${rt.campaigns.length}/${creations.length} campaigns live (ids ${startCount}…)`);
  if (rt.campaigns.length === 0) throw new Error("No campaigns created — check seed ran for this preset.");
}

// ---------------------------------------------------------------------------
// Free-running role loops
// ---------------------------------------------------------------------------

const running = (rt: Runtime) => Date.now() < rt.deadline;
const think = (rt: Runtime) => sleep(randInt(...rt.cfg.scenario.thinkMs));

async function donorLoop(rt: Runtime, w: ActorWallet): Promise<void> {
  const { ctx, covenant, cfg } = rt;
  while (running(rt)) {
    const info = pick(rt.campaigns);
    const campaign = await timedRead(ctx, "read:getCampaign", "donor", () =>
      covenant.getCampaign(info.id),
    );
    const milestones = await timedRead(ctx, "read:getMilestones", "donor", () =>
      covenant.getMilestones(info.id),
    );
    if (!campaign || !milestones || !campaign.active) {
      await think(rt);
      continue;
    }
    const funding = currentMilestoneFunding(campaign, milestones);

    if (funding.locked) {
      // UI pauses donations here. If it's a weighted campaign under review and
      // we hold donation weight, cast our vote instead — that's what the UI offers.
      if (
        info.model === "weighted" &&
        funding.milestone?.state === MilestoneState.Submitted &&
        Math.random() < 0.5
      ) {
        const donated = await timedRead(ctx, "read:getDonation", "donor", () =>
          covenant.getDonation(info.id, w.address),
        );
        if (donated && donated > 0n) {
          await sendTx(ctx, {
            op: "reviewProof:weighted-vote",
            role: "donor",
            account: w.account,
            address: covenant.address,
            abi: covenant.abi,
            functionName: "reviewProof",
            args: [info.id, true, "looks good"],
          });
        }
      } else {
        ctx.metrics.bump("donations-skipped:milestone-locked");
      }
      await think(rt);
      continue;
    }

    if (funding.remainingToMilestone === 0n) {
      ctx.metrics.bump("donations-skipped:campaign-full");
      await think(rt);
      continue;
    }

    const wish = usdc6(randInt(1, 25));
    const amount = wish < funding.remainingToMilestone ? wish : funding.remainingToMilestone;

    if (cfg.approveMode === "exact") {
      await sendTx(ctx, {
        op: "usdc:approve",
        role: "donor",
        account: w.account,
        address: rt.deployment.usdc.address,
        abi: USDC_ABI,
        functionName: "approve",
        args: [covenant.address, amount],
      });
    }
    await sendTx(ctx, {
      op: "donate",
      role: "donor",
      account: w.account,
      address: covenant.address,
      abi: covenant.abi,
      functionName: "donate",
      args: [info.id, amount],
    });
    await think(rt);
  }
}

async function creatorLoop(rt: Runtime, w: ActorWallet): Promise<void> {
  const { ctx, covenant } = rt;
  const mine = rt.campaigns.filter((c) => c.creator.address === w.address);
  while (running(rt) && mine.length > 0) {
    for (const info of mine) {
      const campaign = await timedRead(ctx, "read:getCampaign", "creator", () =>
        covenant.getCampaign(info.id),
      );
      const milestones = await timedRead(ctx, "read:getMilestones", "creator", () =>
        covenant.getMilestones(info.id),
      );
      if (!campaign || !milestones || !campaign.active) continue;
      const { milestone, remainingToMilestone } = currentMilestoneFunding(campaign, milestones);
      const canSubmit =
        milestone !== undefined &&
        remainingToMilestone === 0n &&
        (milestone.state === MilestoneState.Pending ||
          milestone.state === MilestoneState.ChangesRequested);
      if (canSubmit) {
        await sendTx(ctx, {
          op: "submitProof",
          role: "creator",
          account: w.account,
          address: covenant.address,
          abi: covenant.abi,
          functionName: "submitProof",
          args: [info.id, `Proof for milestone (load run)`, manifestHash(), ""],
        });
      }
    }
    await think(rt);
  }
}

/** Shared by designated reviewers and the platform-operator wallet. */
async function reviewerLoop(
  rt: Runtime,
  account: Account,
  role: string,
  reviewable: CampaignInfo[],
): Promise<void> {
  const { ctx, covenant, cfg } = rt;
  while (running(rt) && reviewable.length > 0) {
    for (const info of reviewable) {
      if (!running(rt)) break;
      const campaign = await timedRead(ctx, "read:getCampaign", role, () =>
        covenant.getCampaign(info.id),
      );
      if (!campaign?.active) continue;
      const milestones = await timedRead(ctx, "read:getMilestones", role, () =>
        covenant.getMilestones(info.id),
      );
      const mi = Number(campaign.currentMilestone);
      const milestone = milestones?.[mi];
      if (!milestone || milestone.state !== MilestoneState.Submitted) continue;
      const reject = Math.random() < cfg.scenario.rejectRate;
      await sendTx(ctx, {
        op: reject ? "reviewProof:reject" : "reviewProof:approve",
        role,
        account,
        address: covenant.address,
        abi: covenant.abi,
        functionName: "reviewProof",
        args: [info.id, !reject, reject ? "Insufficient evidence — resubmit with receipts." : "ok"],
      });
    }
    await think(rt);
  }
}

async function readerLoop(rt: Runtime, w: ActorWallet): Promise<void> {
  const { ctx, covenant, deployment } = rt;
  const publicClient = ctx.publicClient;
  while (running(rt)) {
    const roll = Math.random();
    if (roll < 0.3) {
      // Homepage / campaigns list: the O(n) full-table read every visitor triggers.
      await timedRead(ctx, "read:getAllCampaigns", "reader", () => covenant.getAllCampaigns());
    } else if (roll < 0.7) {
      const info = pick(rt.campaigns);
      await timedRead(ctx, "read:getCampaign", "reader", () => covenant.getCampaign(info.id));
      await timedRead(ctx, "read:getMilestones", "reader", () => covenant.getMilestones(info.id));
      await timedRead(ctx, "read:getApprovalConfig", "reader", () =>
        covenant.getApprovalConfig(info.id),
      );
    } else if (roll < 0.8) {
      const info = pick(rt.campaigns);
      await timedRead(ctx, "read:trustScore", "reader", () =>
        covenant.trustScore(info.creator.address),
      );
    } else if (roll < 0.9) {
      await timedRead(ctx, "read:campaignCount", "reader", () => covenant.campaignCount());
    } else {
      // Activity feed: the getLogs scan every campaign page kicks off.
      const info = pick(rt.campaigns);
      await timedRead(ctx, "read:getLogs(activity)", "reader", async () => {
        const latest = await publicClient.getBlockNumber();
        return publicClient.getContractEvents({
          address: covenant.address,
          abi: covenant.abi,
          fromBlock: deployment.covenant.deployBlock,
          toBlock: latest,
        });
      });
    }
    await think(rt);
  }
}

// ---------------------------------------------------------------------------
// weighted-vote choreography: fund -> submit -> concurrent vote burst
// ---------------------------------------------------------------------------

async function runWeightedVote(rt: Runtime): Promise<void> {
  const { ctx, covenant, actors, cfg } = rt;
  const info = rt.campaigns[0];
  const share = usdc6(5);

  console.log(
    `weighted-vote: ${actors.donors.length} donors × 5 USDC into campaign #${info.id}, threshold ${cfg.scenario.weightedThreshold}%`,
  );

  // Phase 1 — ramped donations until milestone 1 is exactly funded.
  const rampMs = cfg.rampSec * 1000;
  await Promise.all(
    actors.donors.map(async (w, i) => {
      await sleep((i / actors.donors.length) * rampMs);
      await sendTx(ctx, {
        op: "donate",
        role: "donor",
        account: w.account,
        address: covenant.address,
        abi: covenant.abi,
        functionName: "donate",
        args: [info.id, share],
      });
    }),
  );

  // Phase 2 — creator submits proof once funded.
  await sendTx(ctx, {
    op: "submitProof",
    role: "creator",
    account: info.creator.account,
    address: covenant.address,
    abi: covenant.abi,
    functionName: "submitProof",
    args: [info.id, "Milestone 1 complete", manifestHash(), ""],
  });

  // Phase 3 — every donor votes at once. Once approvals cross the percent
  // threshold the milestone releases and the remaining votes MUST revert with
  // "No proof awaiting review" — that's the approval race this scenario measures.
  console.log("weighted-vote: vote burst…");
  const burstStart = Date.now();
  await Promise.all(
    actors.donors.map((w) =>
      sendTx(ctx, {
        op: "reviewProof:weighted-vote",
        role: "donor",
        account: w.account,
        address: covenant.address,
        abi: covenant.abi,
        functionName: "reviewProof",
        args: [info.id, true, "approve"],
      }),
    ),
  );

  const campaign = await covenant.getCampaign(info.id);
  const released = Number(campaign.currentMilestone) >= 1;
  ctx.metrics.bump("weighted-vote:released", released ? 1 : 0);
  console.log(
    `weighted-vote: milestone ${released ? "RELEASED" : "NOT released"} ${Date.now() - burstStart}ms after burst start`,
  );
}

// ---------------------------------------------------------------------------

async function main() {
  const cfg = parseCliConfig();
  const deployment = loadDeployment(cfg);
  const publicClient = makePublicClient(cfg, deployment);
  const metrics = new Metrics();
  const walletClients = new Map<string, ReturnType<typeof makeWalletClient>>();

  const ctx: TxContext = {
    publicClient,
    walletFor: (account) => {
      let c = walletClients.get(account.address);
      if (!c) {
        c = makeWalletClient(cfg, deployment, account);
        walletClients.set(account.address, c);
      }
      return c;
    },
    nonces: new NonceManager(publicClient),
    inflight: new Semaphore(cfg.maxInflight),
    metrics,
    receiptTimeoutMs: 120_000,
  };

  const actors = deriveActors(cfg);
  const owner = deriveWallet(cfg.mnemonic, 0);
  const rt: Runtime = {
    cfg,
    deployment,
    ctx,
    covenant: new Covenant(deployment, publicClient),
    actors,
    owner,
    campaigns: [],
    deadline: 0,
  };

  console.log(
    `Scenario ${cfg.scenario.name}: ${cfg.users} users ` +
      `(${actors.creators.length}cr/${actors.donors.length}do/${actors.reviewers.length}rv/${actors.readers.length}rd), ` +
      `ramp ${cfg.rampSec}s, duration ${cfg.durationSec}s, max-inflight ${cfg.maxInflight}`,
  );
  console.log(cfg.scenario.description + "\n");

  await setupCampaigns(rt);
  rt.deadline = Date.now() + (cfg.rampSec + cfg.durationSec) * 1000;

  const loops: Promise<void>[] = [];
  if (cfg.scenario.name === "weighted-vote") {
    loops.push(runWeightedVote(rt));
    actors.readers.forEach((w, i) => {
      loops.push(sleep((i / Math.max(actors.readers.length, 1)) * cfg.rampSec * 1000).then(() => readerLoop(rt, w)));
    });
  } else {
    const rampMs = cfg.rampSec * 1000;
    const total = actors.all.length;
    actors.all.forEach((w, i) => {
      const delay = (i / total) * rampMs;
      const start = sleep(delay);
      switch (w.role) {
        case "donor":
          loops.push(start.then(() => donorLoop(rt, w)));
          break;
        case "creator":
          loops.push(start.then(() => creatorLoop(rt, w)));
          break;
        case "reviewer": {
          const reviewable = rt.campaigns.filter((c) =>
            c.reviewers.some((r) => r.address === w.address),
          );
          loops.push(start.then(() => reviewerLoop(rt, w.account, "reviewer", reviewable)));
          break;
        }
        case "reader":
          loops.push(start.then(() => readerLoop(rt, w)));
          break;
      }
    });
    // The platform operator reviews every PlatformOperator campaign — one
    // wallet serving the whole platform, a bottleneck by construction.
    const operatorCampaigns = rt.campaigns.filter((c) => c.model === "operator");
    if (operatorCampaigns.length) {
      loops.push(reviewerLoop(rt, owner, "operator", operatorCampaigns));
    }
  }

  await Promise.all(loops);

  metrics.printSummary();
  const { jsonPath, csvPath } = metrics.write(cfg.outDir, cfg.label);
  console.log(`\nResults written:\n  ${jsonPath}\n  ${csvPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
