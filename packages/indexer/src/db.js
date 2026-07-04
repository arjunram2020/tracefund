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
    -- the keccak256 hash that Covenant stores on-chain. Access model is
    -- capability-by-hash (the hash is on-chain, so effectively "unlisted").
    -- TODO(privacy): production needs authenticated access (reviewer
    -- allowlists from the campaign's approval config, expiring links, and an
    -- access audit log) before genuinely confidential documents belong here.
    CREATE TABLE IF NOT EXISTS evidence (
      hash        TEXT PRIMARY KEY,          -- 0x-prefixed keccak256, lowercase
      manifest    TEXT NOT NULL,             -- canonical manifest JSON
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
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
