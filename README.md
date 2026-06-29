# Covenant

Milestone-based crowdfunding with enforced accountability on Ethereum.

Donations stay locked in a smart contract escrow until campaign creators submit evidence and donors approve each milestone. Every donation, evidence update, approval, and fund release is part of a permanent public record on-chain.

**Live app:** Update this link after assigning the Covenant deployment domain.
**Contract on Base Mainnet:** `0x000f8e23a416396184Cd97fF9dD750F3753F4C0c`

---

## The Problem

Traditional crowdfunding platforms like GoFundMe rely on trust. Once money moves, donors have no enforceable way to verify how it is used. Updates are optional. The platform holds the funds, not you.

Covenant changes the money flow:

1. **Donate** — ETH goes into smart contract escrow, not the creator's wallet
2. **Evidence** — Creator submits proof for the current milestone (URL, IPFS link, or text)
3. **Approve** — Donors vote to approve the milestone, weighted by donation amount
4. **Release** — Once 50% approval is reached, the exact milestone amount is released to the creator

The rest stays locked for future milestones.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity + Hardhat |
| Frontend | Next.js + TypeScript |
| Wallet connection | RainbowKit + wagmi + viem |
| Network | Base Mainnet (Ethereum L2) |
| Deployment | Vercel |
| Base framework | Scaffold-ETH 2 |

---

## Project Structure

```
covenant/
├── packages/
│   ├── hardhat/              # Smart contract, tests, deploy scripts
│   │   ├── contracts/
│   │   │   └── Covenant.sol
│   │   ├── scripts/
│   │   │   └── seed.ts
│   │   └── test/
│   └── nextjs/               # Frontend app
│       ├── app/              # Next.js pages
│       ├── components/       # UI components
│       ├── contracts/
│       │   └── deployedContracts.json   # Contract address + ABI
│       └── hooks/            # Contract interaction hooks
```

---

## Local Development

**Prerequisites:** Node.js 18+, Yarn, MetaMask

```bash
# Install dependencies
yarn install

# Start a local blockchain
yarn chain

# Deploy the contract locally (separate terminal)
yarn deploy

# Start the frontend (separate terminal)
yarn start
```

Open [http://localhost:3000](http://localhost:3000) and connect MetaMask to `localhost:8545`.

---

## Deploy to Base Mainnet

1. Create `packages/hardhat/.env`:

```
DEPLOYER_PRIVATE_KEY=0x<your_key>
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<your_key>
```

2. Deploy:

```bash
yarn deploy:base
```

3. Commit the updated `deployedContracts.json` and push — Vercel builds from the repo.

```bash
git add packages/nextjs/contracts/deployedContracts.json
git commit -m "deploy Covenant to Base Mainnet"
git push
```

---

## Environment Variables (Vercel)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_DEFAULT_CHAIN_ID` | `8453` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | from [cloud.walletconnect.com](https://cloud.walletconnect.com) |
| `NEXT_PUBLIC_BASE_RPC_URL` | your dedicated Base RPC URL |

---

## How the Smart Contract Works

The `Covenant.sol` contract stores everything on-chain:

- **Campaigns** — title, description, goal, raised amount, milestone list, creator address
- **Milestones** — description, amount, evidence string, approval weight, release status
- **Donations** — how much each donor gave to each campaign
- **Reputation** — each creator's history: campaigns completed, funds raised, milestones delivered

**Core functions:**

| Function | Who calls it | What it does |
|---|---|---|
| `createCampaign` | Creator | Creates a campaign with milestones |
| `donate` | Donor | Sends ETH into escrow |
| `submitEvidence` | Creator | Submits proof for current milestone |
| `approveMilestone` | Donor | Approves milestone (weighted by donation) |
| `releaseMilestoneFunds` | Anyone | Releases funds once 50% approval is reached |

---

## Safety

This contract holds real ETH on Base Mainnet. For demos and testing, use small amounts only (0.0001–0.0005 ETH). The same contract architecture can be redeployed to Ethereum Mainnet without changes.
