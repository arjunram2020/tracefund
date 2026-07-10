#!/usr/bin/env node
/**
 * Covenant indexer — restore & verify.
 *
 * Verifies a backup artifact (checksum + structural integrity) and, unless
 * running in --verify-only mode, restores it into place. Run the indexer
 * STOPPED before an actual restore.
 *
 * Modes:
 *   --verify-only   Verify a backup without touching the live DB. This is the
 *                   scheduled "restore test" that proves a backup is usable —
 *                   run it on a cron so backups are known-good, not hoped-good.
 *   (default)       Verify, then restore into --to (defaults to DB_PATH).
 *                   Requires --force to overwrite an existing database; the
 *                   current DB is first snapshotted to <target>.pre-restore-<ts>.
 *
 * Options:
 *   --from <path|latest>  backup .db.gz to use (default: latest in BACKUP_DIR)
 *   --to <path>           restore target      (default: DB_PATH)
 *   --verify-only         verify only, do not write
 *   --force               allow overwriting an existing target database
 *
 * Config (env): DB_PATH (default ./covenant.db), BACKUP_DIR (default ./backups)
 *
 * Examples:
 *   node scripts/restore.mjs --verify-only
 *   node scripts/restore.mjs --from latest --to ./covenant.db --force
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./covenant.db";
const BACKUP_DIR = process.env.BACKUP_DIR || "./backups";

const { values } = parseArgs({
  options: {
    from: { type: "string", default: "latest" },
    to: { type: "string" },
    "verify-only": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});

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

function resolveBackup(from) {
  if (from && from !== "latest") return path.resolve(from);
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^covenant-backup-.*\.db\.gz$/.test(f))
    .sort();
  return backups.length ? path.join(BACKUP_DIR, backups[backups.length - 1]) : null;
}

async function main() {
  const backupPath = resolveBackup(values.from);
  if (!backupPath || !fs.existsSync(backupPath)) {
    log("no backup found", { from: values.from, backupDir: BACKUP_DIR });
    process.exit(1);
  }

  // 1) Checksum: compare the artifact against its .sha256 sidecar if present.
  const sumPath = `${backupPath}.sha256`;
  const actual = await sha256File(backupPath);
  if (fs.existsSync(sumPath)) {
    const expected = fs.readFileSync(sumPath, "utf8").trim().split(/\s+/)[0];
    if (expected !== actual) {
      log("CHECKSUM MISMATCH — backup is corrupt, refusing to use", {
        backup: backupPath,
        expected,
        actual,
      });
      process.exit(1);
    }
  } else {
    log("warning: no .sha256 sidecar — skipping checksum verification", { backup: backupPath });
  }

  // 2) Decompress to a temp file and structurally verify it.
  const tmp = path.join(BACKUP_DIR, ".restore-verify.tmp.db");
  fs.rmSync(tmp, { force: true });
  await pipeline(fs.createReadStream(backupPath), zlib.createGunzip(), fs.createWriteStream(tmp));

  const db = new Database(tmp, { readonly: true });
  let integrity = "unknown";
  let rows = {};
  let lastIndexedBlock = null;
  try {
    integrity = db.pragma("integrity_check", { simple: true });
    const count = (t) => {
      try {
        return db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
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
      const c = db.prepare("SELECT value FROM meta WHERE key = 'last_block'").get();
      lastIndexedBlock = c ? Number(c.value) : null;
    } catch {
      /* ignore */
    }
  } finally {
    db.close();
  }

  log("backup verified", { backup: path.basename(backupPath), integrity, rows, lastIndexedBlock, sha256: actual });

  if (integrity !== "ok") {
    log("verification FAILED — integrity check did not return ok", { integrity });
    rmDb(tmp);
    process.exit(1);
  }

  // 3) Verify-only (the scheduled restore test): stop here, leave the live DB alone.
  if (values["verify-only"]) {
    rmDb(tmp);
    log("verify-only complete — backup is restorable", { backup: path.basename(backupPath) });
    return;
  }

  // 4) Restore. Guard against clobbering a live database without intent.
  const target = path.resolve(values.to || DB_PATH);
  if (fs.existsSync(target) && !values.force) {
    rmDb(tmp);
    log("refusing to overwrite existing database without --force", { target });
    process.exit(1);
  }

  // Snapshot the current DB first, so a bad restore is itself reversible.
  if (fs.existsSync(target)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const preRestore = `${target}.pre-restore-${stamp}`;
    fs.copyFileSync(target, preRestore);
    log("current database preserved before restore", { preRestore: path.basename(preRestore) });
  }

  // Remove stale WAL/SHM sidecars so the restored DB isn't reopened with an old WAL.
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${target}${suffix}`, { force: true });

  // Drop the temp DB's WAL/SHM sidecars (created during verification) before moving.
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${tmp}${suffix}`, { force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(tmp, target);

  log("restore complete", { target, rows, lastIndexedBlock, note: "start the indexer to resume live indexing" });
}

main().catch((err) => {
  log("restore error", { error: err.message });
  process.exit(1);
});
