import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seeds the demo campaign (PRD §15-16) against an already-deployed Covenant.
 *
 * It creates "Community Medical Relief Fund", then donates from two donors,
 * leaving milestone one waiting for evidence — exactly the pre-demo state.
 *
 * Run AFTER `yarn deploy` on the same network:
 *   yarn seed
 *
 * Accounts:
 *   - Local Hardhat node: the first three unlocked accounts act as creator,
 *     donor A and donor B automatically. MockUSDC is minted to the donors.
 *   - Public networks (e.g. Base): only the deployer signer exists, so set
 *     DONOR_A_KEY and DONOR_B_KEY in packages/hardhat/.env. Each must hold a
 *     little ETH for gas plus enough real USDC for its donation.
 *
 * Amounts are intentionally tiny (PRD §9 safety rule) because Base uses REAL
 * USDC. Adjust the constants below if needed.
 */

// All amounts are USDC (6 decimals) — tiny on purpose for real-money networks.
const usdc6 = (v: string) => ethers.parseUnits(v, 6);

const MILESTONE_AMOUNTS = ["0.2", "0.1", "0.1"]; // goal = 0.4 USDC
// The running total may never exceed the 0.4 goal. Donor A donates twice so
// the campaign still reaches the full goal from two distinct donor addresses.
const DONATION_A1 = "0.15"; // donor A, first donation
const DONATION_B = "0.15"; //  donor B
const DONATION_A2 = "0.1"; //  donor A, second donation — brings total to the 0.4 goal

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  const { covenantAddress, usdcAddress } = readDeployment(chainId);
  if (!covenantAddress || !usdcAddress) {
    throw new Error(
      `No deployed Covenant + USDC found for chainId ${chainId}. Run \`yarn deploy\` first.`,
    );
  }

  const signers = await ethers.getSigners();
  const creator = signers[0];
  if (!creator) {
    throw new Error("No signer available. Set DEPLOYER_PRIVATE_KEY in packages/hardhat/.env.");
  }

  // On a public network only the deployer signer exists, so fall back to the
  // donor keys from the environment.
  const donorA = signers[1] ?? walletFromEnv("DONOR_A_KEY");
  const donorB = signers[2] ?? walletFromEnv("DONOR_B_KEY");
  if (!donorA || !donorB) {
    throw new Error(
      "Need creator + 2 donors. On a public network (e.g. Base) set DONOR_A_KEY and " +
        "DONOR_B_KEY in packages/hardhat/.env, each funded with a little ETH for gas " +
        "plus enough USDC for its donation.",
    );
  }

  const covenant = await ethers.getContractAt("Covenant", covenantAddress);
  // MockUSDC's ABI is a superset of the ERC-20 interface, so it also works
  // against canonical USDC on public networks (mint is only called locally).
  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);

  const isLocal = chainId === 31337;

  const goal = MILESTONE_AMOUNTS.reduce((sum, v) => sum + Number(v), 0);
  console.log(`Seeding demo campaign on chainId ${chainId} at ${covenantAddress}`);
  console.log(`  USDC:    ${usdcAddress}${isLocal ? " (MockUSDC)" : ""}`);
  console.log(`  creator: ${creator.address}`);
  console.log(`  donorA:  ${donorA.address}`);
  console.log(`  donorB:  ${donorB.address}\n`);

  // Locally, mint each donor plenty of MockUSDC. On public networks the donors
  // must already hold real USDC.
  if (isLocal) {
    await (await usdc.mint(donorA.address, usdc6("1000"))).wait();
    await (await usdc.mint(donorB.address, usdc6("1000"))).wait();
    console.log("Minted 1000 MockUSDC to each donor");
  }

  const tx = await covenant
    .connect(creator)
    .createCampaign(
      "Community Medical Relief Fund",
      "A transparent emergency fundraiser where each milestone's funds unlock only after the creator posts on-chain proof.",
      [
        "Hospital deposit receipt",
        "Medication purchase receipt",
        "Follow-up appointment confirmation",
      ],
      MILESTONE_AMOUNTS.map((a) => usdc6(a)),
    );
  const receipt = await tx.wait();

  // Derive the new campaign id from the emitted event.
  const created = receipt!.logs
    .map((l) => {
      try {
        return covenant.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "CampaignCreated");
  const campaignId = created ? created.args[0] : 0n;
  console.log(`Created campaign #${campaignId} (goal ${goal} USDC)`);

  // Each donor approves its full donation total once, then donates.
  await (
    await usdc.connect(donorA).approve(covenantAddress, usdc6(DONATION_A1) + usdc6(DONATION_A2))
  ).wait();
  await (await usdc.connect(donorB).approve(covenantAddress, usdc6(DONATION_B))).wait();
  console.log("Donors approved the Covenant escrow to pull their USDC");

  await (await covenant.connect(donorA).donate(campaignId, usdc6(DONATION_A1))).wait();
  console.log(`Donor A donated ${DONATION_A1} USDC`);

  await (await covenant.connect(donorB).donate(campaignId, usdc6(DONATION_B))).wait();
  console.log(`Donor B donated ${DONATION_B} USDC`);

  await (await covenant.connect(donorA).donate(campaignId, usdc6(DONATION_A2))).wait();
  console.log(`Donor A donated ${DONATION_A2} USDC (total now at the ${goal} USDC goal)`);

  console.log(`\nDemo ready: milestone one is funded and waiting for evidence.`);
}

/** Build a signer from a private key in the environment, connected to the provider. */
function walletFromEnv(name: string): ethers.Wallet | undefined {
  const key = process.env[name];
  if (!key) return undefined;
  return new ethers.Wallet(key.startsWith("0x") ? key : `0x${key}`, ethers.provider);
}

function readDeployment(chainId: number): {
  covenantAddress?: string;
  usdcAddress?: string;
} {
  const file = path.resolve(__dirname, "../../nextjs/contracts/deployedContracts.json");
  if (!fs.existsSync(file)) return {};
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      covenantAddress: json?.[chainId]?.Covenant?.address,
      usdcAddress: json?.[chainId]?.USDC?.address,
    };
  } catch {
    return {};
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
