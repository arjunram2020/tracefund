# Covenant Proof / Review / Refund Architecture

_Last updated: July 4, 2026 — this replaces the auto-release evidence model._

## Flow

```
create (criteria + approval config) → donate (USDC escrow)
  → submitProof (package hash on-chain; NO release)
  → reviewProof (approve / reject with notes)
       approve × threshold → milestone releases to creator, reputation++
       reject             → ChangesRequested + revision window → resubmit
  → missed deadlines / silent reviewers / cancel → failCampaign / cancelCampaign
       → claimRefund (pro-rata unreleased escrow back to each donor)
```

## Milestone acceptance criteria (on-chain)

Each milestone carries `MilestoneCriteria`: `title`, `successDefinition`
(required), `reportingPeriod`, `expectedMetrics`, `requiredProof`, and
`proofDeadline` (unix seconds; 0 = none). Evidence stays flexible — the
criteria are what reviewers evaluate against, so they must not be vague.

## Approval authority (per campaign)

`ApprovalConfig { model, reviewers[], threshold }`. The create-flow UI only
offers two of the three models per campaign kind: `DesignatedReviewers` or
`PlatformOperator` for Startup/Grant; `WeightedApproval` or `PlatformOperator`
for Charity/Other. This is a client-side rule only — the contract applies
identical logic to every `CampaignKind`.

| Model | Who approves | Notes |
|---|---|---|
| `WeightedApproval` | Any donor, weighted by USDC donated | Default for consumer/charity. `threshold` is a percent (1-100) of total raised that must approve by weight. |
| `DesignatedReviewers` | Named addresses (≤7) | `threshold > 1` = committee. VC / grant flows. Creator can't be a reviewer. |
| `PlatformOperator` | Contract owner | Grant-administrator style. Blocked on the owner's own campaigns. |

## Review lifecycle

`MilestoneState`: `Pending → Submitted → (Approved | ChangesRequested → Submitted …)`.
"Expired" is derived from deadlines in views (`milestoneFailed()`), never stored.

- `submitProof` requires: creator, funded tranche, before `proofDeadline`
  (and inside the revision window when resubmitting). Emits `ProofSubmitted`.
  **Never moves funds** — every model requires at least one `reviewProof` call.
- `reviewProof(approve, notes)`: authorized reviewer/donor, one vote per
  submission. Reject **requires notes**, flips to `ChangesRequested`, and
  starts a `REVISION_WINDOW` (14 days). On approve:
  - `DesignatedReviewers` / `PlatformOperator`: `approvalCount` increments;
    at `threshold` approvals the milestone releases.
  - `WeightedApproval`: `approvedWeight` accumulates the voter's own
    cumulative donation; once `approvedWeight / totalRaised >= threshold%`
    the milestone releases. Uses the *live* `totalRaised` as the denominator
    (no snapshot), so donations landing mid-vote can shift the bar — a hard
    snapshot would need its own design.
  - Either way: `MilestoneReleased`, the campaign advances, and — on the
    last milestone — completes.

## Failure / timeout / refunds

`milestoneFailed()` is true when the current milestone is stuck:
- `Pending` past its `proofDeadline` (creator disappeared);
- `Submitted` unreviewed for `REVIEW_WINDOW` (14d) past max(deadline, submission time) (reviewers disappeared);
- `ChangesRequested` past the revision window or deadline (rejected proof never fixed).

Then **anyone** can call `failCampaign`; creators can `cancelCampaign` any
time. Both cancel the campaign (donations/submissions/reviews blocked) and
open `claimRefund`: each donor gets `donation × unreleased / totalRaised`.
Released milestones are never clawed back; refunds zero the donor's balance
(no double claims). Milestones with **no deadline** have no `Pending` timeout
path — the UI pushes creators to set deadlines.

## Reputation

`trustScore` = 10 (created) + 12 × `milestonesApproved` + 15 × `campaignsCompleted`,
capped at 100. Proof submissions are counted (`proofSubmissions`) but **never
scored** — only reviewer-verified outcomes move reputation.

## Evidence privacy: on-chain / off-chain boundary

The proof package ("manifest") is a canonical JSON document
(`lib/proofManifest.ts`): narrative, justification, reporting notes, metrics
summary, and **one or more evidence links** (future-proofed with a `kind`
field for typed artifacts / uploads / content hashes).

| Where | What |
|---|---|
| **On-chain (always)** | `manifestHash` (keccak256 of the canonical JSON), a short public `summary`, submission timestamps, review decisions + notes. |
| **On-chain (opt-in only)** | `manifestURI` as a self-contained `data:` URI — the creator explicitly chooses to publish the full package. |
| **Off-chain** | The full manifest. Stored in the evidence registry (indexer `PUT/GET /evidence/:hash`, which re-hashes bodies so it can never serve mismatched content) with a localStorage fallback, and downloadable as JSON for direct sharing with reviewers. |
| **Verified** | Reviewers (UI: `ReviewPanel`) recompute the hash of whatever package they load and compare to the on-chain `manifestHash` — integrity badge on match, fingerprint instructions on miss. |

**Access model today:** capability-by-hash ("unlisted") — the hash is public
on-chain, so registry contents are readable by anyone who reads the chain.
**TODO(privacy), deliberately not faked:** authenticated storage with
role-based access (reviewer allowlists derived from the campaign's approval
config), expiring links, and an access audit log. `lib/evidenceRegistry.ts`
is the single seam to swap in that backend. Until then, keep genuinely
confidential documents in "private" mode and share the package file with
reviewers directly — the on-chain hash still proves what they were sent.

## AI-assisted drafting

`lib/milestoneDrafter.ts` (typed adapter) → `POST /api/draft-milestones`.
Currently a deterministic per-kind heuristic (charity / startup / grant
templates: criteria, metrics, proof types, cadence, deadlines, approval
suggestion). The LLM integration point is the route body only — see the
`TODO(llm)` block in `app/api/draft-milestones/route.ts`. Drafts are always
editable; the UI labels the source and never treats the draft as authority.

## Deployment safeguards (`scripts/deploy.ts`)

1. Pre-deploy: canonical token must have bytecode, `symbol` containing USDC,
   `decimals == 6` (aborts otherwise — the token address is immutable).
2. Post-deploy: `usdc()` read back must equal the validated address; Covenant
   bytecode must exist.
3. Post-export: `deployedContracts.json` is read back and must match the
   deployed addresses and contain the new-flow ABI (`submitProof`,
   `reviewProof`, `claimRefund`, `failCampaign`).

The frontend additionally treats any deployment whose ABI lacks the review
flow as **legacy** (reads only, writes disabled) and live-checks that the
configured USDC token has bytecode (`ContractNotice`).

## Deferred (intentionally)

- Snapshotted weighted voting — `WeightedApproval` currently divides by the *live* `totalRaised`, so donations landing mid-vote shift the bar. A hard snapshot (denominator fixed at submission time) would need its own design.
- Program-level approval config (per-campaign only for now; the `ApprovalConfig` struct is the unit a program registry would reference).
- Authenticated evidence storage / RBAC / access audit (seam: `evidenceRegistry.ts` + indexer `TODO(privacy)`).
- Typed artifacts and file uploads in proof packages (manifest `links[].kind` reserves the space).
- Real LLM drafting (seam: `app/api/draft-milestones/route.ts`).
- Research-list issues 10 and 12.
