import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Approve (or revoke) a creator on the deployed Covenant, lifting the
 * per-address anti-spam limits (FREE_CAMPAIGNS lifetime cap + daily cooldown).
 *
 * Must be run by the contract OWNER — the wallet that deployed it (locally
 * that's Hardhat account #0; on Base it's DEPLOYER_PRIVATE_KEY from .env).
 *
 * Usage:
 *   CREATOR=0xabc... yarn hardhat run scripts/approve.ts --network localhost
 *   CREATOR=0xabc... yarn hardhat run scripts/approve.ts --network base
 *   CREATOR=0xabc... REVOKE=1 yarn hardhat run scripts/approve.ts --network base
 *
 * Approve several at once with a comma-separated list:
 *   CREATOR=0xabc...,0xdef... yarn hardhat run scripts/approve.ts --network localhost
 */
async function main() {
  const raw = process.env.CREATOR;
  if (!raw) {
    throw new Error(
      "Set CREATOR to the address (or comma-separated addresses) to approve, e.g.\n" +
        "  CREATOR=0xabc... yarn hardhat run scripts/approve.ts --network localhost",
    );
  }
  const approved = process.env.REVOKE !== "1";

  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const address = readDeployedAddress(chainId);
  if (!address) {
    throw new Error(`No deployed Covenant found for chainId ${chainId}. Run \`yarn deploy\` first.`);
  }

  const [owner] = await ethers.getSigners();
  const covenant = await ethers.getContractAt("Covenant", address);

  const contractOwner = await covenant.owner();
  if (contractOwner.toLowerCase() !== owner.address.toLowerCase()) {
    throw new Error(
      `Signer ${owner.address} is not the contract owner (${contractOwner}). ` +
        "Run with the deployer key that deployed this Covenant.",
    );
  }

  for (const entry of raw.split(",")) {
    const creator = ethers.getAddress(entry.trim()); // checksums + validates
    const tx = await covenant.connect(owner).setCreatorApproval(creator, approved);
    await tx.wait();
    console.log(`${approved ? "Approved" : "Revoked"} creator ${creator} on chainId ${chainId}`);
  }
}

function readDeployedAddress(chainId: number): string | undefined {
  const file = path.resolve(__dirname, "../../nextjs/contracts/deployedContracts.json");
  if (!fs.existsSync(file)) return undefined;
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    return json?.[chainId]?.Covenant?.address;
  } catch {
    return undefined;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
