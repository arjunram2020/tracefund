# Covenant — Fixes, Architecture, and Next Steps (July 20, 2026)

This document has three parts:

1. **What was fixed** in the July 20 session, in plain terms.
2. **How the app actually works** today — the moving pieces and how data flows
   between them, with a focus on the parts that were touched.
3. **What still needs doing** — both the manual follow-ups to these fixes and
   the larger roadmap.

---

## Part 1 — What was fixed

### 1. The indexer was watching the wrong contract

**The problem, plainly:** Covenant has had several contract versions deployed to
Base over time. The old ones are retired; the live one is
`0xB31D06627E249282Ec2a7e17efcebae55F934F29`. The *indexer* — the background
service that watches the blockchain and caches activity so the website can show
history fast — was still pointed at the oldest retired contract
(`0x000f8e…`). So it was reading a dead contract that doesn't emit the events the
current app expects. The website's history and activity feeds would show stale or
empty data that didn't match what's really on-chain.

**The fix:** repointed the indexer at the live contract by editing its
configuration (`packages/indexer/.env`): the contract address and the block
number to start scanning from (`48208634`, the block the live contract was
deployed in).

> ⚠️ This was fixed on the local copy only. The production indexer on the EC2
> server has its own separate config file (`~/indexer/.env`) that still needs the
> same edit, plus a database reset so it re-scans from the right block.

### 2. Evidence uploads silently failed against a secured server

**The problem, plainly:** When a project creator submits proof for a milestone,
the full proof package ("manifest") is stored off-chain in the indexer's
evidence registry so reviewers on other devices can fetch it. The browser was
uploading that package *directly* to the indexer with no password/token
attached. That's fine on a wide-open server — but a properly secured production
indexer *requires* a secret write token, and (correctly) rejects any upload that
doesn't have it. The rejection was swallowed silently: the creator saw
"success," but the package only ever landed in their own browser's local
storage. A reviewer on a different device or browser would open the campaign and
find **nothing to review**. The whole review flow quietly broke in production.

Why not just put the token in the browser? Because anything the browser can read
is public — shipping the secret token in the website's code would hand it to
every visitor, which is the same as having no security at all.

**The fix:** added a small server-side "proxy" — a new backend endpoint in the
Next.js app at `/api/evidence/[locator]`. The browser now uploads to *that*
endpoint (same website, so no secret needed on the browser side). The endpoint,
running on the server, attaches the secret write token and forwards the upload to
the indexer. The token lives only on the server and is never sent to browsers.

The indexer independently re-hashes every upload to confirm the content matches
its address, so the proxy can only *authorize* an upload — it can never smuggle
in tampered content.

