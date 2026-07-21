# Covenant Smart-Contract Security Readiness Review

A low-cost, internal security readiness review of `Covenant.sol` and its
integration surface. This is **not** a substitute for an independent audit —
it is the groundwork that makes a future audit faster and cheaper, and it
raises real confidence now.

Scope: `packages/hardhat/contracts/Covenant.sol` (877 lines), its deployment
script, and the off-chain integration that reads/writes it.

## Overall assessment

The contract is well-constructed. It uses OpenZeppelin `ReentrancyGuard` +
`SafeERC20`, follows checks-effects-interactions on every payout, and enforces a
strong **escrow-isolation invariant** (a milestone can only release from its own
campaign's donations — `totalReleased + amount <= totalRaised`). Money-custody
logic is conservative and minimal-trust: the owner cannot move, freeze, or seize
escrow. Weighted-approval concentration (H1) and the mid-vote denominator (M4)
are now hardened in source, pending redeploy. The main residual risks are
**economic/design** (multi-wallet Sybil still raises the bar rather than
closing it entirely) and **operational** (owner key custody), not classic
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

### HIGH (hardened — see below; residual risk is MEDIUM)

**H1 — WeightedApproval concentration / Sybil self-approval.** *(Hardened in
source, not yet redeployed — same status as M1/Pausable below.)*
In `WeightedApproval`, any address that has donated can vote, weighted by its
donation. Previously a wallet holding ≥ the threshold percentage could release
funds alone; because a creator is only blocked from donating with *their own*
address, a creator could fund a campaign from a **second wallet**, then approve
their own milestone.

**Fix applied:** two on-chain guards, both required for a WeightedApproval
release:
1. **Per-voter weight cap** (`MAX_VOTER_WEIGHT_BPS = 5000`, i.e. 50%) — no
   single voter's counted weight can exceed half of the submission's weight
   snapshot, however much they've actually donated.
2. **Minimum distinct approvers** (`MIN_WEIGHTED_APPROVERS = 2`) — at least two
   distinct donor addresses must vote yes before a release fires, regardless
   of combined weight.

Together these mean one wallet can never single-handedly release escrow under
WeightedApproval. *This does not make money-weighted voting Sybil-proof* — a
creator controlling two (or more) sufficiently-funded wallets can still combine
them to clear both the weight and approver-count bars. It raises the attack
from "one wallet, any amount" to "several well-funded wallets," which is a real
increase in cost and on-chain visibility (multiple distinct addresses donating
and voting is a detectable pattern), not a complete close.
- **Residual mitigations (still recommended, app/process):** steer high-value
  or enterprise campaigns to `DesignatedReviewers`; vet creators via
  `approvedCreators`; the campaign-creation UI now warns when choosing
  WeightedApproval (`packages/nextjs/app/create/page.tsx`) that a creator
  controlling majority weight across multiple wallets can still self-approve;
  treat `trustScore` as informational only, never as Sybil-resistant identity.
- **Tests:** `CovenantSecurity.ts` → "Weighted approval concentration (H1
  hardening)": a single sockpuppet holding 66% weight can no longer release
  alone; a 90%-weight whale is capped at 50% and needs a second approver to
  cross the threshold.

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
- **Optional hardening — considered, deliberately NOT implemented (2026-07-17):**
  the natural-seeming fix ("give the last claimant the remainder") is genuinely
  easy to get wrong: whoever calls `claimRefund` *last in time* should get the
  remainder, but that's the donor who happens to claim last, not identifiable
  from on-chain donation order — an implementation keyed on donation order
  instead of claim order can pay one donor the ENTIRE unreleased pool if they
  happen to claim first (a real fund-drain bug, drafted and rejected during
  this review rather than shipped). Correctly tracking "last to claim" needs
  per-donor claimed-state and careful handling of donors whose share already
  rounds to zero (they'd never trigger the "everyone's claimed" condition).
  Given this is explicitly *not a theft risk* and the dust is bounded at
  `< donor count` base units, it stays unfixed rather than risk a subtly wrong
  change to a live-money contract for a cosmetic amount. Revisit with a
  dedicated design + test pass if it matters at your evidence/donor scale.
- **Test:** `CovenantSecurity.ts` → "pro-rata refunds never exceed unreleased
  escrow; residue is < donor count".

**M4 — Weighted denominator uses current `totalRaised`.** *(Fixed in source, not
yet redeployed.)* Donations landing mid-vote used to shift the approval bar.
**Fix applied:** `Milestone.weightSnapshot` now records `totalRaised` at the
moment `submitProof` creates the submission; `reviewProof`'s WeightedApproval
branch divides by that snapshot instead of the live `c.totalRaised`. A donation
arriving after submission no longer moves the bar for that submission (a new
submission after a rejection takes a fresh snapshot).
- **Test:** `CovenantSecurity.ts` → "weight snapshot is fixed at submission
  time (M4 fix) — a mid-review donation can't shift the bar".

### LOW

- **L1 — Non-standard token over-credit.** `donate` credits `totalRaised` before
  `safeTransferFrom`; a fee-on-transfer/deflationary token would over-credit.
  Mitigated by the immutable `usdc` + the deploy script's USDC validation
  (bytecode, 6 decimals, symbol). *Assumption: the token is canonical USDC.*
- **L2 — USDC issuer centralization.** Circle can freeze/blacklist addresses or
  upgrade USDC; escrow or a payout could be frozen. Inherent to using USDC.
- **L3 — `getAllCampaigns()` unbounded.** *(Fixed in source, not yet
  redeployed.)* Added `getCampaignsPage(offset, limit)` returning a slice plus
  the total count, so a client can page instead of pulling every campaign in
  one call. `getAllCampaigns()` is left in place unchanged for backward
  compatibility — this is purely additive. The frontend still calls
  `getAllCampaigns()` (campaign volume today doesn't need pagination); wiring
  the UI to page is a follow-up once volume actually grows.
  - **Test:** `Covenant.ts` → "getCampaignsPage" → "pages through campaigns
    in creation order and reports the total".
- **L4 — DesignatedReviewers are fixed at creation.** *(Considered, not
  implemented.)* No rotation/removal; a lost reviewer key can deadlock a
  campaign until it times out to refunds. A rotation feature needs its own
  careful design — who can rotate (creator alone? needs a timelock to stop a
  creator swapping in a colluding reviewer mid-review?) is a real
  economic/security tradeoff, not a mechanical fix, so it's deliberately left
  for an explicit design discussion rather than shipped speculatively.
  Acceptable today (no admin override of user campaigns exists either), but a
  liveness consideration worth revisiting if reviewer churn becomes common.

## Tests that should exist — now added

New suite: `packages/hardhat/test/CovenantSecurity.ts` (+ `contracts/test/ReentrantToken.sol`):

- ✅ **Reentrancy safety** — a malicious payout token that re-enters
  `claimRefund` cannot cause a double refund (guard + CEI hold).
- ✅ **Escrow isolation invariant** — releasing/refunding one campaign never
  touches another's escrow; `balance == Σ(raised − released)` before refunds.
- ✅ **Refund rounding** — never over-pays; locked dust is bounded (< donor count).
- ✅ **Weighted concentration (H1)** — asserts the hardened behavior: a lone
  sockpuppet can no longer release alone; a 90%-weight whale is capped at 50%
  and needs a second distinct approver.
- ✅ **Weighted denominator snapshot (M4)** — a donation landing mid-review
  doesn't move the approval bar for the in-flight submission.
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
ABI re-export, and ideally an external audit first). Status:

1. **Multisig owner** (M2) — deploy owned by a Gnosis Safe. *Config change, no
   contract code change.* Highest value, zero cost. **Still outstanding** (a
   decision only you can make — which Safe, which signers), but there's now a
   safety-checked tool for it: `packages/hardhat/scripts/transferOwnership.ts`
   (`NEW_OWNER=0xSafe... CONFIRM=yes yarn hardhat run scripts/transferOwnership.ts --network base`)
   — refuses to run without explicit confirmation, refuses to renounce to the
   zero address, verifies the signer is the current owner, and warns (without
   blocking) if `NEW_OWNER` looks like a plain EOA rather than a contract.
2. **Guarded `Pausable`** (M1) — pause new inflows/reviews but never refunds.
   **Done in source**, pending redeploy.
3. **Per-voter weight cap + minimum distinct approvers for H1** and **weight
   snapshot for M4** — **done in source** (`MAX_VOTER_WEIGHT_BPS`,
   `MIN_WEIGHTED_APPROVERS`, `Milestone.weightSnapshot`), pending redeploy. UI
   guardrails (warn on WeightedApproval self-approval risk) shipped
   independently and don't require a redeploy.
4. **Paginated reads for L3** (`getCampaignsPage`) — **done in source**,
   pending redeploy. Purely additive (`getAllCampaigns()` unchanged).
5. **Dust handling** (M3) — considered and deliberately not implemented; see
   the M3 entry above for why. **Reviewer rotation** (L4) similarly considered
   and deliberately not implemented — a real design tradeoff, not a
   mechanical fix.

**All four source-level changes above (Pausable, H1 cap/min-approvers, M4
snapshot, L3 pagination) are batched for the same next deployment** — one
redeploy, one Basescan re-verify, one frontend ABI re-export, rather than
separate migrations.

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
