# Covenant deployment next steps

Last updated: July 3, 2026

This document is the short, practical handoff for the next deployment phase.

## Current status

We already fixed the frontend so it no longer tries to send USDC-style writes to the old Base Mainnet Covenant deployment.

Right now:

- the checked-in Solidity contract is the newer USDC-based Covenant;
- the live Base Mainnet contract address in `packages/nextjs/contracts/deployedContracts.json` still points to an older ETH-style deployment;
- the frontend now detects that mismatch and disables create, donate, and proof submission on that legacy deployment instead of letting users hit a broken transaction flow.

That means the app is safer than before, but Base Mainnet is still not fully ready for production USDC usage until we redeploy and repoint it.

## Highest-priority blocker

We need a fresh Base Mainnet deployment of the current USDC Covenant contract and then need to update the frontend deployment metadata to point at it.

Until that happens, Base Mainnet should be treated as read-only for the current frontend.

## Deployment plan

### 1. Deploy the current USDC Covenant contract to Base Mainnet

Goal:

- make Base use the same contract interface the frontend is now expecting.

Before deploying:

- confirm the Solidity contract in `packages/hardhat/contracts/Covenant.sol` is the intended production version;
- confirm USDC is the only fundraising asset;
- confirm ETH is only needed for gas;
- confirm milestone creation, donation, and evidence submission APIs are the final ones we want to support right now.

Deployment outcome we need:

- a new Base Mainnet Covenant contract address;
- the deployment block number;
- the verified ABI for that exact deployment.

### 2. Update deployment metadata in the frontend

After redeploying:

- update `packages/nextjs/contracts/deployedContracts.json`;
- make sure chain `8453` points to the new USDC deployment address and ABI;
- remove any stale ABI assumptions that still describe the old payable `donate(uint256)` ETH flow.

This step is what reconnects the live frontend to a working write path.

### 3. Run a full Base Mainnet smoke test

Use real but tiny amounts.

We should test the full happy path:

1. creator creates a campaign;
2. donor approves USDC;
3. donor donates USDC to a campaign;
4. creator submits milestone proof;
5. milestone release happens correctly;
6. transaction feedback in the UI still behaves correctly.

We should also test the failure cases:

- wallet on wrong network;
- no USDC allowance;
- insufficient USDC balance;
- malformed evidence URL;
- proof submission before milestone funding;
- non-creator trying to submit proof.

### 4. Confirm frontend production environment settings

Before the next public deployment, verify:

- `NEXT_PUBLIC_DEFAULT_CHAIN_ID=8453`
- Base RPC configuration is stable and not relying on a fragile public endpoint if avoidable
- WalletConnect configuration is present if mobile wallets matter for demo or production use

Also confirm the app copy still consistently communicates:

- USDC is the fundraising asset
- ETH is only for gas

### 5. Redeploy the frontend

Once the new Base deployment metadata is committed:

- push the code;
- trigger the production frontend deploy;
- verify the live site is reading the correct Base contract.

After deploy, test on the real public URL rather than only localhost.

## Product/security next steps after deployment

These are not the main deployment blocker, but they should be next in line after the Base USDC redeploy.

### A. Tighten milestone proof quality

Right now the product direction is moving toward:

- required accomplishment description;
- required evidence URL;
- optional social-post helper workflow;
- on-chain submission using the evidence URL instead of free-form proof text.

That improves accountability, but it does not fully validate truthfulness yet.

Future hardening should focus on:

- stronger evidence standards;
- clearer proof expectations per milestone;
- distinguishing social visibility from actual verification.

### B. Decide how legacy Base data should be handled

Because the old Base contract used a different ETH-based flow, we should decide explicitly whether to:

- leave it as historical legacy data only;
- show it in a separate legacy mode;
- or fully move users to the new USDC deployment and stop surfacing the old one in normal product flows.

This should be a product decision, not an accidental side effect.

### C. Add a production launch checklist

Before broader usage, we should have a simple go-live checklist covering:

- contract address verified;
- ABI verified;
- chain ID verified;
- USDC token address verified;
- RPC health checked;
- create/donate/proof flow tested;
- error banners tested;
- wallet switching tested;
- mobile wallet path tested.

## What we are intentionally not doing yet

These are out of scope for the immediate deployment step:

- AWS infrastructure changes;
- OAuth or automatic posting to LinkedIn or Farcaster;
- file uploads;
- database changes for proof handling;
- smart-contract redesign beyond aligning Base with the current USDC contract.

## Recommended execution order

If we want the fastest path to a clean production state, the order should be:

1. deploy the current USDC Covenant contract to Base Mainnet;
2. update `deployedContracts.json` with the new Base deployment;
3. run the Base smoke test end-to-end;
4. redeploy the frontend;
5. then continue with proof UX and verification hardening.

## Bottom line

The biggest remaining deployment issue is no longer the frontend code itself.

The biggest issue is that Base Mainnet still points at the wrong contract generation.

Once we replace that legacy ETH deployment with the current USDC deployment and repoint the frontend, the application can finally operate on Base the way Covenant is supposed to: USDC for fundraising, ETH only for gas.
