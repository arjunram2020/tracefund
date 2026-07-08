# @covenant/loadtest — stress-testing Covenant

A repo-native harness that simulates what "N users using Covenant" actually
means, split into the three layers where the load really lands:

| Layer | Tool | What it stresses |
|---|---|---|
| **Blockchain actors** (`actors`) | viem + deterministic HD wallets | tx throughput, nonce handling, contract business rules, approval bottlenecks |
| **Web / RPC load** (`web`) | plain fetch + viem reads | Next.js page serving, the drafting API, and — separately — the RPC read amplification every page triggers |
| **Browser realism** (`browser`) | Playwright + injected mock wallet | hydration, RainbowKit/wagmi connect flow, approve→donate two-step, review-release UX races |

**Why three layers:** Covenant's frontend is client-rendered — every data read
(`getAllCampaigns`, `getMilestones`, activity `getLogs` scans) goes
*browser → RPC directly*, not through the Next server. "1000 users" is therefore
mostly an RPC problem plus a transaction-queueing problem, with only a thin
HTTP surface. 1000 real browsers would measure your test machine, not Covenant;
programmatic wallets measure the product.

## Prerequisites

```bash
yarn install          # repo root — links the new workspace
yarn chain            # terminal 1: hardhat node on 127.0.0.1:8545 (chainId 31337)
yarn deploy           # terminal 2: deploys Covenant + MockUSDC, exports to the frontend
```

For the browser layer additionally:

```bash
npx playwright install chromium
```

Optional higher-throughput chain (recommended for 500+ users): use Anvil
instead of hardhat node — same mnemonic, same chainId, plus interval mining so
confirmation-time metrics behave like a real chain:

```bash
anvil --block-time 2   # then: yarn deploy  (localhost network works unchanged)
```

## Wallets

All wallets derive deterministically from the standard dev mnemonic
(`test test … junk`, override with `LOADTEST_MNEMONIC`):

- index `0` — deployer / contract owner / funder
- `10–19` — Playwright browser sessions (hardhat node keeps these unlocked)
- `100+` — actor wallets; within a preset the role split (creators →
  reviewers → donors → readers) is stable across runs, so results are
  comparable run-over-run.

## Commands

```bash
# 1. Seed wallets: gas ETH, 10k MockUSDC per donor, escrow allowances,
#    owner-vetting for creators (idempotent; re-run when you raise --users)
yarn loadtest:seed --users 100
yarn loadtest:seed --users 1000

# 2. Actor load — presets
yarn loadtest:actors --users 100  --scenario mixed-write --duration 60
yarn loadtest:actors --users 500  --scenario mixed-write --duration 120
yarn loadtest:actors --users 1000 --scenario mixed-write --duration 180

# Scenario variants
yarn loadtest:actors --users 500  --scenario mixed-read            # read-heavy population
yarn loadtest:actors --users 300  --scenario reviewer-bottleneck   # 3 reviewers serve everyone
yarn loadtest:actors --users 500  --scenario weighted-vote         # concurrent voting race

# 3. Web/RPC load (Next.js dev server must be running: yarn frontend)
yarn loadtest:web --mode app    --vus 200 --duration 60   # page/API pressure only
yarn loadtest:web --mode rpc    --vus 200 --duration 60   # chain-read pressure only
yarn loadtest:web --mode hybrid --vus 200 --duration 60   # realistic page views (both)

# 4. Browser realism (starts the app dev server itself if not running)
yarn loadtest:browser
```

Useful flags: `--ramp <sec>` (default scales with users), `--max-inflight <n>`
(global tx cap, default 100), `--approve-mode exact` (approve before every
donation, mirroring a first-time donor's UI flow — doubles write volume),
`--rpc <url>` / `LOADTEST_RPC_URL`, `--label <name>` for the results files.

## Output

Every run writes `results/<timestamp>-<label>.json` (summary + all records)
and `.csv` (one row per operation), and prints a summary table: per-op
throughput, latency p50/p95/p99, tx confirmation p50/p95, average gas,
success/revert/error counts, and the top unexpected failure messages.

Reverts are split into **expected** (business rules a real crowd will hit:
donation caps, "Already reviewed", the post-release "No proof awaiting review"
in vote races) and **unexpected** (findings).

## What each scenario is probing

- **mixed-read** — read amplification: `getAllCampaigns` is O(campaignCount)
  with unbounded strings and is fetched by every home/list visitor; the
  activity feed re-scans logs every 30s per open campaign page.
- **mixed-write** — tx queueing, per-wallet nonce sequencing, mining
  throughput, donation-cap contention when many donors race the same
  milestone gap.
- **reviewer-bottleneck** — human approval as the system constraint: many
  funded milestones wait on a 3-wallet committee (2-of-3); watch
  time-to-release and the queue of `Submitted` milestones.
- **weighted-vote** — many small donors fund one WeightedApproval campaign,
  then all vote in one burst. Once the percent threshold is crossed the
  milestone releases and every remaining vote *must* revert with
  "No proof awaiting review" — measures the race window and wasted votes/gas.

## Simulated-donor rules

Donor actors deliberately mirror the frontend's rules, not just the contract's:
they cap each donation at the current milestone's remaining tranche gap and
stop donating entirely while a milestone is fully funded / under review
(`DonationPanel`'s lock), because that's all real users can do through the UI.
Locked-out attempts are counted (`donations-skipped:milestone-locked`) — a
large number under load is itself a product finding (donation throughput goes
to zero while reviews are pending).

## Forked Base (optional)

```bash
anvil --fork-url https://mainnet.base.org --block-time 2
LOADTEST_CHAIN_ID=8453 USDC_WHALE=0x… yarn loadtest:seed --users 100
```

On a fork the canonical USDC has no open `mint`, so the seeder impersonates
`USDC_WHALE` (any address holding enough USDC) via `anvil_impersonateAccount`
and transfers real USDC to the donors. Note the frontend's write-flow targets
the deployment recorded in `deployedContracts.json` for that chainId.

## Where Covenant is most likely to break under load

1. **`getAllCampaigns` read amplification** — O(n) struct array with full
   descriptions, called by every list-page visitor and re-fetched after every
   confirmed write (`refresh()` invalidates *all* queries). Grows without
   bound as campaigns accumulate.
2. **Activity-feed `getLogs`** — 8 event types × chunked full-history scans
   per campaign page, refreshed every 30s per open tab; on public RPCs this
   rate-limits first.
3. **Milestone donation lock** — while any milestone is under review, its
   campaign accepts zero donations; platform-wide donation throughput is
   bounded by review latency.
4. **Approval bottlenecks** — PlatformOperator campaigns all wait on one
   owner wallet (serial nonce!); designated committees serialize similarly.
5. **Creator anti-spam limits** — 2 lifetime campaigns + 1/day per address
   until the owner vets each creator manually.
6. **Weighted-vote race** — votes landing after threshold-crossing revert;
   users lose gas and see errors unless the UI handles the race.
7. **Nonce sequencing** — one wallet = strictly serial txs; any user (or the
   operator) acting quickly in two tabs risks nonce races.
8. **Local-chain artifacts** — hardhat automine gives instant, unrealistic
   confirmations; use Anvil `--block-time 2` for meaningful confirmation
   metrics.
