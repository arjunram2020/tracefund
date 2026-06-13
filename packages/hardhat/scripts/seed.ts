import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seeds the demo campaign (PRD §15-16) against an already-deployed TraceFund.
 *
 * It creates "Community Medical Relief Fund", then donates from two donors,
 * leaving milestone one waiting for evidence — exactly the pre-demo state.
 *
 * Run AFTER `yarn deploy` on the same (local) network:
 *   yarn seed
 *
 * On the local Hardhat node the first three unlocked accounts act as
 * creator, donor A and donor B.
 */
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
  const [creator, donorA, donorB] = signers;
  if (!donorA || !donorB) {
    throw new Error("Need at least 3 accounts to seed the demo (creator + 2 donors).");
  }

  const traceFund = await ethers.getContractAt("TraceFund", address);

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
      [
        ethers.parseEther("0.02"),
        ethers.parseEther("0.015"),
        ethers.parseEther("0.015"),
      ],
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
  console.log(`Created campaign #${campaignId} (goal 0.05 ETH)`);

  await (await traceFund.connect(donorA).donate(campaignId, { value: ethers.parseEther("0.02") })).wait();
  console.log(`Donor A donated 0.02 ETH`);

  await (await traceFund.connect(donorB).donate(campaignId, { value: ethers.parseEther("0.03") })).wait();
  console.log(`Donor B donated 0.03 ETH`);

  console.log(`\nDemo ready: milestone one is funded and waiting for evidence.`);
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
