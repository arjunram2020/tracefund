# @covenant/indexer

An off-chain **indexer + API** for Covenant. The blockchain is the
source of truth, but reading lots of history straight from it is slow and
rate-limited. This service listens to the contract's events, caches them in a
local SQLite database, and serves them over a fast HTTP API.

```
Base Mainnet ──events──► indexer (Node) ──writes──► SQLite
                              │
                         Express API ◄──fetch── Next.js frontend
```

This is the one part of Covenant that genuinely needs an always-on server,
which makes it the right thing to run on EC2.

## Run locally

```bash
cp .env.example .env      # then edit values
yarn install              # from the repo root (workspaces)
yarn workspace @covenant/indexer start
```

The first run **backfills** all history since `DEPLOY_BLOCK`, then polls for new
events every `POLL_INTERVAL_MS`. A cursor (`last_block`) is saved in the DB, so
restarts resume instead of re-scanning.

## API

| Endpoint | Description |
|---|---|
| `GET /health` | `{ ok, lastIndexedBlock }` |
| `GET /stats` | total event count + counts per type |
| `GET /events?type=&campaignId=&limit=` | events, newest first |
| `GET /campaigns/:id` | one campaign's full audit trail, chronological |

## The RPC-limit lesson

`eth_getLogs` block-range caps decide how expensive backfill is:

| RPC | getLogs range | Calls to backfill ~684k blocks |
|---|---|---|
| Alchemy/Infura free | ~10 blocks | ~68,000 (don't) |
| `https://mainnet.base.org` (public) | 10,000 blocks | ~75 ✅ |
| Paid plan | unlimited | 1 sweep |

The backfill auto-shrinks its chunk if a provider rejects the range, so it
survives whatever limit it hits.

## Deploying to AWS (EC2)

See the [AWS beginner guide](../../docs/AWS_FOR_BEGINNERS.md) for the mental
model and the [EC2 runbook](../../docs/AWS_DEPLOYMENT.md) for exact commands.
The API port stays private; Nginx exposes it under `/api/`.
