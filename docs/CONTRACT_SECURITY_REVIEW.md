# Covenant Smart-Contract Security Readiness Review

A low-cost, internal security readiness review of `Covenant.sol` and its
integration surface. This is **not** a substitute for an independent audit —
it is the groundwork that makes a future audit faster and cheaper, and it
raises real confidence now.

Scope: `packages/hardhat/contracts/Covenant.sol` (796 lines), its deployment
script, and the off-chain integration that reads/writes it.

## Overall assessment

The contract is well-constructed. It uses OpenZeppelin `ReentrancyGuard` +
`SafeERC20`, follows checks-effects-interactions on every payout, and enforces a
strong **escrow-isolation invariant** (a milestone can only release from its own
campaign's donations — `totalReleased + amount <= totalRaised`). Money-custody
logic is conservative and minimal-trust: the owner cannot move, freeze, or seize
escrow. The main residual risks are **economic/design** (weighted-approval
concentration) and **operational** (owner key custody, no pause), not classic
implementation bugs.

## Clear separation: contract controls vs. app controls

| Protects | Enforced by | Examples |
|---|---|---|
| **Funds** (custody, release, refunds) | **The contract** (trustless, on-chain) | Escrow isolation, reentrancy guards, reviewer authorization, refund math, spam limits |
| **Data** (confidentiality, availability) | **The app** (Covenant-operated) | Evidence encryption, audit logging, API auth, rate limiting, backups, secrets |
| **Reviewer / creator integrity** | **Process & curation** (people) | `approvedCreators` vetting, choosing DesignatedReviewers, off-chain review quality |

Key point for enterprises: **the contract guarantees money safety; it cannot
guarantee identity, Sybil-resistance, or evidence quality.** Those come from the
app's controls and from human curation. Don't rely on on-chain `trustScore` as a
security signal (see H1).

## Prioritized risk list

### HIGH

**H1 — WeightedApproval concentration / Sybil self-approval.**
In `WeightedApproval`, any address that has donated can vote, weighted by its
donation, and a wallet holding ≥ the threshold percentage can release funds
alone. Because a creator is only blocked from donating with *their own* address,
a creator can fund their campaign from a **second wallet**, then approve their
own milestone — releasing escrow (including other donors' money if the sockpuppet
outweighs them) and inflating `trustScore` with no independent review.
*Impact:* real donors' funds released without genuine review; gamed reputation.
*This is inherent to money-weighted voting; the contract cannot fully prevent it.*
- **Mitigations (low-cost, mostly app/process):** steer high-value or enterprise
  campaigns to `DesignatedReviewers`; vet creators via `approvedCreators`; surface
  a warning in the UI when one wallet holds majority weight; treat `trustScore`
  as informational only, never as Sybil-resistant identity.
- **Test:** `CovenantSecurity.ts` → "a single donor holding >= threshold weight
  can release funders' escrow alone" (asserts the behavior so it stays visible).

### MEDIUM

**M2 — Owner key custody & powers.** The owner is a single EOA. Its powers are
deliberately narrow (`setCreatorApproval`, and acting as reviewer for
`PlatformOperator` campaigns) and it **cannot touch escrow**. But: a compromised
owner can spam-approve creators and rubber-stamp `PlatformOperator` releases; and
`renounceOwnership()` would permanently brick review for `PlatformOperator`
campaigns (→ they can only time-out to refunds).
- **Mitigations:** make the owner a **multisig (Gnosis Safe — free)**; never
  renounce while `PlatformOperator` campaigns are live; document the exact owner
  powers publicly. See [SECURE_CONFIGURATION.md](./SECURE_CONFIGURATION.md) for
  deployer-key custody.

**M1 — No pause / circuit breaker.** *(Now implemented in source — pending next
deploy.)* `Covenant.sol` now inherits OpenZeppelin `Pausable` with owner-only
`pause()`/`unpause()`. Pausing halts `createCampaign`, `donate`, and
`reviewProof` (money inflows + releases) but **never** `claimRefund`,
`cancelCampaign`, `submitProof`, or `failCampaign` — donors and creators can
always exit while paused. Covered by tests in `CovenantSecurity.ts` ("Circuit
breaker"). This adds an admin power, so it **must** be paired with M2 (multisig
owner). The live contract does not yet have this — it takes effect on the next
deployment (redeploy + Basescan re-verify + frontend ABI re-export).

**M3 — Refund rounding dust.** `refundOf = donation * unreleased / totalRaised`
truncates, so after a partial release a small residue (< number of donors) is
permanently locked, and a donor whose share rounds to zero cannot claim.
*Not a theft risk* — the contract never over-pays (proven by test). Low priority.
- **Optional hardening:** assign the remainder to the last claimant, or add an
  owner sweep of provably-orphaned dust after all donors have claimed.
- **Test:** `CovenantSecurity.ts` → "pro-rata refunds never exceed unreleased
  escrow; residue is < donor count".

**M4 — Weighted denominator uses current `totalRaised`.** Donations landing
mid-vote shift the approval bar (acknowledged in-code). Bounded because
`totalRaised <= goalAmount`, but a late whale donation can move the threshold.
- **Mitigation:** documented; a hard per-submission weight snapshot is a future
  design (needs its own tests).

### LOW

- **L1 — Non-standard token over-credit.** `donate` credits `totalRaised` before
  `safeTransferFrom`; a fee-on-transfer/deflationary token would over-credit.
  Mitigated by the immutable `usdc` + the deploy script's USDC validation
  (bytecode, 6 decimals, symbol). *Assumption: the token is canonical USDC.*
- **L2 — USDC issuer centralization.** Circle can freeze/blacklist addresses or
  upgrade USDC; escrow or a payout could be frozen. Inherent to using USDC.
- **L3 — `getAllCampaigns()` unbounded.** A view that grows with campaign count;
  can time out RPC at scale. Off-chain only (the indexer uses events); not a fund
  risk. Prefer paginated reads client-side as volume grows.
- **L4 — DesignatedReviewers are fixed at creation.** No rotation/removal; a lost
  reviewer key can deadlock a campaign until it times out to refunds. Acceptable
  (no admin override of user campaigns), but a liveness consideration.

## Tests that should exist — now added

New suite: `packages/hardhat/test/CovenantSecurity.ts` (+ `contracts/test/ReentrantToken.sol`):

- ✅ **Reentrancy safety** — a malicious payout token that re-enters
  `claimRefund` cannot cause a double refund (guard + CEI hold).
- ✅ **Escrow isolation invariant** — releasing/refunding one campaign never
  touches another's escrow; `balance == Σ(raised − released)` before refunds.
- ✅ **Refund rounding** — never over-pays; locked dust is bounded (< donor count).
- ✅ **Weighted concentration (H1)** — documents the self-approval behavior.
- ✅ **Double-vote prevented** — a committee reviewer can't reach threshold alone.
- ✅ **Double-refund prevented.**

Still worth adding later (needs Foundry or more scaffolding):
- **Property/invariant fuzzing** with `forge` (free): fuzz donate/release/refund
  sequences asserting `contractBalance == Σ unrefunded-unreleased` always holds.
- **Multi-submission review edge cases** under weighted + committee models.
- **Deadline/timeout boundary fuzzing** around `REVIEW_WINDOW`/`REVISION_WINDOW`.

## Low-cost hardening changes (for the NEXT deployment)

These are **not** applied to the live contract (it is immutable and holds real
USDC — any change requires a new deployment, Basescan re-verification, frontend
ABI re-export, and ideally an external audit first). Proposed, in priority order:

1. **Multisig owner** (M2) — deploy owned by a Gnosis Safe. *Config change, no
   code.* Highest value, zero cost.
2. **Guarded `Pausable`** (M1) — pause new inflows/reviews but never refunds.
3. **UI + config guardrails for H1** — default enterprise/high-value campaigns to
   DesignatedReviewers; warn on majority-weight concentration. *App-side, no
   redeploy.*
4. **Dust handling** (M3) — optional, low priority.

## Operational controls around deployment & config

Already strong in `scripts/deploy.ts` (keep these):
- ✅ Validates the USDC address has bytecode, 6 decimals, and a USDC symbol
  before deploying (a wrong immutable token would brick the contract).
- ✅ Post-deploy verification that on-chain `usdc()` matches, with retry for RPC lag.
- ✅ Verifies the exported frontend ABI/addresses match the deployment and
  contain the critical functions.

Add/formalize:
- **Run the full test suite in CI before any deploy** (now enforced — the
  `contracts` job runs `hardhat test`).
- **Owner = multisig**, verified immediately post-deploy.
- **Verify the contract on Basescan** (`BASESCAN_API_KEY`) for public auditability.
- **Record each deployment** (address, block, commit hash, deployer, owner) in a
  change log — see [docs/soc2/10-secure-sdlc.md](./soc2/10-secure-sdlc.md).
- **Deployer key custody** per [SECURE_CONFIGURATION.md](./SECURE_CONFIGURATION.md):
  hardware wallet / dedicated low-balance key; never on the app server.

## Honest positioning

This review and the new tests raise confidence and create auditability. They do
**not** constitute an independent audit, and Covenant is **not** claiming SOC 2
compliance. An external smart-contract audit before scaling real value is the
recommended next step once funded.
