import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEther } from "viem";
import { DEFAULT_MNEMONIC } from "../src/lib/config.js";
import { deriveWallet } from "../src/lib/wallets.js";
import {
  loadDeployment,
  makePublicClient,
  makeWalletClient,
  usdc6,
  USDC_ABI,
} from "../src/lib/chain.js";
import { NonceManager } from "../src/lib/nonce.js";
import { milestoneInputs, ApprovalModel } from "../src/lib/covenant.js";

/**
 * Prepares on-chain state for the browser flows and writes it to
 * browser/.state.json for the specs to read:
 *   - wallet #10 (creator) + #11/#12 (donors): funded with ETH + MockUSDC
 *   - creator vetted (setCreatorApproval) so repeated runs never hit the
 *     2-campaign lifetime cap or the 1-day cooldown
 *   - one fresh WeightedApproval campaign per run for donate/proof/vote flows
 *
 * Uses HD indices 10-12 because hardhat node unlocks indices 0-19 — the
 * in-page wallet shim relies on node-side signing.
 */

const STATE_PATH = fileURLToPath(new URL("./.state.json", import.meta.url));

export default async function globalSetup() {
  const rpcUrl = process.env.LOADTEST_RPC_URL ?? "http://127.0.0.1:8545";
  const cfg = {
    rpcUrl,
    chainId: Number(process.env.LOADTEST_CHAIN_ID ?? 31337),
    mnemonic: DEFAULT_MNEMONIC,
  } as Parameters<typeof loadDeployment>[0];

  const deployment = loadDeployment(cfg);
  const publicClient = makePublicClient(cfg, deployment);
  const nonces = new NonceManager(publicClient);

  const owner = deriveWallet(cfg.mnemonic, 0);
  const creator = deriveWallet(cfg.mnemonic, 10);
  const donorA = deriveWallet(cfg.mnemonic, 11);
  const donorB = deriveWallet(cfg.mnemonic, 12);
  const ownerClient = makeWalletClient(cfg, deployment, owner);

  const send = (fn: (nonce: number) => Promise<`0x${string}`>) =>
    nonces.withNonce(owner.address, fn);

  // Gas + USDC top-ups (idempotent).
  let last: `0x${string}` | undefined;
  for (const w of [creator, donorA, donorB]) {
    const bal = await publicClient.getBalance({ address: w.address });
    if (bal < parseEther("0.5")) {
      last = await send((nonce) =>
        ownerClient.sendTransaction({
          to: w.address,
          value: parseEther("1"),
          nonce,
          account: owner,
          chain: ownerClient.chain,
        }),
      );
    }
  }
  for (const w of [donorA, donorB]) {
    const bal = (await publicClient.readContract({
      address: deployment.usdc.address,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [w.address],
    })) as bigint;
    if (bal < usdc6(50)) {
      last = await send((nonce) =>
        ownerClient.writeContract({
          address: deployment.usdc.address,
          abi: USDC_ABI,
          functionName: "mint",
          args: [w.address, usdc6(100)],
          nonce,
          account: owner,
          chain: ownerClient.chain,
        }),
      );
    }
  }

  // The donate spec must exercise the two-step approve->donate UX, so donorA
  // starts every run with a zero allowance (the actor seeder may have granted
  // a max allowance to the same wallet).
  const donorAClient = makeWalletClient(cfg, deployment, donorA);
  const allowance = (await publicClient.readContract({
    address: deployment.usdc.address,
    abi: USDC_ABI,
    functionName: "allowance",
    args: [donorA.address, deployment.covenant.address],
  })) as bigint;
  if (allowance > 0n) {
    const resetHash = await nonces.withNonce(donorA.address, (nonce) =>
      donorAClient.writeContract({
        address: deployment.usdc.address,
        abi: USDC_ABI,
        functionName: "approve",
        args: [deployment.covenant.address, 0n],
        nonce,
        account: donorA,
        chain: donorAClient.chain,
      }),
    );
    await publicClient.waitForTransactionReceipt({ hash: resetHash });
  }

  const vetted = (await publicClient.readContract({
    address: deployment.covenant.address,
    abi: deployment.covenant.abi,
    functionName: "approvedCreators",
    args: [creator.address],
  })) as boolean;
  if (!vetted) {
    last = await send((nonce) =>
      ownerClient.writeContract({
        address: deployment.covenant.address,
        abi: deployment.covenant.abi,
        functionName: "setCreatorApproval",
        args: [creator.address, true],
        nonce,
        account: owner,
        chain: ownerClient.chain,
      }),
    );
  }
  if (last) await publicClient.waitForTransactionReceipt({ hash: last });

  // Fresh target campaign for donate -> proof -> vote (weighted, 50%).
  const creatorClient = makeWalletClient(cfg, deployment, creator);
  const title = `BT flow target ${Date.now()}`;
  const hash = await nonces.withNonce(creator.address, (nonce) =>
    creatorClient.writeContract({
      address: deployment.covenant.address,
      abi: deployment.covenant.abi,
      functionName: "createCampaign",
      args: [
        title,
        "Browser-flow target campaign (weighted approval, 50%).",
        0, // Charity
        { model: ApprovalModel.WeightedApproval, reviewers: [], threshold: 50 },
        milestoneInputs([usdc6(1), usdc6(1)], title),
      ],
      nonce,
      account: creator,
      chain: creatorClient.chain,
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash });
  const count = (await publicClient.readContract({
    address: deployment.covenant.address,
    abi: deployment.covenant.abi,
    functionName: "campaignCount",
  })) as bigint;
  const campaignId = (count - 1n).toString();

  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify(
      {
        rpcUrl,
        chainId: cfg.chainId,
        campaignId,
        creator: creator.address,
        donorA: donorA.address,
        donorB: donorB.address,
      },
      null,
      2,
    ),
  );
  console.log(`[global-setup] flow campaign #${campaignId} ("${title}") ready`);
}

export function readState(): {
  rpcUrl: string;
  chainId: number;
  campaignId: string;
  creator: string;
  donorA: string;
  donorB: string;
} {
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}
