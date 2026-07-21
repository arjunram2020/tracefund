# Covenant Backup & Recovery

A no-cost, low-complexity backup baseline for Covenant's **off-chain** components.
It exists so that (a) irreplaceable off-chain data survives a disk/host failure,
and (b) we can show the infrastructure and evidence that support a future SOC 2
effort. This is a readiness baseline, not a completed audit.

## The core principle: the chain is the backup for on-chain state

Covenant is deliberately chain-first. **Everything that lives on Base is already
durably replicated by the blockchain** — Covenant does not need to (and should
not try to) back it up. Only genuinely off-chain data is Covenant's own
responsibility.

### What is inherited from the blockchain vs what Covenant must own

| Data | Where it lives | Source of truth | Rebuildable from chain? | Covenant must back up? |
|---|---|---|---|---|
| Campaigns, milestones, escrow balances, approvals, submission records (summary, `manifestHash`, `manifestURI`) | Base L2 | **Chain** | Inherited — the chain *is* the backup | No |
| Indexer `events` table | SQLite | Chain | **Yes** — re-run backfill from `DEPLOY_BLOCK` | Optional (speeds recovery) |
| Indexer `meta` cursor (`last_block`) | SQLite | Derived | **Yes** — recomputed on next run | No |
| **Public** evidence manifest (creator published it on-chain as a `data:` URI) | Chain + registry | Chain | **Yes** — decode from the on-chain URI | No |
| **Private** evidence manifest content | Off-chain only: registry ciphertext + creator/reviewer copies | Covenant + capability holders | **No** | **YES** |
| Evidence registry table (`evidence`) | SQLite | Covenant | Partial (public: yes, private: no) | **YES** |
| Evidence access **audit log** (`evidence_access`) | SQLite | Covenant | **No** | **YES** |
| `EVIDENCE_ENC_KEY`, API tokens, deploy keys | env / secret store | Covenant | **No** | **YES — stored separately** |
| Deployed contract addresses (`deployedContracts.json`) | Git | Git | Yes (in version control) | No |

**Bottom line:** the only data that is truly irreplaceable if the server dies is
the `evidence` and `evidence_access` tables and the secrets that protect them.
The backup tooling captures the whole SQLite database (so recovery is fast), but
its *reason to exist* is those two tables.

## Backup scope

`packages/indexer/scripts/backup.mjs` produces, in `BACKUP_DIR` (default
`./backups`):

| File | Type | Contains |
|---|---|---|
| `covenant-backup-<UTC-timestamp>.db.gz` | gzip'd SQLite snapshot | the full indexer DB (all four tables) at a consistent point in time |
| `covenant-backup-<UTC-timestamp>.db.gz.sha256` | text checksum | SHA-256 of the artifact — the integrity anchor used at restore |
| `backup-manifest.jsonl` | append-only JSON lines | one record per backup: timestamp, filename, size, SHA-256, integrity result, per-table row counts, `lastIndexedBlock`. This log is itself an audit artifact. |

It uses SQLite's online `.backup()` (safe while the indexer is running — a plain
`cp` of a WAL-mode DB can capture a torn file), runs `PRAGMA integrity_check`
before keeping the snapshot, and prunes to the newest `BACKUP_RETENTION`
(default 14) artifacts.

## Backup procedure

```bash
# From the repo root (or the indexer package). Reads DB_PATH from the env/.env.
yarn backup
# or: cd packages/indexer && node scripts/backup.mjs
```

Config (env): `DB_PATH` (default `./covenant.db`), `BACKUP_DIR` (default
`./backups`), `BACKUP_RETENTION` (default 14).

### Recommended frequency

| Environment | Frequency | Rationale |
|---|---|---|
| Production baseline | **Daily** (cron) + before every deploy/migration | Evidence is also redundantly held (creator download + reviewer copy + browser localStorage), so a 24h RPO on the registry cache implies near-zero *effective* evidence loss. |
| Higher assurance | **Hourly** | Cheap (the DB is small); tightens RPO if evidence volume grows. |

Example cron (daily backup + offsite copy at 03:15, plus a weekly restore test):

```cron
15 3 * * *  cd /opt/covenant/packages/indexer && /usr/bin/node scripts/backup.mjs && bash scripts/offsite-copy.sh >> /var/log/covenant-backup.log 2>&1
30 3 * * 0  cd /opt/covenant/packages/indexer && /usr/bin/node scripts/restore.mjs --verify-only >> /var/log/covenant-backup.log 2>&1
```

### Getting backups off the host (do this — it's the important part)

A backup on the same machine does not survive losing that machine. Two options,
both zero/low-cost:

- **Same-host mirror** (cheapest, partial): set `BACKUP_MIRROR_DIR` to a second
  mounted volume; `backup.mjs` copies each artifact there automatically.
