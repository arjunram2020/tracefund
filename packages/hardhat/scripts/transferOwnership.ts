import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Transfer Covenant ownership to a new address — intended for moving from a
 * single deployer EOA to a multisig (e.g. a Gnosis Safe), per M2 in
 * docs/CONTRACT_SECURITY_REVIEW.md. This is a TOOLING script: it does not run
 * automatically and does not touch the live contract unless you explicitly
 * invoke it with --network base and CONFIRM=yes.
 *
 * The owner's powers are narrow (setCreatorApproval, pause/unpause, and
 * acting as reviewer for PlatformOperator campaigns) and it can NEVER move or
 * seize escrow — but a compromised or lost single-EOA owner can still
 * rubber-stamp PlatformOperator releases or brick pause/unpause. Moving to a
 * multisig turns "one key's security" into "N-of-M people must agree."
 *
 * Safety checks performed before sending the transaction:
 *   - the signer is actually the current owner (fails loudly otherwise);
 *   - NEW_OWNER is not the zero address (Ownable would otherwise renounce
 *     ownership permanently instead of transferring it);
 *   - NEW_OWNER is not the same as the current owner (no-op guard);
 *   - warns (does not block) if NEW_OWNER has no deployed bytecode — i.e.
 *     looks like a plain EOA rather than a Safe/multisig contract, since
 *     that's usually not the intent of running this script.
 * Requires CONFIRM=yes so this can never fire from a copy-pasted command
 * missing the flag.
 *
 * IMPORTANT — read before running against Base mainnet:
 *   Ownable's transferOwnership takes effect immediately and there is no
 *   on-chain undo except the new owner transferring it back. Verify NEW_OWNER
 *   on Basescan (or your Safe UI) before running with --network base.
 *
 * Usage:
 *   NEW_OWNER=0xSafeAddress... CONFIRM=yes yarn hardhat run scripts/transferOwnership.ts --network base
 *   NEW_OWNER=0xSafeAddress... CONFIRM=yes yarn hardhat run scripts/transferOwnership.ts --network localhost
 */
async function main() {
  const newOwnerRaw = process.env.NEW_OWNER;
  if (!newOwnerRaw) {
    throw new Error(
      "Set NEW_OWNER to the address to transfer ownership to, e.g.\n" +
        "  NEW_OWNER=0xSafeAddress... CONFIRM=yes yarn hardhat run scripts/transferOwnership.ts --network base",
    );
  }
  if (process.env.CONFIRM !== "yes") {
    throw new Error(
      "Refusing to run without CONFIRM=yes — this changes who controls Covenant. " +
        "Re-run with CONFIRM=yes once you've verified NEW_OWNER is correct.",
    );
  }

  const newOwner = ethers.getAddress(newOwnerRaw.trim()); // checksums + validates
  if (newOwner === ethers.ZeroAddress) {
    throw new Error(
      "NEW_OWNER is the zero address — Ownable.transferOwnership(0x0) PERMANENTLY " +
        "renounces ownership (nobody can ever call owner-only functions again, " +
        "including pause/unpause and PlatformOperator reviews). Refusing.",
    );
  }

  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const address = readDeployedAddress(chainId);
  if (!address) {
    throw new Error(`No deployed Covenant found for chainId ${chainId}. Run \`yarn deploy\` first.`);
  }

  const [signer] = await ethers.getSigners();
  const covenant = await ethers.getContractAt("Covenant", address);

  const currentOwner = await covenant.owner();
  if (currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer ${signer.address} is not the contract owner (${currentOwner}). ` +
        "Run with the deployer key that currently owns this Covenant.",
    );
  }
  if (newOwner.toLowerCase() === currentOwner.toLowerCase()) {
    throw new Error(`NEW_OWNER is already the current owner (${currentOwner}) — nothing to do.`);
  }

  const newOwnerCode = await ethers.provider.getCode(newOwner);
  if (newOwnerCode === "0x") {
    console.warn(
      `WARNING: NEW_OWNER (${newOwner}) has no deployed bytecode — it looks like a plain ` +
        "EOA, not a Safe/multisig contract. If you intended to move to a multisig, double-check " +
        "the address before proceeding. Continuing in 5s (Ctrl+C to abort)...",
    );
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log(`Transferring ownership of Covenant (${address}) on chainId ${chainId}`);
  console.log(`  from: ${currentOwner}`);
  console.log(`  to:   ${newOwner}`);
  const tx = await covenant.connect(signer).transferOwnership(newOwner);
  console.log(`  tx:   ${tx.hash}`);
  await tx.wait();

  const confirmedOwner = await covenant.owner();
  if (confirmedOwner.toLowerCase() !== newOwner.toLowerCase()) {
    throw new Error(
      `Post-transfer check failed: owner() reports ${confirmedOwner}, expected ${newOwner}.`,
    );
  }
  console.log(`Done. Covenant.owner() is now ${confirmedOwner}.`);
  console.log(
    "Remember to update any deploy records / SECURITY_POLICIES.md access notes to reflect the new owner.",
  );
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
