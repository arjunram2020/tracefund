import { formatEther, parseEther, maxUint256 } from "viem";
import { parseCliConfig } from "./lib/config.js";
import { deriveActors, deriveWallet, type ActorWallet } from "./lib/wallets.js";
import {
  loadDeployment,
  makePublicClient,
  makeWalletClient,
  usdc6,
  USDC_ABI,
} from "./lib/chain.js";
import { NonceManager } from "./lib/nonce.js";
import { runPool } from "./lib/pool.js";

/**
 * Seed the actor wallet set for a given preset. Idempotent — re-running only
 * tops up what is missing, so `seed --users 1000` after `seed --users 100`
 * just fills in the new 900 wallets.
 *
 *   yarn workspace @covenant/loadtest seed --users 1000 [--scenario mixed-write]
 *
 * What it does, per role:
 *   everyone but readers  -> 1 ETH gas from account #0
 *   donors                -> 10,000 MockUSDC minted + (approve-mode=max) an
 *                            unlimited USDC allowance to the Covenant escrow
 *   creators              -> setCreatorApproval(creator, true) from the owner,
 *                            lifting the 2-campaign cap and 1-day cooldown
 *   browser wallets 10-19 -> ETH + USDC so Playwright sessions can act
 *
 * NOTE (finding, not bug): without the owner batch-approving creators, a
 * 1000-user launch could create at most 2 campaigns per address per day —
 * the anti-spam limits make the platform owner an operational bottleneck.
 *
 * Forked Base: MockUSDC's open mint() doesn't exist on canonical USDC. Run
 * anvil --fork-url <base rpc>, set USDC_WHALE=<address holding USDC>, and the
 * script impersonates the whale (anvil_impersonateAccount) to transfer real
 * USDC to donors instead of minting.
 */
