# Backup & Recovery

**Question this answers:** If our servers fail, what data survives and how do we
get back up?

This is the one-page summary. The full runbook is
[BACKUP_RECOVERY.md](../BACKUP_RECOVERY.md).

## The key idea: the blockchain is its own backup

Everything about funds, campaigns, milestones, and approvals lives on the Base
blockchain, which is durably replicated across the network. **We don't back that
up — we can't lose it.** Our backup job is only the small amount of data that
lives *off* the chain.

## What we back up

| Data | Rebuildable from chain? | We back it up |
|---|---|---|
| Campaigns, escrow, approvals (on-chain) | Inherited — the chain is the backup | No need |
| Event cache (indexer) | Yes — rebuilds automatically | Yes, for fast recovery |
| **Private evidence content** | **No** | **Yes — critical** |
| **Evidence access audit log** | **No** | **Yes — critical** |

## What's implemented

- **A one-command backup:** `yarn backup` takes a consistent snapshot of the
  off-chain database, compresses it, records a checksum, and appends a log entry.
  ✅ Implemented
- **A restore command:** `yarn restore --force` restores the latest good backup
  (and first snapshots the current DB so the restore is itself reversible).
  ✅ Implemented
- **A restore test:** `yarn restore:verify` proves a backup is actually usable
  (checksum + integrity check) without touching live data — because an untested
  backup is just a hope. ✅ Implemented
- **Recovery targets:** aim for ≤ 24h of potential data loss and < 30 min to
  recover. ✅ Documented

## What's operational (not automated yet)

- **A running schedule.** The scripts exist; a cron job (daily backup + weekly
  restore test) needs to be enabled on the server. 🟡 Partial
- **Offsite copies.** Backups must be copied off the server (another disk, host,
  or a free-tier bucket) so we survive losing the whole instance. 🟡 Partial
- **Alerting on backup success/failure.** ⬜ Planned

## Important caveat for customers

For **private, client-encrypted** evidence, our backup preserves the encrypted
bytes — but not the ability to read them, because we never hold the key. Your
downloaded copy of the evidence is the human backup of that content. This is a
deliberate confidentiality choice, not a gap.
