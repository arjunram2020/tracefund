import "dotenv/config";
import express from "express";
import cors from "cors";
import { createPublicClient, http, keccak256, toBytes } from "viem";
import { base } from "viem/chains";
import { COVENANT_EVENTS } from "./abi.js";
import { openDb, getCursor, setCursor, insertEvent } from "./db.js";

// ---- Config (from .env) ----------------------------------------------------
const RPC_URL = process.env.BASE_RPC_URL;
const CONTRACT = process.env.CONTRACT_ADDRESS;
const DEPLOY_BLOCK = Number(process.env.DEPLOY_BLOCK || 0);
const PORT = Number(process.env.PORT || 4000);
const DB_PATH = process.env.DB_PATH || "./covenant.db";
const CHUNK = BigInt(process.env.CHUNK_SIZE || 5000);
const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 12000);

if (!RPC_URL || !CONTRACT) {
  console.error("Missing BASE_RPC_URL or CONTRACT_ADDRESS in .env");
  process.exit(1);
}

// ---- Blockchain client -----------------------------------------------------
// A "public client" only reads from the chain (no private key, can't spend).
// This is the indexer's connection to Base Mainnet.
const client = createPublicClient({ chain: base, transport: http(RPC_URL) });

const db = openDb(DB_PATH);

// JSON can't serialize BigInt, and event amounts are BigInts. Store them as strings.
const jsonReplacer = (_key, value) =>
  typeof value === "bigint" ? value.toString() : value;

// Decode a raw log into a row and save it.
function saveLog(log) {
  const campaignId =
    log.args && log.args.campaignId !== undefined
      ? Number(log.args.campaignId)
      : null;
  insertEvent(db, {
    event_name: log.eventName,
    campaign_id: campaignId,
    block_number: Number(log.blockNumber),
    tx_hash: log.transactionHash,
    log_index: log.logIndex,
    args: JSON.stringify(log.args, jsonReplacer),
  });
}

// Fetch all Covenant events between two blocks (inclusive) and store them.
async function indexRange(fromBlock, toBlock) {
  const logs = await client.getContractEvents({
    address: CONTRACT,
    abi: COVENANT_EVENTS,
    fromBlock,
    toBlock,
  });
  for (const log of logs) saveLog(log);
  return logs.length;
}

// ---- Backfill: catch up on all history since deployment --------------------
// We scan in CHUNK-sized windows because RPC providers cap how many blocks
// you can query at once. This is also a compute lesson: do bounded work,
// save a cursor, and you can stop/restart anytime without redoing it all.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function backfill() {
  const latest = await client.getBlockNumber();
  let from = BigInt(getCursor(db, DEPLOY_BLOCK));
  let chunk = CHUNK;
  console.log(`Backfilling from block ${from} to ${latest}...`);

  while (from <= latest) {
    const to = from + chunk - 1n > latest ? latest : from + chunk - 1n;
    try {
      const count = await indexRange(from, to);
      setCursor(db, Number(to));
      if (count > 0) console.log(`  blocks ${from}-${to}: ${count} events`);
      from = to + 1n;
      await sleep(150); // be polite to the RPC; avoids rate-limit bans
    } catch (err) {
      // If the provider rejects the range, halve the chunk and retry.
      // This keeps us alive across RPCs with different getLogs limits.
      if (chunk > 10n) {
        chunk = chunk / 2n;
        console.warn(`  range rejected, shrinking chunk to ${chunk}`);
      } else {
        console.error(`  skipping blocks ${from}-${to}: ${err.shortMessage || err.message}`);
        from = to + 1n;
      }
    }
  }
  console.log("Backfill complete.");
}

// ---- Live polling: keep up with new events ---------------------------------
// Simple and provider-agnostic: every POLL_MS we ask "anything new since the
// last block I saw?" This is cheaper and more reliable than open websockets.
async function pollForever() {
  setInterval(async () => {
    try {
      const latest = await client.getBlockNumber();
      const from = BigInt(getCursor(db, DEPLOY_BLOCK)) + 1n;
      if (from > latest) return;
      const count = await indexRange(from, latest);
      setCursor(db, Number(latest));
      if (count > 0) console.log(`Live: +${count} events (to block ${latest})`);
    } catch (err) {
      console.error("Poll error:", err.shortMessage || err.message);
    }
  }, POLL_MS);
}

