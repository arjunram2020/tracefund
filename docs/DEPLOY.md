# Two-device demo — Base Mainnet + Vercel

Goal: two separate devices open the same hosted app and edit the **same**
campaigns. That works because campaign state lives on-chain — so both devices
just need to point at the same contract (on Base Mainnet) and load the same
frontend (on Vercel).

> Base Mainnet uses **real ETH**. Use tiny amounts only (0.0001–0.0005 ETH),
> exactly as the PRD's safety rule says.

The code is already wired for this. What's left is operational: deploy the
contract, then host the frontend.

---

## 1. Deploy the contract to Base Mainnet

You need a deployer wallet with a little real ETH on Base (~0.01 ETH covers
deploy + the seed donations).

1. Create `packages/hardhat/.env`:

   ```
   DEPLOYER_PRIVATE_KEY=0x<your_deployer_key>
   # optional, recommended — a dedicated RPC is more reliable than the public one:
   BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<key>
   ```

2. Deploy:

   ```
   yarn deploy:base
   ```

   This prints the contract address and **auto-merges an `"8453"` entry into**
   `packages/nextjs/contracts/deployedContracts.json` (address, ABI, deploy
   block).

3. (Optional) Seed the demo campaign on Base.

   `scripts/seed.ts` already uses tiny amounts (0.0002 / 0.0001 / 0.0001 ETH
   milestones = 0.0004 ETH goal, with two 0.0002 ETH donations). Edit the
   `MILESTONE_AMOUNTS` / `DONATION_A` / `DONATION_B` constants at the top of the
   file if you want different values.

   On a public network the deployer is the only signer, so the two donors come
   from env keys. Add to `packages/hardhat/.env`:

   ```
   DONOR_A_KEY=0x<donor_a_key>
   DONOR_B_KEY=0x<donor_b_key>
   ```

   Each donor address needs a little Base ETH for gas + its donation. Then:

   ```
   yarn seed
   ```

   If you'd rather not manage extra keys, skip seeding and **create + donate
   live from the UI** with separate wallets.

4. **Commit the updated `deployedContracts.json`** and push — Vercel builds from
   the repo, so the Base deployment must be committed:

   ```
   git add packages/nextjs/contracts/deployedContracts.json && git commit -m "deploy Covenant to Base Mainnet" && git push
   ```

---

## 2. Host the frontend on Vercel

A root `vercel.json` is already committed with the monorepo build settings
(install at the workspace root, build the `@covenant/nextjs` workspace).

1. Import the repo at https://vercel.com/new. Leave **Root Directory** as the
   repository root (the committed `vercel.json` handles the rest).

2. Set these **Environment Variables** in the Vercel project (Settings → 
   Environment Variables), for Production:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_DEFAULT_CHAIN_ID` | `8453` |
   | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | a real id from https://cloud.walletconnect.com |
   | `NEXT_PUBLIC_BASE_RPC_URL` | (recommended) a dedicated Base RPC URL |

   `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is **required** if the second device is
   a phone connecting via QR / WalletConnect. A second laptop with the MetaMask
   extension works without it.

3. Deploy. You get a public URL (e.g. `https://covenant.vercel.app`).

---

## 3. Run the two-device demo

1. Both devices open the Vercel URL.
2. Each connects its own wallet (MetaMask extension, or MetaMask mobile / any
   WalletConnect wallet on a phone). Each wallet needs a little Base ETH to send
   transactions (donate / approve / release / submit evidence cost gas).
3. Both must be on **Base Mainnet**. If a wallet is on the wrong network, the
   app now prompts it to switch to Base automatically when it tries to write
   (see `useCovenantWrite` → `switchChainAsync`), and the connect button shows
   a "wrong network" switcher.
4. Device A creates/donates; Device B sees the same campaign and can donate,
   approve, or release. Every action is shared on-chain, so both stay in sync
   (reads auto-refresh after each confirmed transaction).

That's the whole point: there's no shared server holding campaign state — the
chain is the shared state, so any number of devices editing the same Base
contract see the same campaigns.

---

## What changed in the code to enable this

- `packages/nextjs/lib/wagmi.ts` — the configured default chain (Base) is listed
  first, and each chain's RPC is overridable via `NEXT_PUBLIC_*_RPC_URL` env vars
  so hosted reads don't depend on a rate-limited public endpoint.
- `packages/nextjs/hooks/useCovenant.ts` — writes now switch the wallet to the
  deployment chain first, so a device on the wrong network is guided to Base
  instead of failing with a chain-mismatch error.
- `packages/hardhat/scripts/seed.ts` — tiny, real-money-safe amounts, and donor
  accounts now come from `DONOR_A_KEY` / `DONOR_B_KEY` on public networks (the
  local Hardhat node still uses its built-in accounts automatically).
- `vercel.json` — monorepo build config for Vercel.
- `packages/nextjs/.env.local.example` / `packages/hardhat/.env.example` —
  document the production env vars and donor keys.