- **True offsite** (recommended): `scripts/offsite-copy.sh` pushes artifacts to
  another host (`OFFSITE_RSYNC=user@host:/path/`) or an object store
  (`OFFSITE_S3=s3://bucket/path/`, AWS free tier). Run it right after the backup
  (see the cron above). The destination must be private and access-controlled,
  and must **not** hold `EVIDENCE_ENC_KEY`.

### Free availability monitoring

`.github/workflows/uptime.yml` pings the indexer `/health` endpoint every 15
minutes on GitHub Actions (set the `HEALTH_URL` repo variable). A failed check
turns the run red and GitHub emails the owner, and now also opens (or comments
on) a single tracking issue labeled `uptime` — closed automatically on the next
healthy run — so a failure stays visible somewhere durable, not just a one-off
email. Zero cost, no vendor.

## Verification method

A backup you have never restored is a hope, not a backup. Two layers:

1. **At creation:** the backup script refuses to keep a snapshot unless
   `PRAGMA integrity_check` returns `ok`, and it records a SHA-256 checksum.
2. **On a schedule (restore test):**

   ```bash
   yarn restore:verify        # verifies the latest backup, touches nothing live
   ```

   This checks the SHA-256 against the sidecar, decompresses to a temp file, runs
   `integrity_check`, and reports per-table row counts and `lastIndexedBlock`. A
   non-zero exit = the backup is bad; investigate immediately. Run it weekly.

## Restore procedure

Restore **with the indexer stopped**, then restart it — it resumes live
indexing from the restored cursor and backfills any gap from the chain.

```bash
# 1. Stop the indexer (e.g. pm2 stop covenant-indexer)

# 2. Restore the latest backup over the live DB (‑‑force required to overwrite;
#    the current DB is first snapshotted to <db>.pre-restore-<timestamp>).
yarn restore --force
#   or a specific artifact / target:
#   node scripts/restore.mjs --from ./backups/covenant-backup-<ts>.db.gz --to ./covenant.db --force

# 3. Start the indexer. It backfills any blocks it missed from DEPLOY_BLOCK/cursor.
```

Because the `events` cache is chain-derived, even a somewhat stale backup fully
self-heals on restart — only the `evidence` and `evidence_access` rows are
point-in-time.

## Recovery targets (baseline, self-imposed — not audited)

| Metric | Target | Why achievable cheaply |
|---|---|---|
| **RPO** (max data loss) | ≤ 24h for registry/audit; ~0 effective for evidence content | daily backups + evidence redundancy; chain state is never lost |
| **RTO** (time to recover) | < 30 min | small SQLite file; restore is a decompress + move; chain backfill is automatic |

## Secrets & key custody (critical)

- **`EVIDENCE_ENC_KEY` must be backed up SEPARATELY from the database backups.**
  The DB is encrypted at rest with this key; storing the key alongside the
  encrypted backup defeats the purpose. Keep it in a password manager or cloud
  secret store, in a different trust domain from the backup artifacts. **If this
  key is lost, encrypted evidence rows are unrecoverable.**
- API tokens (`ADMIN_TOKEN`, `EVIDENCE_WRITE_TOKEN`) and deploy keys follow the
  same rule — see [SECURE_CONFIGURATION.md](./SECURE_CONFIGURATION.md).

## Operational caveats

- **Offsite copy is a separate step.** Backups written to `BACKUP_DIR` on the
  same host protect against DB corruption and bad deploys, **not** against loss
  of the whole instance. Copy artifacts off-box — a second EBS volume, `scp` to
  another host, or a free-tier object bucket. Do this on a schedule; it is the
  single most important addition to this baseline.
- **Client-side encrypted evidence is not operator-recoverable by design.** For
  private evidence, the indexer holds only ciphertext and never the per-manifest
  key (that lives in the capability held by the creator/reviewers). A full backup
  preserves the ciphertext and all metadata, but the operator cannot decrypt it.
  The creator's downloaded package is the human backup of that content. See
  [EVIDENCE_SECURITY_MODEL.md](./EVIDENCE_SECURITY_MODEL.md).
- **Backups contain evidence — never commit them.** `.gitignore` excludes
  `backups/` and `*.db.gz`. Treat artifacts as sensitive; restrict file
  permissions and access to the storage location.
- **Single-instance limits.** This baseline assumes one indexer host. A
  multi-instance or hot-standby setup is a later, larger step and is not required
  for the current architecture.

## What this gives us toward SOC 2 (and what it does not)

In place: a defined backup scope, an automated backup with integrity checks, a
repeatable restore, a scheduled restore-test, an append-only backup log, and
documented RPO/RTO. Still needed operationally: enforced offsite copies, a real
recurring schedule with monitoring/alerting on backup success, and periodic
evidence of restore tests being run. These are tracked in
[SOC2_READINESS.md](./SOC2_READINESS.md). We are **building toward** SOC 2
readiness, not claiming compliance.
