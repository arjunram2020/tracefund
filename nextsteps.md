# Covenant deployment next steps

Last updated: July 3, 2026

This document is the short, practical handoff for the next deployment phase.

## Current status

Last verified: current session.

The USDC Base Mainnet deployment is already done:

- the checked-in Solidity contract is the USDC-based Covenant;
- `packages/nextjs/contracts/deployedContracts.json` for chain `8453` now points at the **USDC** deployment `0xe11CE961Ff378B5D5172DE6ABfE8c16f900e10F3` (deployBlock 48139854), whose ABI is the USDC generation (`donate(campaignId, amount)` non-payable, `constructor(usdc_)`, `submitEvidence`);
- that address was confirmed to have live bytecode on Base Mainnet;
- the 33-test hardhat suite passes against the current contract.

In other words, the "redeploy Base to USDC" step below is **already complete**. The frontend's legacy-detection safety net (disabling create/donate/proof on non-USDC deployments) is still in place, but for chain 8453 it now resolves to `active`, not `legacy`.

## Highest-priority remaining work

The deploy itself is no longer the blocker. What still hasn't happened:

1. an **end-to-end Base Mainnet smoke test** with tiny real USDC (create → approve → donate → submit proof → release), i.e. steps 3–5 below;
2. the **proof-verification design decision** (see "Product/security next steps" §A) — currently `submitEvidence` is creator-only and auto-releases on any non-empty string, with no verification and no failure/refund path;
3. **security debt**: a leaked Alchemy key remains in git history and baked into the EC2 `.env.local`; rotation is still pending, and the repo is public.

The two deployment steps below are retained for reference but are effectively done — treat them as a checklist to re-verify, not fresh work.

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

There are three distinct problems here, in priority order.

**A1. No verification, no failure path (contract-level, needs a product decision).**
`Covenant.sol::submitEvidence` is gated only by `msg.sender == creator` and a
non-empty evidence string, and it releases that milestone's funds in the *same*
transaction. Consequences:

- any string releases the money — donors have no approval role, so a fully
  funded campaign can be drained with junk proof in a few back-to-back txns;
- if a creator never submits proof, the USDC is locked in escrow **forever** —
  there is no timeout, refund, or admin unlock path in the contract.

Deciding who verifies proof (optimistic + challenge window, donor approval,
etc.) and whether to add a refund/timeout are product decisions that require
another contract redeploy. Do not implement unilaterally — see
`docs/COVENANT_RESEARCH_GAPS.md` §1–§2.

**A2. The accomplishment description is collected, required, then discarded (frontend bug).**
In `components/EvidencePanel.tsx` the creator must fill "What did you
accomplish?" (`canSubmit` requires `progress.trim().length > 0`), but only the
evidence URL is sent on-chain (`execute("submitEvidence", [id, evidenceUrl])`)
and `progress` is never persisted — it is not on-chain and not in the social
post (that's a separate `messages[platform]` textarea). The comment claiming
"the description lives in the social post" is false. Fix: either persist the
description on-chain with the evidence, or stop requiring it. Blocked on a
UX/data-format decision (the on-chain `evidence` field is a single string
rendered by `EvidenceLink`).

**A3. Evidence is unvalidated free text.**
The contract accepts any non-empty string; the frontend's `https://` requirement
is trivially bypassed by calling the contract directly, and a URL can 404 or
point anywhere. Distinguish social visibility from actual verification.

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