// ---- HTTP API --------------------------------------------------------------
// This is what your Next.js frontend calls instead of reading slowly on-chain.
function startApi() {
  const app = express();
  app.use(cors()); // let the browser frontend call us from another domain
  // Evidence manifests arrive as raw JSON bodies; cap the size defensively.
  app.use(express.text({ type: "application/json", limit: "256kb" }));

  app.get("/health", (_req, res) => {
    const last = getCursor(db, DEPLOY_BLOCK);
    res.json({ ok: true, lastIndexedBlock: last });
  });

  // Parse a query/path value as a bounded non-negative integer, or null.
  // better-sqlite3 throws on binding NaN/Infinity, which would 500 the API
  // on any malformed request — reject bad input up front instead.
  const asInt = (value, max = Number.MAX_SAFE_INTEGER) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
  };

  // All events, newest first. Filter by ?type= and ?campaignId=, cap with ?limit=.
  app.get("/events", (req, res) => {
    const { type, campaignId } = req.query;
    const limit = req.query.limit === undefined ? 100 : asInt(req.query.limit, 1000);
    if (limit === null) return res.status(400).json({ error: "invalid limit" });
    let sql = "SELECT * FROM events";
    const where = [];
    const params = [];
    if (type) (where.push("event_name = ?"), params.push(String(type)));
    if (campaignId !== undefined) {
      const cid = asInt(campaignId);
      if (cid === null) return res.status(400).json({ error: "invalid campaignId" });
      (where.push("campaign_id = ?"), params.push(cid));
    }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY block_number DESC, log_index DESC LIMIT ?";
    params.push(limit);
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map((r) => ({ ...r, args: JSON.parse(r.args) })));
  });

  // Everything that ever happened to one campaign — its full audit trail.
  app.get("/campaigns/:id", (req, res) => {
    const id = asInt(req.params.id);
    if (id === null) return res.status(400).json({ error: "invalid campaign id" });
    const rows = db
      .prepare(
        "SELECT * FROM events WHERE campaign_id = ? ORDER BY block_number ASC, log_index ASC",
      )
      .all(id);
    res.json(rows.map((r) => ({ ...r, args: JSON.parse(r.args) })));
  });

  // ---- Off-chain evidence registry -----------------------------------------
  // Full proof-package manifests, addressed by the keccak256 hash Covenant
  // stores on-chain. The server re-hashes the body before storing, so the
  // registry can never serve content that doesn't match its address —
  // reviewers get integrity for free. Access model is capability-by-hash
  // ("unlisted"); see the TODO(privacy) note in db.js for the auth roadmap.
  const isHash = (v) => /^0x[0-9a-fA-F]{64}$/.test(String(v));

  app.put("/evidence/:hash", (req, res) => {
    const hash = String(req.params.hash).toLowerCase();
    if (!isHash(hash)) return res.status(400).json({ error: "invalid hash" });
    const body = typeof req.body === "string" ? req.body : "";
    if (!body) return res.status(400).json({ error: "missing manifest body" });
    if (keccak256(toBytes(body)).toLowerCase() !== hash) {
      return res.status(400).json({ error: "manifest does not hash to the given address" });
    }
    db.prepare(
      "INSERT OR IGNORE INTO evidence (hash, manifest) VALUES (?, ?)",
    ).run(hash, body);
    res.json({ ok: true });
  });

  app.get("/evidence/:hash", (req, res) => {
    const hash = String(req.params.hash).toLowerCase();
    if (!isHash(hash)) return res.status(400).json({ error: "invalid hash" });
    const row = db.prepare("SELECT manifest FROM evidence WHERE hash = ?").get(hash);
    if (!row) return res.status(404).json({ error: "not found" });
    res.type("application/json").send(row.manifest);
  });

  // Quick counts for a dashboard.
  app.get("/stats", (_req, res) => {
    const byType = db
      .prepare("SELECT event_name, COUNT(*) AS n FROM events GROUP BY event_name")
      .all();
    const total = db.prepare("SELECT COUNT(*) AS n FROM events").get().n;
    res.json({ total, byType });
  });

  app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
}

// ---- Boot ------------------------------------------------------------------
(async () => {
  startApi(); // serve immediately (even mid-backfill)
  try {
    await backfill(); // catch up on history once
  } catch (err) {
    console.error("Backfill failed (API still serving cached data):", err.shortMessage || err.message);
  }
  pollForever(); // then stay current forever
})();
