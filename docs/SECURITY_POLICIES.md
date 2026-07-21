# Covenant Security Policies

Short, working policies describing how Covenant actually operates today —
not aspirational or legally-drafted documents. Each section says what the
control is, where it's enforced (code vs. process), and what's still missing.
This is a starting point for a SOC 2 readiness assessment, not a substitute
for one. See [SOC2_READINESS.md](./SOC2_READINESS.md) for the overall framing.

## Access control

**Production systems in scope:** AWS/EC2 (hosting), the domain registrar/DNS,
GitHub (source + CI/CD secrets), the RPC provider account (if using a paid
tier), and any WalletConnect Cloud project.

- Access to each system is limited to the people who operate Covenant day to
  day. There is currently no automated access-review tooling — reviewing who
  has access to what is a manual, periodic task (see
  [OPERATIONAL_ACCESS_CHECKLIST.md](./OPERATIONAL_ACCESS_CHECKLIST.md)).
- Application-level secrets (`EVIDENCE_WRITE_TOKEN`, `ADMIN_TOKEN`,
  `AUDIT_SALT`, `EVIDENCE_ENC_KEY`, the deployer private key) are never
  committed to git (`.gitignore` excludes every `.env*` except `*.example`)
  and are documented in
  [SECURE_CONFIGURATION.md](./SECURE_CONFIGURATION.md).
- On-chain admin power (`Covenant.owner()`) is currently a single EOA, not a
  multisig — see M2 in
  [CONTRACT_SECURITY_REVIEW.md](./CONTRACT_SECURITY_REVIEW.md). Treat the
  deployer/owner key with the same care as production infrastructure
  credentials.
- The indexer's `/audit` endpoint and evidence write/read tokens are
  capability-based (bearer tokens), not tied to individual named identities,
  except when `EVIDENCE_ACCESS_MODE=per-reviewer` is enabled (see
  [EVIDENCE_SECURITY_MODEL.md](./EVIDENCE_SECURITY_MODEL.md)).

**Not yet in place:** MFA enforcement across every system above, a documented
approval workflow for granting new access, and a recurring (e.g. quarterly)
access review. Tracked in
[OPERATIONAL_ACCESS_CHECKLIST.md](./OPERATIONAL_ACCESS_CHECKLIST.md).

## Change management

- All application and contract code changes go through git; CI
  (`.github/workflows/`) runs the Hardhat test suite, CodeQL, and a
  dependency audit on every push/PR.
- **Smart contract changes are the highest-stakes change type.** Because
  `Covenant.sol` is immutable once deployed and holds real USDC, any contract
  change requires: full test suite passing locally and in CI, a written
  entry in this repo's security-review docs describing the change and its
  risk, redeployment via `packages/hardhat/scripts/deploy.ts` (which
  independently validates the USDC token and verifies the deployment before
  it's considered live), Basescan re-verification, and a frontend ABI
  re-export (`packages/nextjs/contracts/deployedContracts.json`). An external
  audit before scaling real value is recommended and not yet done.
- Application/indexer changes (frontend, indexer API) are lower-stakes —
  they don't hold funds — but should still go through the same
  branch → CI → review → merge flow rather than direct edits on a running
  server.
- There is no formal, separate "change advisory board" process; for a
  small team this is intentional (process overhead should scale with team
  size), but it means change approval today is implicit in code review, not a
  documented gate.

## Incident response

- **Vulnerability reports:** [SECURITY.md](../SECURITY.md) (repo root)
  documents private disclosure, scope, and a safe-harbor commitment.
- **Detection:** structured JSON logs from the indexer (one line per event,
  suitable for any log pipeline), the `evidence_access` audit table (queryable
  via the admin-only `GET /audit`), and the free GitHub Actions `/health`
  uptime cron (`.github/workflows/uptime.yml`).
- **Smart-contract incident response:** `Covenant.pause()` (owner-only) halts
  new campaigns, donations, and proof reviews — it never blocks
  `claimRefund`, `cancelCampaign`, `submitProof`, or `failCampaign`, so users
  can always exit even mid-incident. This is implemented and tested in
  source; it takes effect on the next redeploy (see
  [CONTRACT_SECURITY_REVIEW.md](./CONTRACT_SECURITY_REVIEW.md) M1).
- **What's missing:** a written escalation path (who gets paged, in what
  order), a tabletop exercise, and a post-incident review template. There is
  currently no paging/alerting integration — the uptime cron logs failures in
  GitHub Actions but does not notify anyone in real time (tracked in
  SOC2_READINESS.md as "uptime monitoring + alerting").

## Data retention

- **On-chain data** is permanent by nature (Base is a public, immutable
  ledger) — this is a property of the platform, not a Covenant retention
  choice. Covenant deliberately keeps sensitive detail off-chain for this
  reason (see [EVIDENCE_SECURITY_MODEL.md](./EVIDENCE_SECURITY_MODEL.md)).
- **Off-chain evidence** (proof-package manifests/ciphertext in the
  indexer's SQLite DB) now has an explicit lifecycle: `DELETE
  /evidence/:hash` (admin-only) for immediate manual deletion (e.g. a
  data-subject request), and `EVIDENCE_RETENTION_DAYS` for an automatic
  age-based sweep. Both are opt-in — a deployment that sets neither keeps
  evidence indefinitely, which is the current default.
- **Audit logs** (`evidence_access` table) can be similarly retention-swept
  via `AUDIT_RETENTION_DAYS`; also opt-in, unset by default.
- **Backups** follow `BACKUP_RETENTION` (see
  [BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md)) — a backup that captures data
  before a retention sweep would delete it is an accepted tradeoff of
  point-in-time backups; if strict deletion compliance matters for your
  deployment, ensure your backup retention window is not longer than your
  data retention commitment.

## Vendor management

Third parties Covenant currently depends on:

| Vendor | Role | Data exposure |
|---|---|---|
| Base (Coinbase L2) | Blockchain the contract runs on | Public on-chain data only |
| RPC provider (Alchemy, public Base RPC, or similar) | Reads/writes chain data | Sees wallet addresses, tx data — no off-chain evidence content |
| WalletConnect Cloud | Wallet connection relay | Sees connection metadata, not evidence content |
| AWS (EC2 hosting) | Runs the frontend + indexer | Full access to whatever is on the host, including secrets in `.env` |
| GitHub | Source control + CI | Full repo access; Actions secrets if configured |

There is no formal vendor risk-assessment process yet (e.g. reviewing each
vendor's own security posture, SOC 2 reports, or DPAs) — this is a Phase 2/3
item, not currently done.

## Honest positioning

This document describes what Covenant actually does today. It is a working
reference for an eventual formal ISMS (information security management
system), not one itself. Do not represent this document as an
auditor-reviewed policy set.
