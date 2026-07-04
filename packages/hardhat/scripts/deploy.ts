import { artifacts, ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys Covenant and exports its address + ABI to the Next.js frontend so the
 * web app can read/write the contract without any manual copy-paste.
 *
 * Covenant settles in USDC. On public networks we point at the canonical USDC
 * token; on a local chain we deploy MockUSDC (6 decimals, open mint) instead.
 *
 * Usage:
 *   yarn deploy                  # localhost
 *   yarn deploy:baseSepolia      # Base Sepolia testnet
 *   yarn deploy:base             # Base Mainnet (real USDC — use tiny amounts)
 */

// Canonical USDC addresses per chain. Anything not listed gets a MockUSDC.
// Source: Circle / Superchain token list. Verify against
// https://developers.circle.com/stablecoins/usdc-on-main-networks before editing.
const USDC_ADDRESSES: Record<number, string> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet (native USDC)
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia (Circle testnet USDC)
};

/**
 * The token address is immutable in Covenant, so a wrong constant above bricks
 * the whole deployment (every donate()/release reverts against an address with
 * no code). Refuse to deploy unless the address hosts a 6-decimal USDC token
 * on the target network.
 */
async function assertLooksLikeUsdc(address: string) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(
      `No contract bytecode at USDC address ${address} on this network — refusing to deploy Covenant against it.`,
    );
  }
  const erc20 = new ethers.Contract(
    address,
    ["function symbol() view returns (string)", "function decimals() view returns (uint8)"],
    ethers.provider,
  );
  const [symbol, decimals] = await Promise.all([erc20.symbol(), erc20.decimals()]);
  if (Number(decimals) !== 6 || !String(symbol).toUpperCase().includes("USDC")) {
    throw new Error(
      `Token at ${address} reports symbol=${symbol}, decimals=${decimals}; expected USDC with 6 decimals — refusing to deploy.`,
    );
  }
  console.log(`  verified USDC: symbol=${symbol}, decimals=${decimals}, bytecode present`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  console.log(`\nDeploying Covenant`);
  console.log(`  network:  ${network.name} (chainId ${chainId})`);
  console.log(`  deployer: ${deployer.address}`);
  console.log(`  balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // Resolve the USDC token: canonical on public networks, MockUSDC locally.
  let usdcAddress = USDC_ADDRESSES[chainId];
  if (usdcAddress) {
    console.log(`Using canonical USDC at ${usdcAddress}`);
    await assertLooksLikeUsdc(usdcAddress);
  } else {
    const MockFactory = await ethers.getContractFactory("MockUSDC");
    const mock = await MockFactory.deploy();
    await mock.waitForDeployment();
    usdcAddress = await mock.getAddress();
    console.log(`Deployed MockUSDC to ${usdcAddress}`);
  }

  const Factory = await ethers.getContractFactory("Covenant");
  const covenant = await Factory.deploy(usdcAddress);
  await covenant.waitForDeployment();
  const address = await covenant.getAddress();

  // Record the deployment block so the frontend activity feed only scans from here.
  const receipt = await covenant.deploymentTransaction()?.wait();
  const deployBlock = receipt?.blockNumber ?? 0;

  console.log(`Covenant deployed to: ${address} (block ${deployBlock})`);

  // Post-deploy verification: the immutable token baked into the contract
  // must be exactly the address we validated above, and the contract itself
  // must have bytecode. Fail loudly rather than exporting a broken config.
  // Public RPCs are load-balanced and a node may lag the deployment by a few
  // seconds, so retry stale reads before concluding anything is wrong.
  let verified = false;
  for (let attempt = 1; attempt <= 6 && !verified; attempt++) {
    try {
      const covenantCode = await ethers.provider.getCode(address);
      if (covenantCode === "0x") throw new Error("no bytecode yet");
      const onChainUsdc = await covenant.usdc();
      if (onChainUsdc.toLowerCase() !== usdcAddress.toLowerCase()) {
        // A real mismatch, not propagation lag — abort immediately.
        throw new Error(
          `FATAL: deployed Covenant reports usdc()=${onChainUsdc}, expected ${usdcAddress}`,
        );
      }
      verified = true;
    } catch (err: any) {
      if (String(err?.message).startsWith("FATAL")) throw err;
      if (attempt === 6) {
        throw new Error(
          `Could not verify the deployment after ${attempt} attempts (${err?.shortMessage ?? err?.message}) — aborting export.`,
        );
      }
      console.log(`  verification read not propagated yet (attempt ${attempt}) — retrying…`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.log(`  verified on-chain: usdc() matches, Covenant bytecode present`);

  await exportToFrontend(chainId, address, deployBlock, usdcAddress);
  verifyExport(chainId, address, usdcAddress);

  console.log(`\nDone. Frontend contract config updated for chainId ${chainId}.\n`);
}

/**
 * Read the exported frontend config back and confirm it matches what was
 * actually deployed — the frontend must never point at a different contract
 * or token than the chain has.
 */
function verifyExport(chainId: number, address: string, usdcAddress: string) {
  const outFile = path.resolve(__dirname, "../../nextjs/contracts/deployedContracts.json");
  const json = JSON.parse(fs.readFileSync(outFile, "utf8"));
  const entry = json?.[chainId];
  if (
    entry?.Covenant?.address !== address ||
    entry?.USDC?.address !== usdcAddress ||
    !Array.isArray(entry?.Covenant?.abi)
  ) {
    throw new Error(
      `Exported frontend config for chainId ${chainId} does not match the deployment — fix before shipping.`,
    );
  }
  const abiNames = new Set(
    entry.Covenant.abi.filter((f: any) => f.type === "function").map((f: any) => f.name),
  );
  for (const fn of ["submitProof", "reviewProof", "claimRefund", "failCampaign"]) {
    if (!abiNames.has(fn)) {
      throw new Error(`Exported ABI is missing ${fn}() — stale artifact? Recompile and redeploy.`);
    }
  }
  console.log(`  verified export: frontend config matches deployed contract + token`);
}

/**
 * Writes the deployment into packages/nextjs/contracts/deployedContracts.json,
 * merging with any existing entries so multiple networks can coexist.
 */
async function exportToFrontend(
  chainId: number,
  address: string,
  deployBlock: number,
  usdcAddress: string,
) {
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
    USDC: {
      address: usdcAddress,
    },
  };

  fs.writeFileSync(outFile, JSON.stringify(existing, null, 2));
  console.log(`Exported ABI + addresses -> ${path.relative(process.cwd(), outFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
