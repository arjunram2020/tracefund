#!/usr/bin/env bash
#
# Copy Covenant backup artifacts OFF the current host — the step that protects
# against losing the whole instance (a same-host mirror does not). Zero-cost:
# uses tools you already have (rsync/scp) or the AWS free tier (S3).
#
# Pick ONE destination via env:
#   OFFSITE_RSYNC="user@host:/path/covenant-backups/"   # rsync over SSH
#   OFFSITE_S3="s3://your-bucket/covenant-backups/"      # requires awscli
# Optional:
#   BACKUP_DIR=./backups   (default; where backup.mjs writes)
#
# Run it right after backup.mjs, e.g. in the same cron line:
#   node scripts/backup.mjs && bash scripts/offsite-copy.sh
#
# IMPORTANT: backups contain evidence (even encrypted) and the access audit log.
# The destination must be private and access-controlled, and the evidence
# encryption key (EVIDENCE_ENC_KEY) must NOT live there — keep it separate.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "offsite-copy: BACKUP_DIR '$BACKUP_DIR' does not exist — nothing to copy." >&2
  exit 1
fi

if [ -n "${OFFSITE_RSYNC:-}" ]; then
  echo "offsite-copy: rsync '$BACKUP_DIR/' -> '$OFFSITE_RSYNC'"
  # -a archive, -z compress, --partial resume; only backup artifacts + checksums.
  rsync -az --partial \
    --include='covenant-backup-*.db.gz' \
    --include='covenant-backup-*.db.gz.sha256' \
    --include='backup-manifest.jsonl' \
    --exclude='*' \
    "$BACKUP_DIR/" "$OFFSITE_RSYNC"
  echo "offsite-copy: rsync done."
elif [ -n "${OFFSITE_S3:-}" ]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "offsite-copy: awscli not installed but OFFSITE_S3 set." >&2
    exit 1
  fi
  echo "offsite-copy: aws s3 sync '$BACKUP_DIR/' -> '$OFFSITE_S3'"
  aws s3 sync "$BACKUP_DIR/" "$OFFSITE_S3" \
    --exclude '*' \
    --include 'covenant-backup-*.db.gz' \
    --include 'covenant-backup-*.db.gz.sha256' \
    --include 'backup-manifest.jsonl'
  echo "offsite-copy: s3 sync done."
else
  echo "offsite-copy: set OFFSITE_RSYNC or OFFSITE_S3 to choose a destination." >&2
  exit 1
fi
