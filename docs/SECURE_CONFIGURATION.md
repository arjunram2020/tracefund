# Covenant Secure Configuration Guide

How to handle secrets and configuration safely across Covenant's packages. This
covers what the repo enforces, what you must set correctly, and what has to be
handled operationally outside the repo. It does not by itself make Covenant
compliant with any standard — see [SOC2_READINESS.md](./SOC2_READINESS.md).

## Public vs server-only configuration

The single most important rule: **know which side of the trust boundary each
value lives on.**

| Scope | Where it lives | Ships to the browser? | May contain secrets? |
|---|---|---|---|
| `NEXT_PUBLIC_*` (frontend) | `packages/nextjs/.env.local` | **Yes — inlined into the JS bundle** | **NO** |
| Indexer config | `packages/indexer/.env` | No (server process) | Yes |
| Hardhat / deploy | `packages/hardhat/.env` | No (local/CI only) | Yes (keys) |
| Loadtest | `packages/loadtest/.env` | No (local only) | Test values only |

Anything prefixed `NEXT_PUBLIC_` is compiled into client JavaScript and is
readable by every visitor. Never place a private key, API secret, admin token,
or database URL behind a `NEXT_PUBLIC_` name.

### What is genuinely secret (server-only)

- `DEPLOYER_PRIVATE_KEY`, `DONOR_*_KEY` — hardhat, sign real transactions.
- `EVIDENCE_WRITE_TOKEN`, `ADMIN_TOKEN`, `EVIDENCE_ENC_KEY`, `AUDIT_SALT` — indexer.
- `BASESCAN_API_KEY` / `ETHERSCAN_API_KEY` — hardhat verification.
- Any RPC URL that embeds a provider API key.

### What is public by design (safe to expose)

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — identifies the app to the WC relay.
- `NEXT_PUBLIC_DEFAULT_CHAIN_ID`, `NEXT_PUBLIC_INDEXER_URL`, and keyless public
  RPC URLs.
- Contract addresses and deploy blocks (already on-chain).

## Env files and templates

Each package ships a committed `.env.example` documenting its variables; the
real `.env` / `.env.local` are git-ignored and never committed.

- `packages/nextjs/.env.example` — frontend (all PUBLIC).
- `packages/indexer/.env.example` — indexer + all security controls.
- `packages/hardhat/.env.example` — deploy keys and RPCs.

`.gitignore` ignores **every** `.env*` file except `*.example`, so a
`.env.production` or `.env.staging` with secrets cannot be committed by accident.

## Generating secrets

```bash
# 32-byte tokens / keys (indexer EVIDENCE_WRITE_TOKEN, ADMIN_TOKEN, AUDIT_SALT):
openssl rand -hex 32

# Evidence at-rest key (EVIDENCE_ENC_KEY) — 32 bytes, hex or base64:
openssl rand -hex 32
```

Use a distinct random value per secret. Do not reuse one token for two purposes.

## Developer checklist (local setup)

- [ ] Copy each `.env.example` to the real file (`.env` / `.env.local`); never edit the example with real values.
- [ ] Confirm `git status` shows **no** `.env` / `.env.local` as tracked or staged.
- [ ] Keep only PUBLIC values in `packages/nextjs/.env.local`.
- [ ] For local chain work you need no keys — Hardhat provides funded test accounts; loadtest uses the well-known public test mnemonic.
- [ ] Never point loadtest at a funded/public network with the default test mnemonic.
- [ ] If you must use a keyed RPC in the frontend, prefer a referrer-restricted key or a server-side proxy — never paste a secret-bearing URL into `NEXT_PUBLIC_*`.
- [ ] Before committing, scan your diff for accidental secrets (`git diff --staged`).

## Deployment checklist (production)

Frontend (Vercel or host):
- [ ] Set `NEXT_PUBLIC_*` values in the host's env settings — PUBLIC values only.
- [ ] Use a reliable RPC endpoint; if keyed, restrict the key by domain/referrer.

Indexer (server / EC2):
- [ ] Set `NODE_ENV=production` — the indexer then **fails to start** unless `ALLOWED_ORIGINS`, `EVIDENCE_WRITE_TOKEN`, and `ADMIN_TOKEN` are set (fail-closed).
- [ ] Set `EVIDENCE_ENC_KEY` (encryption at rest) and back it up separately from the database — losing it makes encrypted rows unreadable.
- [ ] Set `ALLOWED_ORIGINS` to your exact frontend origin(s).
- [ ] Store `.env` with least-privilege file permissions (`chmod 600`); never world-readable.
- [ ] Confirm ports 3000/4000 are not internet-exposed (only Nginx + SSH are).

Deploy keys (hardhat):
- [ ] Do **not** copy `DEPLOYER_PRIVATE_KEY` or seed phrases onto the web/indexer server — the app never needs them.
- [ ] The config validates the key format and refuses a malformed one; a good paste is `0x` + 64 hex chars.

## What must be handled operationally (outside the repo)

The repo cannot enforce these — they are people/process/cloud controls:

- **Deployer key custody.** The live deployer/owner key is a high-value secret.
  Prefer a hardware wallet or a dedicated, low-balance deployer account; rotate
  immediately if it may have been exposed; consider a multisig owner for the
  contract.
- **Secret storage & rotation.** Secrets currently live in host env / `.env`
  files. Establish a rotation cadence and a break-glass procedure. A managed
  secrets store (e.g. cloud secrets manager) is the paid Phase-3 upgrade.
- **GitHub secret scanning & push protection.** Enable these on the repo so a
  pushed secret is blocked/alerted (free for the repo).
- **Access control.** MFA and least-privilege on GitHub, the cloud account, DNS,
  the RPC provider, WalletConnect, and Vercel; review access quarterly.
- **CI secrets.** Any deploy/verify secrets used in CI belong in the CI secret
  store, never in the workflow YAML or the repo.
- **Incident response.** Have a documented path for "a secret leaked": revoke,
  rotate, redeploy, and review the audit log (`GET /audit`).

See [SOC2_READINESS.md](./SOC2_READINESS.md) for how these map to controls and
which are still outstanding.
