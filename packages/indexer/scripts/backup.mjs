#!/usr/bin/env node
/**
 * Covenant indexer — backup.
 *
 * Takes a safe, point-in-time snapshot of the indexer's SQLite database and
 * writes a compressed, checksummed artifact plus an append-only manifest log.
 *
 * WHY a real backup (not `cp covenant.db backup.db`):
 *   The indexer runs SQLite in WAL mode, so recent writes live in a separate
 *   -wal file. A plain file copy can capture a torn/incomplete database. The
 *   better-sqlite3 online `.backup()` API produces a consistent snapshot while
 *   the indexer keeps running.
 *
 * WHAT is backed up and WHY (see docs/BACKUP_RECOVERY.md for the full model):
 *   - evidence          : off-chain proof manifests. PRIVATE evidence content is
 *                         NOT on-chain — losing this row loses the content.
 *   - evidence_access   : the access audit log. NOT reconstructable from anything.
 *   - events / meta     : a cache of on-chain events. Rebuildable from the chain
 *                         via backfill, but included so recovery is fast.
 *
 * Output artifacts (in BACKUP_DIR):
 *   covenant-backup-<UTC-timestamp>.db.gz   the compressed snapshot
 *   covenant-backup-<UTC-timestamp>.db.gz.sha256   integrity checksum sidecar
 *   backup-manifest.jsonl   append-only log: one JSON line per backup (audit trail)
 *
 * Config (env):
 *   DB_PATH            source database        (default ./covenant.db)
 *   BACKUP_DIR         where artifacts go     (default ./backups)
 *   BACKUP_RETENTION   how many to keep       (default 14)
 *
 * Usage:  node scripts/backup.mjs
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./covenant.db";
const BACKUP_DIR = process.env.BACKUP_DIR || "./backups";
const RETENTION = Math.max(1, Number(process.env.BACKUP_RETENTION || 14));

const log = (msg, fields = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...fields }));

// Remove a SQLite file plus any WAL/SHM sidecars a reader may have created.
const rmDb = (p) => {
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(`${p}${s}`, { force: true });
};

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("error", reject)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    log("backup aborted: source database not found", { dbPath: DB_PATH });
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `covenant-backup-${stamp}`;
  const snapshotPath = path.join(BACKUP_DIR, `${base}.db`); // temp, removed after gzip
  const gzPath = path.join(BACKUP_DIR, `${base}.db.gz`);
  const sumPath = `${gzPath}.sha256`;

  // 1) Consistent online snapshot (safe while the indexer is running).
  const src = new Database(DB_PATH, { readonly: true });
  try {
    await src.backup(snapshotPath);
  } finally {
    src.close();
  }

  // 2) Verify the snapshot before we trust it: structural integrity + stats.
  const snap = new Database(snapshotPath, { readonly: true });
  let integrity = "unknown";
  let rows = {};
  let lastIndexedBlock = null;
  try {
    integrity = snap.pragma("integrity_check", { simple: true });
    const count = (t) => {
      try {
        return snap.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
      } catch {
        return null;
      }
    };
    rows = {
      events: count("events"),
      evidence: count("evidence"),
      evidence_access: count("evidence_access"),
    };
    try {
      const c = snap.prepare("SELECT value FROM meta WHERE key = 'last_block'").get();
      lastIndexedBlock = c ? Number(c.value) : null;
    } catch {
      /* meta may not exist on an empty db */
    }
  } finally {
    snap.close();
  }

  if (integrity !== "ok") {
    log("backup FAILED integrity check — not keeping snapshot", { integrity });
    rmDb(snapshotPath);
    process.exit(1);
  }

  // 3) Compress (streamed, so large databases don't blow up memory).
  await pipeline(
    fs.createReadStream(snapshotPath),
    zlib.createGzip({ level: 9 }),
    fs.createWriteStream(gzPath),
  );
  rmDb(snapshotPath); // keep only the compressed copy (drop the raw snapshot + sidecars)

  // 4) Checksum sidecar — the integrity anchor used at restore time.
  const digest = await sha256File(gzPath);
  const gzBytes = fs.statSync(gzPath).size;
  fs.writeFileSync(sumPath, `${digest}  ${path.basename(gzPath)}\n`);

  // 5) Append to the manifest log (an audit artifact in its own right).
  const record = {
    ts: new Date().toISOString(),
    file: path.basename(gzPath),
    bytes: gzBytes,
    sha256: digest,
    integrity,
    rows,
    lastIndexedBlock,
    sourceDb: path.resolve(DB_PATH),
  };
  fs.appendFileSync(path.join(BACKUP_DIR, "backup-manifest.jsonl"), JSON.stringify(record) + "\n");

  // 6) Retention: keep the newest RETENTION artifacts, prune older ones.
  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^covenant-backup-.*\.db\.gz$/.test(f))
    .sort(); // ISO timestamps sort chronologically
  const stale = backups.slice(0, Math.max(0, backups.length - RETENTION));
  for (const f of stale) {
    fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
    fs.rmSync(path.join(BACKUP_DIR, `${f}.sha256`), { force: true });
  }

  log("backup complete", {
    file: record.file,
    bytes: gzBytes,
    sha256: digest,
    rows,
    lastIndexedBlock,
    pruned: stale.length,
    retained: Math.min(backups.length, RETENTION),
  });
}

main().catch((err) => {
  log("backup error", { error: err.message });
  process.exit(1);
});