async function main() {
  const cfg = parseCliConfig();
  const deployment = loadDeployment(cfg);
  const publicClient = makePublicClient(cfg, deployment);
  const nonces = new NonceManager(publicClient);

  const funder = deriveWallet(cfg.mnemonic, 0); // deployer/owner on a local chain
  const funderClient = makeWalletClient(cfg, deployment, funder);

  const actors = deriveActors(cfg);
  const browserWallets: ActorWallet[] = Array.from({ length: 6 }, (_, i) => {
    const index = 10 + i;
    const account = deriveWallet(cfg.mnemonic, index);
    return { index, role: i === 0 ? "creator" : "donor", account, address: account.address };
  });

  console.log(`Seeding ${cfg.users} actors (${cfg.scenario.name}) via ${cfg.rpcUrl}`);
  console.log(
    `  creators=${actors.creators.length} donors=${actors.donors.length} reviewers=${actors.reviewers.length} readers=${actors.readers.length} (+${browserWallets.length} browser wallets)`,
  );
  console.log(`  Covenant ${deployment.covenant.address} | USDC ${deployment.usdc.address}`);

  const funderBalance = await publicClient.getBalance({ address: funder.address });
  console.log(`  funder ${funder.address} holds ${formatEther(funderBalance)} ETH`);

  const gasTargets = [...actors.creators, ...actors.donors, ...actors.reviewers, ...browserWallets];
  const usdcTargets = [...actors.donors, ...browserWallets];

  // ---- 1. Gas: 1 ETH each (top-up only) -------------------------------------
  const GAS_ETH = parseEther("1");
  let lastHash: `0x${string}` | undefined;
  let funded = 0;
  for (const w of gasTargets) {
    const balance = await publicClient.getBalance({ address: w.address });
    if (balance >= GAS_ETH / 2n) continue;
    lastHash = await nonces.withNonce(funder.address, (nonce) =>
      funderClient.sendTransaction({
        to: w.address,
        value: GAS_ETH,
        nonce,
        account: funder,
        chain: funderClient.chain,
      }),
    );
    funded++;
  }
  if (lastHash) await publicClient.waitForTransactionReceipt({ hash: lastHash });
  console.log(`ETH: funded ${funded}/${gasTargets.length} wallets (rest already funded)`);

  // ---- 2. USDC to donors -----------------------------------------------------
  const USDC_TARGET = usdc6(10_000);
  const whale = process.env.USDC_WHALE as `0x${string}` | undefined;
  if (whale) {
    // Forked-network path: impersonate a real USDC holder.
    await publicClient.request({ method: "anvil_impersonateAccount" as never, params: [whale] as never });
  }
  lastHash = undefined;
  let minted = 0;
  for (const w of usdcTargets) {
    const balance = (await publicClient.readContract({
      address: deployment.usdc.address,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [w.address],
    })) as bigint;
    if (balance >= USDC_TARGET / 2n) continue;
    const amount = USDC_TARGET - balance;
    if (whale) {
      lastHash = (await publicClient.request({
        method: "eth_sendTransaction" as never,
        params: [
          {
            from: whale,
            to: deployment.usdc.address,
            data: encodeTransfer(w.address, amount),
          },
        ] as never,
      })) as `0x${string}`;
    } else {
      lastHash = await nonces.withNonce(funder.address, (nonce) =>
        funderClient.writeContract({
          address: deployment.usdc.address,
          abi: USDC_ABI,
          functionName: "mint",
          args: [w.address, amount],
          nonce,
          account: funder,
          chain: funderClient.chain,
        }),
      );
    }
    minted++;
  }
  if (lastHash) await publicClient.waitForTransactionReceipt({ hash: lastHash });
  console.log(`USDC: topped up ${minted}/${usdcTargets.length} donor wallets to 10,000 USDC`);

  // ---- 3. Escrow allowances (max mode) ---------------------------------------
  if (cfg.approveMode === "max") {
    const tasks = usdcTargets.map((w) => async () => {
      const allowance = (await publicClient.readContract({
        address: deployment.usdc.address,
        abi: USDC_ABI,
        functionName: "allowance",
        args: [w.address, deployment.covenant.address],
      })) as bigint;
      if (allowance > maxUint256 / 2n) return false;
      const client = makeWalletClient(cfg, deployment, w.account);
      const hash = await nonces.withNonce(w.address, (nonce) =>
        client.writeContract({
          address: deployment.usdc.address,
          abi: USDC_ABI,
          functionName: "approve",
          args: [deployment.covenant.address, maxUint256],
          nonce,
          account: w.account,
          chain: client.chain,
        }),
      );
      await publicClient.waitForTransactionReceipt({ hash });
      return true;
    });
    const results = await runPool(tasks, 50);
    const approved = results.filter((r) => r.ok && r.value).length;
    const failures = results.filter((r) => !r.ok);
    console.log(`Allowances: ${approved} new max approvals to the escrow (${failures.length} failed)`);
    if (failures.length) console.log("  first failure:", String((failures[0].error as Error)?.message).slice(0, 200));
  } else {
    console.log("Allowances: skipped (approve-mode=exact — donors approve per donation at run time)");
  }

  // ---- 4. Creator approvals (owner-only) — lifts anti-spam limits -------------
  const creatorTargets = [...actors.creators, browserWallets[0]];
  lastHash = undefined;
  let vetted = 0;
  for (const w of creatorTargets) {
    const already = (await publicClient.readContract({
      address: deployment.covenant.address,
      abi: deployment.covenant.abi,
      functionName: "approvedCreators",
      args: [w.address],
    })) as boolean;
    if (already) continue;
    lastHash = await nonces.withNonce(funder.address, (nonce) =>
      funderClient.writeContract({
        address: deployment.covenant.address,
        abi: deployment.covenant.abi,
        functionName: "setCreatorApproval",
        args: [w.address, true],
        nonce,
        account: funder,
        chain: funderClient.chain,
      }),
    );
    vetted++;
  }
  if (lastHash) await publicClient.waitForTransactionReceipt({ hash: lastHash });
  console.log(`Creators: vetted ${vetted}/${creatorTargets.length} (owner setCreatorApproval)`);

  console.log("\nSeed complete. Run a scenario, e.g.:");
  console.log(`  yarn workspace @covenant/loadtest actors --users ${cfg.users} --scenario ${cfg.scenario.name}`);
}

function encodeTransfer(to: `0x${string}`, amount: bigint): `0x${string}` {
  // transfer(address,uint256) selector = 0xa9059cbb
  return `0xa9059cbb${to.slice(2).toLowerCase().padStart(64, "0")}${amount
    .toString(16)
    .padStart(64, "0")}` as `0x${string}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
