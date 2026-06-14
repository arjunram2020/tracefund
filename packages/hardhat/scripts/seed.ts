import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seeds the demo campaign (PRD §15-16) against an already-deployed TraceFund.
 *
 * It creates "Community Medical Relief Fund", then donates from two donors,
 * leaving milestone one waiting for evidence — exactly the pre-demo state.
 *
 * Run AFTER `yarn deploy` on the same network:
 *   yarn seed
 *
 * Accounts:
 *   - Local Hardhat node: the first three unlocked accounts act as creator,
 *     donor A and donor B automatically.
 *   - Public networks (e.g. Base): only the deployer signer exists, so set
 *     DONOR_A_KEY and DONOR_B_KEY in packages/hardhat/.env. Each must hold a
 *     little ETH for gas + its donation.
 *
 * Amounts are intentionally tiny (PRD §9 safety rule) because Base / Ethereum
 * mainnet use REAL ETH. Adjust the constants below if needed.
 */

// ETH amounts — tiny on purpose for real-money networks.
const MILESTONE_AMOUNTS = ["0.0002", "0.0001", "0.0001"]; // goal = 0.0004 ETH
const DONATION_A = "0.0002";
const DONATION_B = "0.0002";

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  const address = readDeployedAddress(chainId);
  if (!address) {
    throw new Error(
      `No deployed TraceFund found for chainId ${chainId}. Run \`yarn deploy\` first.`,
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
        "DONOR_B_KEY in packages/hardhat/.env, each funded with a little ETH for gas + donation.",
    );
  }

  const traceFund = await ethers.getContractAt("TraceFund", address);

  const goal = MILESTONE_AMOUNTS.reduce((sum, v) => sum + Number(v), 0);
  console.log(`Seeding demo campaign on chainId ${chainId} at ${address}`);
  console.log(`  creator: ${creator.address}`);
  console.log(`  donorA:  ${donorA.address}`);
  console.log(`  donorB:  ${donorB.address}\n`);

  const tx = await traceFund
    .connect(creator)
    .createCampaign(
      "Community Medical Relief Fund",
      "A transparent emergency fundraiser where donations unlock only after milestone proof is submitted and donors approve the release.",
      [
        "Hospital deposit receipt",
        "Medication purchase receipt",
        "Follow-up appointment confirmation",
      ],
      MILESTONE_AMOUNTS.map((a) => ethers.parseEther(a)),
    );
  const receipt = await tx.wait();

  // Derive the new campaign id from the emitted event.
  const created = receipt!.logs
    .map((l) => {
      try {
        return traceFund.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "CampaignCreated");
  const campaignId = created ? created.args[0] : 0n;
  console.log(`Created campaign #${campaignId} (goal ${goal} ETH)`);

  await (await traceFund.connect(donorA).donate(campaignId, { value: ethers.parseEther(DONATION_A) })).wait();
  console.log(`Donor A donated ${DONATION_A} ETH`);

  await (await traceFund.connect(donorB).donate(campaignId, { value: ethers.parseEther(DONATION_B) })).wait();
  console.log(`Donor B donated ${DONATION_B} ETH`);

  console.log(`\nDemo ready: milestone one is funded and waiting for evidence.`);
}

/** Build a signer from a private key in the environment, connected to the provider. */
function walletFromEnv(name: string): ethers.Wallet | undefined {
  const key = process.env[name];
  if (!key) return undefined;
  return new ethers.Wallet(key.startsWith("0x") ? key : `0x${key}`, ethers.provider);
}

function readDeployedAddress(chainId: number): string | undefined {
  const file = path.resolve(__dirname, "../../nextjs/contracts/deployedContracts.json");
  if (!fs.existsSync(file)) return undefined;
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    return json?.[chainId]?.TraceFund?.address;
  } catch {
    return undefined;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