> ⚠️ To turn this on in production, the secret token (`EVIDENCE_WRITE_TOKEN`)
> must be set in the frontend server's environment, matching the indexer's token.
> Until then the proxy forwards uploads without a token (which is fine against a
> server that isn't requiring one yet).

### 3. Cleaned up the repository for enterprise buyers

**The problem, plainly:** The `docs/` folder contained several very large raw
AI-chat transcripts and scratch files (one was even literally named
`panera.md (put this markdown file in the docs folder in this directory)`). These
look unprofessional to any enterprise looking through the codebase during due
diligence — and this exact class of file is how an API key leaked into the
project's history once before.

**The fix:** removed all seven transcript/scratch files from the repository
(backed them up safely first, so nothing was lost). The `docs/` folder now
contains only real, intentional documentation.

> ⚠️ These files are removed going forward, but older commits in the project's
> *history* still contain them (and an old leaked key). Scrubbing history is a
> separate, heavier operation — see Part 3.

### 4. Fixed documentation that contradicted reality

Several docs described the system as *less* secure than it now is, which for an
enterprise buyer is as damaging as overclaiming — it makes the whole doc set look
untrustworthy. Corrections made:

- **`PROOF_REVIEW_ARCHITECTURE.md`** claimed evidence storage was unauthenticated
  and had no audit log ("TODO, deliberately not faked"), and that milestone
  voting used a live, gameable denominator. All of that is now actually built.
  Rewrote those sections to describe the real, current design, with a clear note
  distinguishing what's live on-chain today from what activates on the next
  contract redeploy.
- **Small number corrections:** the contract is 877 lines (docs said 796); the
  test suite is 54 tests (docs said 53); and a claim that every package ships a
  config template was reconciled (the load-test package intentionally has none).
- **`CODEOWNERS`** still had leftover "replace this username" placeholder text.
  Replaced it with an honest note that a single owner is currently the only
  required reviewer (a governance gap — see Part 3).
- **`SECURITY.md`** routed vulnerability reports to a personal Gmail. Made GitHub's
  built-in private reporting the primary channel (it doesn't depend on any one
  person's inbox) and marked the email as a fallback pending a proper
  `security@` alias.

---

## Part 2 — How the app works today

Covenant is a milestone-based escrow product. A creator raises funds toward a
goal broken into milestones; money is only released when proof of each milestone
is submitted and approved by reviewers. If milestones stall, donors get refunded.

There are **three moving parts**:

### A. The smart contract (`packages/hardhat` → live on Base mainnet)

This is the source of truth and the only thing that holds money. Written in
Solidity, deployed once and immutable. Key flow:

- **`createCampaign`** — a creator defines the campaign, its milestones (each with
  acceptance criteria), and an approval model.
- **`donate`** — donors send USDC, which the contract holds in escrow.
- **`submitProof`** — the creator submits proof for the current milestone. This
  records a *hash* of the proof package on-chain but **moves no money**.
- **`reviewProof`** — an authorized reviewer approves or rejects. Once approval
  crosses the configured threshold, that milestone's funds release to the
  creator. Rejection opens a revision window to resubmit.
- **Refund paths** — if the creator misses a deadline or reviewers go silent,
  anyone can fail the campaign (or the creator can cancel it), and donors reclaim
  their share of the unreleased escrow.

Three approval models exist: **WeightedApproval** (donors vote weighted by how
much they gave), **DesignatedReviewers** (named reviewer addresses), and
**PlatformOperator** (the contract owner reviews). The contract also has an
owner-only pause switch and hardening against vote-concentration attacks —
though note: **the pause switch and the latest voting-safety fixes exist in the
contract source but are not yet on the live deployment.** They activate on the
next redeploy.

### B. The indexer (`packages/indexer` → runs on EC2)

The blockchain is slow and awkward to query directly for "show me all activity
for this campaign." The indexer solves that. It's a small Node.js service that:

1. **Watches the live contract** and records every event it emits (donations,
   proof submissions, reviews, releases, refunds) into a local SQLite database.
2. **Serves a simple HTTP API** the website calls for fast history and stats
   (`/campaigns/:id`, `/events`, `/stats`, `/health`).
3. **Hosts the evidence registry** — the off-chain storage for full proof
   packages (see below).

This is the piece that was pointed at the wrong contract (Fix #1). It knows which
contract to watch purely from its config file, which is why the fix was a
one-line configuration change rather than a code change.

### C. The frontend (`packages/nextjs` → the website, also on EC2)

The Next.js web app is what users see. It talks *directly to the contract* for
anything involving money or truth (reading campaign state, sending donations,
submitting proof, reviewing), and talks *to the indexer* for fast history and for
evidence storage/retrieval.

### How evidence flows — the part that was fixed

This is the most important flow to understand, because Fix #2 lives here.

**On-chain, the contract only ever stores a hash** — a short fingerprint of the
proof package. It never stores the actual documents (that would be expensive and
public). The real proof package (a JSON "manifest": narrative, metrics, evidence
links) lives *off-chain*.

The creator picks one of two privacy modes per submission:

- **Public mode:** the manifest is stored in the clear, addressed by the same
  hash that's on-chain. Anyone reading the chain can fetch it. Use for evidence
  meant to be public.
- **Encrypted mode:** the manifest is encrypted *in the creator's browser* before
  it ever leaves. Only the scrambled version is stored, addressed by a fingerprint
  of the *ciphertext* (which is not on-chain). The decryption key travels only
  inside a "capability" string the creator shares with reviewers out-of-band. The
  server and the public chain see nothing but opaque bytes.

Either way, storage goes through two tiers:

1. **The indexer's evidence registry** — the shared store, so reviewers on any
   device can fetch it.
2. **The browser's local storage** — a fallback for same-browser demos when no
   indexer is available.

**Before the fix**, the browser wrote to tier 1 by calling the indexer directly,
with no auth token — which a secured indexer rejects, silently dropping the app
back to tier 2 (local-only). **After the fix**, the write path is:

```
Creator's browser
  → PUT /api/evidence/:locator      (same website — no secret needed here)
      → [Next.js server attaches the secret EVIDENCE_WRITE_TOKEN]
      → PUT https://indexer/evidence/:locator   (now authorized)
          → indexer re-hashes the body to confirm it matches the address,
            encrypts it at rest, stores it, and logs the access
```

Reads still go **straight from the browser to the indexer** — because the
optional per-reviewer read protection checks the reviewer's own wallet signature,
which only the reviewer's browser can produce, not the server.

**When a reviewer opens a campaign**, the app fetches the manifest (decrypting it
if needed with the capability), re-computes its hash, and compares that to the
hash on-chain. Match = a green integrity badge, proving the reviewer is looking at
exactly what the creator committed to. This is why the registry can be
"untrusted" storage: the chain is the referee.

---

## Part 3 — What should be done next

### Immediate follow-ups to these fixes (manual, can't be done from code)

1. **Update the production indexer.** SSH to the EC2 box, edit `~/indexer/.env`
   with the live contract address (`0xB31D06627E…`) and deploy block
   (`48208634`), delete the cached `covenant.db`, and restart so it re-indexes
   from scratch. Until this is done, the live site's history still reflects the
   wrong contract.
2. **Set the evidence write token in production.** Add `EVIDENCE_WRITE_TOKEN` to
   the frontend server's environment (matching the indexer's token) so the new
   write proxy is actually authorized. Optionally set `INDEXER_URL` if the server
   should reach the indexer at an internal address.
3. **Finish the API-key rotation.** Rotate the old leaked Alchemy key in the
   Alchemy dashboard and update the copy baked into the server's `.env.local`.
4. **Scrub git history.** The removed transcripts (and the old leaked key) still
   live in past commits. Use `git filter-repo` or BFG to purge them, then
   force-push. Do this deliberately — it rewrites history and anyone with a clone
   must re-sync.

### Governance / compliance (for enterprise sales)

5. **Turn on branch protection.** In GitHub → Settings → Branches, add a rule for
   `main`: require a pull request, require review from Code Owners, require the CI
   and contracts checks to pass, and enable secret scanning + push protection.
   The `CODEOWNERS` file already exists but does nothing until these toggles are
   on.
6. **Add a second code owner.** Right now one person is the only required reviewer
   for every security-sensitive path — no separation of duties. Add a second
   maintainer so no one can merge their own security changes unreviewed.
7. **Create a real `security@` alias** and swap it into `SECURITY.md`, replacing
   the personal Gmail.

### The bigger roadmap (already tracked in the SOC 2 docs)

8. **Redeploy the contract** to activate the pause switch and the vote-concentration
   hardening that currently exist only in source. This is a significant step
   because the live contract holds real USDC — plan it carefully, ideally behind a
   multisig owner rather than a single wallet, and after an external audit.
9. **Harder evidence privacy** — in-app capability distribution and per-reviewer
   revocation (today, sharing the decryption capability is manual).
10. **Operational maturity** — centralized log shipping, alerting/paging,
    enforced off-site backups on the server, a managed secrets store with
    rotation, and eventually a paid SOC 2 Type I/II examination when a customer
    requires it.

> A standing rule across all docs: never claim Covenant "is SOC 2 compliant." It
> is building toward *readiness*; no independent examination has been done.
