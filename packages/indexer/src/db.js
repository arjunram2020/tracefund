// SQLite is a database that lives in a single file — no separate server to run.
// Perfect for a small indexer: zero setup, and the whole DB is just covenant.db.
// (On AWS you'd later swap this for RDS/DynamoDB; the rest of the code wouldn't change much.)
import Database from "better-sqlite3";

export function openDb(path) {
  const db = new Database(path);
  // WAL mode = faster concurrent reads (the API) while we write (the listener).
  db.pragma("journal_mode = WAL");

  // One row per on-chain event. The UNIQUE constraint means if we ever
  // re-read the same log (e.g. after a restart) we won't store duplicates.
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      event_name    TEXT NOT NULL,
      campaign_id   INTEGER,
      block_number  INTEGER NOT NULL,
      tx_hash       TEXT NOT NULL,
      log_index     INTEGER NOT NULL,
      args          TEXT NOT NULL,       -- the event's decoded data, as JSON
      created_at    TEXT DEFAULT (datetime('now')),
      UNIQUE (tx_hash, log_index)
    );

    CREATE INDEX IF NOT EXISTS idx_events_campaign ON events (campaign_id);
    CREATE INDEX IF NOT EXISTS idx_events_name     ON events (event_name);

    -- A tiny key/value table so we remember the last block we processed.
    -- This is the "cursor" — it lets the indexer resume instead of re-scanning.
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- Off-chain evidence registry: full proof-package manifests, addressed by
    -- the keccak256 hash that Covenant stores on-chain. Writes can require a
    -- bearer token (EVIDENCE_WRITE_TOKEN) and reads can be gated too
    -- (EVIDENCE_PROTECTED); when unset the registry falls back to the
    -- capability-by-hash model (the hash is on-chain, so effectively "unlisted").
    -- campaign_id/milestone_index are optional metadata (supplied by the writer,
    -- not integrity-checked) used only to scope per-reviewer read authorization
    -- and retention; manifest is NULLed (not the row deleted) on retention/
    -- deletion so the hash + timestamps stay in the audit trail as a tombstone.
    CREATE TABLE IF NOT EXISTS evidence (
      hash            TEXT PRIMARY KEY,      -- 0x-prefixed keccak256, lowercase
      manifest        TEXT,                  -- canonical manifest JSON; NULL once deleted/retention-expired
      campaign_id     INTEGER,
      milestone_index INTEGER,
      created_at      TEXT DEFAULT (datetime('now')),
      deleted_at      TEXT,
      deleted_reason  TEXT
    );

    -- Evidence access audit log. One row per evidence read/write attempt so
    -- incident response and audit sampling can reconstruct who touched what and
    -- whether it succeeded. We store only SALTED HASHES of the caller's IP and
    -- bearer token — never the raw values — so the log itself minimizes
    -- sensitive data (a SOC 2 confidentiality/privacy consideration).
    CREATE TABLE IF NOT EXISTS evidence_access (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ts            TEXT DEFAULT (datetime('now')),
      method        TEXT NOT NULL,           -- GET | PUT
      path          TEXT NOT NULL,           -- request path
      hash          TEXT,                    -- evidence hash if valid, else null
      outcome       TEXT NOT NULL,           -- ok | unauthorized | not_found | bad_request | conflict
      ip_fp         TEXT,                    -- keccak256(ip + AUDIT_SALT)
      requester_fp  TEXT,                    -- keccak256(bearer + AUDIT_SALT) or null
      user_agent    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_evidence_access_ts ON evidence_access (ts);

    -- Rate-limit counters, backed by SQLite instead of an in-process Map so
    -- the limit is SHARED across every process pointed at the same DB_PATH
    -- (e.g. multiple PM2 instances on one host, or any deployment where the
    -- DB file lives on shared storage) — closes the "per-instance/in-memory"
    -- gap for that topology. A deployment that scales to multiple hosts with
    -- independent local disks would still need a network-shared store
    -- (Redis) for a true cross-host limit; that's a further step, not this one.
    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket_key    TEXT PRIMARY KEY,   -- "<limiter name>:<client ip>"
      window_start  INTEGER NOT NULL,   -- ms epoch, floored to the window size
      count         INTEGER NOT NULL
    );
  `);

  migrateEvidenceColumns(db);
  return db;
}

// CREATE TABLE IF NOT EXISTS doesn't add columns to a table that already
// existed before this version — add them defensively for upgrades from an
// older covenant.db (fresh databases already have them from the schema above).
function migrateEvidenceColumns(db) {
  const cols = new Set(db.prepare("PRAGMA table_info(evidence)").all().map((c) => c.name));
  const add = (name, ddl) => {
    if (!cols.has(name)) db.exec(`ALTER TABLE evidence ADD COLUMN ${ddl}`);
  };
  add("campaign_id", "campaign_id INTEGER");
  add("milestone_index", "milestone_index INTEGER");
  add("deleted_at", "deleted_at TEXT");
  add("deleted_reason", "deleted_reason TEXT");
}

// Append one evidence-access audit row. Kept here so all DB shape lives in one
// file; the API layer supplies already-hashed fingerprints (never raw IP/token).
export function logEvidenceAccess(db, e) {
  db.prepare(
    `INSERT INTO evidence_access
       (method, path, hash, outcome, ip_fp, requester_fp, user_agent)
     VALUES (@method, @path, @hash, @outcome, @ip_fp, @requester_fp, @user_agent)`,
  ).run({
    method: e.method,
    path: e.path,
    hash: e.hash ?? null,
    outcome: e.outcome,
    ip_fp: e.ip_fp ?? null,
    requester_fp: e.requester_fp ?? null,
    user_agent: e.user_agent ?? null,
  });
}

// Read the most recent audit rows (admin endpoint), newest first.
export function getEvidenceAccess(db, limit) {
  return db
    .prepare("SELECT * FROM evidence_access ORDER BY id DESC LIMIT ?")
    .all(limit);
}

// Store (or overwrite, on OR IGNORE-skip re-attempt) a manifest, optionally
// tagged with the campaign/milestone it belongs to for later authorization
// scoping. Re-tombstones are impossible via this path — a deleted hash stays
// deleted (INSERT OR IGNORE never revives an existing row).
export function putEvidence(db, { hash, manifest, campaignId, milestoneIndex }) {
  db.prepare(
    `INSERT OR IGNORE INTO evidence (hash, manifest, campaign_id, milestone_index)
     VALUES (@hash, @manifest, @campaignId, @milestoneIndex)`,
  ).run({
    hash,
    manifest,
    campaignId: campaignId ?? null,
    milestoneIndex: milestoneIndex ?? null,
  });
}

export function getEvidence(db, hash) {
  return db
    .prepare("SELECT manifest, campaign_id, milestone_index, deleted_at FROM evidence WHERE hash = ?")
    .get(hash);
}

// Soft-delete: null out the manifest but keep the hash/timestamps as a
// tombstone, so the audit trail and "this locator existed and was removed"
// fact survive a data-subject deletion request or retention sweep.
export function deleteEvidence(db, hash, reason) {
  const info = db
    .prepare(
      "UPDATE evidence SET manifest = NULL, deleted_at = datetime('now'), deleted_reason = ? " +
        "WHERE hash = ? AND deleted_at IS NULL",
    )
    .run(reason, hash);
  return info.changes > 0;
}

// Retention sweep: tombstone any evidence row older than retentionDays that
// hasn't already been deleted. Returns how many rows were newly tombstoned.
export function sweepExpiredEvidence(db, retentionDays) {
  const info = db
    .prepare(
      `UPDATE evidence SET manifest = NULL, deleted_at = datetime('now'), deleted_reason = 'retention'
       WHERE deleted_at IS NULL AND created_at < datetime('now', ?)`,
    )
    .run(`-${retentionDays} days`);
  return info.changes;
}

// Same idea for the audit log: old access-attempt rows are operational
// exhaust, not evidence content, but SOC 2 retention expectations apply here
// too — don't keep fingerprinted access logs forever by default.
export function sweepExpiredAuditLogs(db, retentionDays) {
  const info = db
    .prepare("DELETE FROM evidence_access WHERE ts < datetime('now', ?)")
    .run(`-${retentionDays} days`);
  return info.changes;
}

// Fixed-window rate-limit hit, shared across processes via SQLite (see the
// rate_limits table comment above). Returns the count AFTER this hit and when
// the current window resets. UPSERT keeps this a single round-trip.
export function hitRateLimit(db, bucketKey, windowMs, now) {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  db.prepare(
    `INSERT INTO rate_limits (bucket_key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(bucket_key) DO UPDATE SET
       count = CASE WHEN excluded.window_start = rate_limits.window_start
                     THEN rate_limits.count + 1 ELSE 1 END,
       window_start = excluded.window_start`,
  ).run(bucketKey, windowStart);
  const row = db.prepare("SELECT count FROM rate_limits WHERE bucket_key = ?").get(bucketKey);
  return { count: row.count, resetAt: windowStart + windowMs };
}

// Drop rate-limit rows from windows that have already closed, so the table
// stays bounded regardless of unique-client volume.
export function sweepExpiredRateLimits(db, now) {
  const info = db.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(now);
  return info.changes;
}

export function getCursor(db, fallbackBlock) {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'last_block'").get();
  return row ? Number(row.value) : fallbackBlock;
}

export function setCursor(db, blockNumber) {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('last_block', ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(String(blockNumber));
}

// Insert one event. "OR IGNORE" skips it silently if we've seen it before.
export function insertEvent(db, e) {
  db.prepare(
    `INSERT OR IGNORE INTO events
       (event_name, campaign_id, block_number, tx_hash, log_index, args)
     VALUES (@event_name, @campaign_id, @block_number, @tx_hash, @log_index, @args)`,
  ).run(e);
}
