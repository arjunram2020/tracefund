import { artifacts, ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys Covenant and exports its address + ABI to the Next.js frontend so the
 * web app can read/write the contract without any manual copy-paste.
 *
 * Usage:
 *   yarn deploy                  # localhost
 *   yarn deploy:baseSepolia      # Base Sepolia testnet
 *   yarn deploy:base             # Base Mainnet (real ETH — use tiny amounts)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  console.log(`\nDeploying Covenant`);
  console.log(`  network:  ${network.name} (chainId ${chainId})`);
  console.log(`  deployer: ${deployer.address}`);
  console.log(`  balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  const Factory = await ethers.getContractFactory("Covenant");
  const covenant = await Factory.deploy();
  await covenant.waitForDeployment();
  const address = await covenant.getAddress();

  // Record the deployment block so the frontend activity feed only scans from here.
  const receipt = await covenant.deploymentTransaction()?.wait();
  const deployBlock = receipt?.blockNumber ?? 0;

  console.log(`Covenant deployed to: ${address} (block ${deployBlock})`);

  await exportToFrontend(chainId, address, deployBlock);

  console.log(`\nDone. Frontend contract config updated for chainId ${chainId}.\n`);
}

/**
 * Writes the deployment into packages/nextjs/contracts/deployedContracts.json,
 * merging with any existing entries so multiple networks can coexist.
 */
async function exportToFrontend(chainId: number, address: string, deployBlock: number) {
  const artifact = await artifacts.readArtifact("Covenant");
  const outDir = path.resolve(__dirname, "../../nextjs/contracts");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, "deployedContracts.json");
  let existing: Record<string, any> = {};
  if (fs.existsSync(outFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(outFile, "utf8"));
    } catch {
      existing = {};
    }
  }

  existing[chainId] = {
    Covenant: {
      address,
      deployBlock,
      abi: artifact.abi,
    },
  };

  fs.writeFileSync(outFile, JSON.stringify(existing, null, 2));
  console.log(`Exported ABI + address -> ${path.relative(process.cwd(), outFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
