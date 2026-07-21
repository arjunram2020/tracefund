import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { createPublicClient, http, keccak256, toBytes, verifyMessage, isAddress } from "viem";
import { base } from "viem/chains";
import { COVENANT_EVENTS, COVENANT_READS } from "./abi.js";
import {
  openDb,
  getCursor,
  setCursor,
  insertEvent,
  logEvidenceAccess,
  getEvidenceAccess,
  putEvidence,
  getEvidence,
  deleteEvidence,
  sweepExpiredEvidence,
  sweepExpiredAuditLogs,
  hitRateLimit,
  sweepExpiredRateLimits,
} from "./db.js";

// ---- Config (from .env) ----------------------------------------------------
const RPC_URL = process.env.BASE_RPC_URL;
const CONTRACT = process.env.CONTRACT_ADDRESS;
const DEPLOY_BLOCK = Number(process.env.DEPLOY_BLOCK || 0);
const PORT = Number(process.env.PORT || 4000);
const DB_PATH = process.env.DB_PATH || "./covenant.db";
const CHUNK = BigInt(process.env.CHUNK_SIZE || 5000);
const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 12000);

// ---- Security config (all optional; safe, permissive dev defaults) ---------
// In production (NODE_ENV=production) the critical controls below are REQUIRED:
// the server fails closed rather than running open (see the startup check).
const IS_PROD = process.env.NODE_ENV === "production";
// Comma-separated CORS allowlist. When unset we allow all origins (dev) and warn.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Bearer token required to WRITE evidence. When unset, writes stay open (dev).
const EVIDENCE_WRITE_TOKEN = process.env.EVIDENCE_WRITE_TOKEN || "";
// When "true", evidence READS also require the write token (confidential mode).
const EVIDENCE_PROTECTED = process.env.EVIDENCE_PROTECTED === "true";
// Bearer token for the admin-only audit endpoint. When unset, /audit is disabled.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
// Salt for one-way hashing of IP/token fingerprints in the audit log so we never
// store raw IPs or tokens. MUST be a secret: a public/guessable salt lets anyone
// brute-force the small IPv4 space and reverse the "de-identified" fingerprints.
// Required in production (fail-closed check below); in dev we fall back to a
// random per-boot salt so fingerprints stay non-reversible (they just won't
// correlate across restarts, which is fine for local work).
const AUDIT_SALT_SET = Boolean(process.env.AUDIT_SALT);
const AUDIT_SALT = process.env.AUDIT_SALT || crypto.randomBytes(32).toString("hex");
// Optional 32-byte key (hex or base64) for encrypting evidence AT REST. Defense
// in depth: a stolen DB file or backup is useless without it. Unset = store as
// received (dev). NOTE: this is independent of client-side encryption — clients
// may already send ciphertext, in which case this double-wraps it harmlessly.
const EVIDENCE_ENC_KEY = (() => {
  const raw = process.env.EVIDENCE_ENC_KEY || "";
  if (!raw) return null;
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "EVIDENCE_ENC_KEY must be 32 bytes (64 hex chars or base64)",
      }),
    );
    process.exit(1);
  }
  return key;
})();
// Rate limiting per client IP (fixed window). Generous defaults; the sensitive
// limit throttles evidence writes and admin-audit calls to slow token guessing.
const RL_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RL_MAX = Number(process.env.RATE_LIMIT_MAX || 300);
const RL_SENSITIVE_MAX = Number(process.env.RATE_LIMIT_SENSITIVE_MAX || 30);
// "token" (default): EVIDENCE_PROTECTED reads require the shared write token —
// anyone holding it can read any campaign's evidence. "per-reviewer": reads
// require a wallet signature, checked live against on-chain isReviewer()/the
// campaign creator for the hash's recorded campaign — no shared secret, and
// "revocation" tracks whatever the chain currently considers authorized.
// Falls back to the shared token for rows written before this existed (no
// campaign_id recorded) so older data doesn't become unreadable.
const EVIDENCE_ACCESS_MODE = process.env.EVIDENCE_ACCESS_MODE === "per-reviewer" ? "per-reviewer" : "token";
// How long a signed access message stays valid, to bound replay of a captured signature+URL.
const EVIDENCE_SIG_MAX_AGE_MS = Number(process.env.EVIDENCE_SIG_MAX_AGE_MS || 5 * 60 * 1000);
// Retention (days). Unset/0 = keep indefinitely (current behavior, unchanged).
const EVIDENCE_RETENTION_DAYS = Number(process.env.EVIDENCE_RETENTION_DAYS || 0);
const AUDIT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS || 0);
const RETENTION_SWEEP_MS = Number(process.env.RETENTION_SWEEP_INTERVAL_MS || 6 * 60 * 60 * 1000);

// ---- Structured logger -----------------------------------------------------
// One JSON object per line: greppable and ingestible by any log pipeline
// (CloudWatch, Loki, etc.) — the parseable, centralizable format SOC 2
// monitoring expects. NEVER pass secrets in `fields`; only salted fingerprints
// or non-sensitive values (the audit trail already lives in the DB).
function slog(level, msg, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

if (!RPC_URL || !CONTRACT) {
  slog("error", "missing required config", {
    missing: [!RPC_URL && "BASE_RPC_URL", !CONTRACT && "CONTRACT_ADDRESS"].filter(Boolean),
  });
  process.exit(1);
}

// Safer default config: in production, refuse to boot if a critical security
// control is unset (fail closed). In dev we only warn so local work stays easy.
const insecure = [];
if (ALLOWED_ORIGINS.length === 0) insecure.push("ALLOWED_ORIGINS");
if (!EVIDENCE_WRITE_TOKEN) insecure.push("EVIDENCE_WRITE_TOKEN");
if (!ADMIN_TOKEN) insecure.push("ADMIN_TOKEN");
if (!AUDIT_SALT_SET) insecure.push("AUDIT_SALT");
if (!EVIDENCE_ENC_KEY) insecure.push("EVIDENCE_ENC_KEY");
if (IS_PROD && insecure.length) {
  slog("error", "refusing to start: required security env vars unset in production", {
    missing: insecure,
  });
  process.exit(1);
}
for (const control of insecure) {
  slog("warn", "security control unset — permissive dev behavior", { control });
}
// Misconfiguration that would FAIL OPEN in any environment: "confidential mode"
// with no token means safeEqual("", "") matches and protected reads are public.
// Refuse to run rather than silently serve protected evidence unauthenticated.
if (EVIDENCE_PROTECTED && !EVIDENCE_WRITE_TOKEN) {
  slog("error", "refusing to start: EVIDENCE_PROTECTED=true requires EVIDENCE_WRITE_TOKEN");
  process.exit(1);
}

// ---- Blockchain client -----------------------------------------------------
// A "public client" only reads from the chain (no private key, can't spend).
// This is the indexer's connection to Base Mainnet.
const client = createPublicClient({ chain: base, transport: http(RPC_URL) });

// Live on-chain authorization check for EVIDENCE_ACCESS_MODE=per-reviewer:
// true if `address` currently holds review authority for the campaign (any
// approval model) or is the campaign's creator. This reads the CURRENT chain
// state on every request — there is no separate grant/revoke list to keep in
// sync, and it naturally reflects e.g. an owner change for PlatformOperator
// campaigns. It does NOT retroactively support removing one individual
// DesignatedReviewers address (that list is fixed on-chain at creation — a
// contract-level limitation, see docs/CONTRACT_SECURITY_REVIEW.md L4).
async function isAuthorizedForCampaign(campaignId, address) {
  const [isReviewer, campaign] = await Promise.all([
    client.readContract({
      address: CONTRACT,
      abi: COVENANT_READS,
      functionName: "isReviewer",
      args: [BigInt(campaignId), address],
    }),
    client.readContract({
      address: CONTRACT,
      abi: COVENANT_READS,
      functionName: "getCampaign",
      args: [BigInt(campaignId)],
    }),
  ]);
  return isReviewer || campaign.creator.toLowerCase() === address.toLowerCase();
}

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
  slog("info", "backfill starting", { from: String(from), to: String(latest) });

  while (from <= latest) {
    const to = from + chunk - 1n > latest ? latest : from + chunk - 1n;
    try {
      const count = await indexRange(from, to);
      setCursor(db, Number(to));
      if (count > 0)
        slog("info", "backfill range indexed", { from: String(from), to: String(to), count });
      from = to + 1n;
      await sleep(150); // be polite to the RPC; avoids rate-limit bans
    } catch (err) {
      // If the provider rejects the range, halve the chunk and retry.
      // This keeps us alive across RPCs with different getLogs limits.
      if (chunk > 10n) {
        chunk = chunk / 2n;
        slog("warn", "range rejected, shrinking chunk", { chunk: String(chunk) });
      } else {
        slog("error", "skipping block range", {
          from: String(from),
          to: String(to),
          error: err.shortMessage || err.message,
        });
        from = to + 1n;
      }
    }
  }
  slog("info", "backfill complete");
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
      if (count > 0) slog("info", "live events indexed", { count, toBlock: String(latest) });
    } catch (err) {
      slog("error", "poll error", { error: err.shortMessage || err.message });
    }
  }, POLL_MS);
}

// ---- HTTP API --------------------------------------------------------------
// This is what your Next.js frontend calls instead of reading slowly on-chain.
// ---- Security helpers ------------------------------------------------------
// Extract a bearer token from the Authorization header, or "" if absent.
function bearer(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  return m ? m[1] : "";
}

// Constant-time string compare — avoids leaking token length/content via timing.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// One-way salted fingerprint so the audit log never stores raw IPs or tokens.
const fingerprint = (value) =>
  value ? keccak256(toBytes(`${AUDIT_SALT}:${value}`)) : null;

// ---- Encryption at rest ----------------------------------------------------
// AES-256-GCM. Stored form: "enc:v1:" + base64(iv[12] | tag[16] | ciphertext).
// Rows without the prefix are treated as legacy plaintext (backward compatible),
// so enabling the key does not break existing data — new writes get encrypted.
const ENC_PREFIX = "enc:v1:";
function encryptAtRest(plaintext) {
  if (!EVIDENCE_ENC_KEY) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", EVIDENCE_ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}
function decryptAtRest(stored) {
  if (!stored || !stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext
  if (!EVIDENCE_ENC_KEY) throw new Error("encrypted row but EVIDENCE_ENC_KEY unset");
  const buf = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", EVIDENCE_ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Best-effort client IP behind Nginx (trust proxy is enabled below).
const clientIp = (req) => req.ip || req.socket?.remoteAddress || "";

// Fixed-window rate limiter, keyed by client IP and backed by the SQLite
// rate_limits table (see db.js) rather than an in-process Map — so the limit
// is shared across every process pointed at the same DB_PATH, not reset by a
// restart or bypassed by round-robin across multiple instances on one host.
// Rejections are logged (with a salted IP fingerprint, never the raw IP) so
// abuse and token-guessing attempts show up in the structured log.
function makeRateLimiter({ windowMs, max, name }) {
  // Periodic sweep keeps the table bounded regardless of unique-IP volume.
  const sweep = setInterval(() => sweepExpiredRateLimits(db, Date.now()), windowMs);
  sweep.unref?.(); // don't keep the process alive just for cleanup
  return (req, res, next) => {
    const now = Date.now();
    const ip = clientIp(req) || "unknown";
    const { count, resetAt } = hitRateLimit(db, `${name}:${ip}`, windowMs, now);
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - count)));
    if (count > max) {
      res.set("Retry-After", String(Math.ceil((resetAt - now) / 1000)));
      slog("warn", "rate limit exceeded", {
        limiter: name,
        ip_fp: fingerprint(ip),
        path: req.path,
      });
      return res.status(429).json({ error: "too many requests" });
    }
    next();
  };
}

// Canonical message a reviewer/creator signs to prove wallet ownership for a
// per-reviewer evidence read. Keeping it a plain, human-readable string (not a
// hash) lets a wallet show the user exactly what they're signing.
function evidenceAccessMessage(hash, campaignId, timestamp) {
  return `Covenant evidence access\nhash: ${hash}\ncampaignId: ${campaignId}\ntimestamp: ${timestamp}`;
}

// Verify the request carries a fresh, valid signature from `address` proving
// they currently hold review/creator authority over `campaignId`. Expects
// ?address=0x..&signature=0x..&timestamp=<ms> on the GET request.
async function checkPerReviewerAuth(req, campaignId) {
  const { address, signature, timestamp } = req.query;
  if (!address || !signature || !timestamp || !isAddress(String(address))) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > EVIDENCE_SIG_MAX_AGE_MS) return false;
  const hash = String(req.params.hash).toLowerCase();
  const message = evidenceAccessMessage(hash, campaignId, timestamp);
  const validSig = await verifyMessage({ address: String(address), message, signature: String(signature) });
  if (!validSig) return false;
  return isAuthorizedForCampaign(campaignId, String(address));
}

function startApi() {
  const app = express();
  // Behind Nginx: honor X-Forwarded-For so req.ip reflects the real client.
  app.set("trust proxy", true);
  app.disable("x-powered-by"); // don't advertise Express/version to attackers

  // Baseline security response headers on every route (no extra dependency).
  // HSTS only matters once served over HTTPS (Nginx terminates TLS in prod).
  app.use((_req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    res.set("Referrer-Policy", "no-referrer");
    res.set("Cross-Origin-Resource-Policy", "same-site");
    // This API only ever serves JSON, never HTML — deny every content type a
    // browser could execute or render, not just framing.
    res.set(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; script-src 'none'; style-src 'none'; " +
        "img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
    res.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    next();
  });

  // CORS: restrict to an explicit allowlist in production; fall back to open in dev.
  app.use(cors(ALLOWED_ORIGINS.length ? { origin: ALLOWED_ORIGINS } : {}));
  // Evidence manifests arrive as raw JSON bodies; cap the size defensively.
  app.use(express.text({ type: "application/json", limit: "256kb" }));

  // General per-IP rate limit on all routes; a stricter one guards the
  // security-sensitive write/admin routes (applied per-route below).
  app.use(makeRateLimiter({ windowMs: RL_WINDOW_MS, max: RL_MAX, name: "general" }));
  const sensitiveLimit = makeRateLimiter({
    windowMs: RL_WINDOW_MS,
    max: RL_SENSITIVE_MAX,
    name: "sensitive",
  });

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
    if (type !== undefined) {
      const t = String(type);
      if (t.length > 64) return res.status(400).json({ error: "invalid type" });
      where.push("event_name = ?"), params.push(t);
    }
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
  // reviewers get integrity for free. Writes require EVIDENCE_WRITE_TOKEN when
  // set; reads additionally require it when EVIDENCE_PROTECTED=true. Every
  // access attempt is audit-logged (below) for incident response.
  const isHash = (v) => /^0x[0-9a-fA-F]{64}$/.test(String(v));

  // Record one evidence-access attempt with salted, non-reversible fingerprints.
  const audit = (req, outcome, hash) =>
    logEvidenceAccess(db, {
      method: req.method,
      path: req.path,
      hash: hash ?? null,
      outcome,
      ip_fp: fingerprint(clientIp(req)),
      requester_fp: fingerprint(bearer(req)),
      user_agent: (req.headers["user-agent"] || "").slice(0, 256),
    });

  app.put("/evidence/:hash", sensitiveLimit, (req, res) => {
    const hash = String(req.params.hash).toLowerCase();
    // AuthN first, before we reveal whether the hash is valid or already stored.
    if (EVIDENCE_WRITE_TOKEN && !safeEqual(bearer(req), EVIDENCE_WRITE_TOKEN)) {
      audit(req, "unauthorized", isHash(hash) ? hash : null);
      return res.status(401).json({ error: "unauthorized" });
    }
    if (!isHash(hash)) {
      audit(req, "bad_request", null);
      return res.status(400).json({ error: "invalid hash" });
    }
    const body = typeof req.body === "string" ? req.body : "";
    if (!body) {
      audit(req, "bad_request", hash);
      return res.status(400).json({ error: "missing manifest body" });
    }
    if (keccak256(toBytes(body)).toLowerCase() !== hash) {
      audit(req, "bad_request", hash);
      return res.status(400).json({ error: "manifest does not hash to the given address" });
    }
    // Optional scoping metadata, supplied by the writer (not integrity-checked
    // — the hash already guarantees the manifest body). Used only to target
    // per-reviewer read authorization at the right campaign.
    const campaignId = asInt(req.query.campaignId);
    const milestoneIndex = asInt(req.query.milestoneIndex);
    // Integrity is verified against the plaintext body above; we persist an
    // at-rest-encrypted copy so a stolen DB file can't reveal manifests.
    putEvidence(db, { hash, manifest: encryptAtRest(body), campaignId, milestoneIndex });
    audit(req, "ok", hash);
    res.json({ ok: true });
  });

  app.get("/evidence/:hash", async (req, res) => {
    const hash = String(req.params.hash).toLowerCase();
    if (!isHash(hash)) {
      audit(req, "bad_request", null);
      return res.status(400).json({ error: "invalid hash" });
    }
    const row = getEvidence(db, hash);
    if (!row) {
      audit(req, "not_found", hash);
      return res.status(404).json({ error: "not found" });
    }
    if (row.deleted_at) {
      audit(req, "not_found", hash); // don't distinguish "deleted" from "never existed" for outsiders
      return res.status(410).json({ error: "evidence deleted" });
    }
    if (EVIDENCE_PROTECTED) {
      if (EVIDENCE_ACCESS_MODE === "per-reviewer" && row.campaign_id !== null) {
        const authorized = await checkPerReviewerAuth(req, row.campaign_id).catch((err) => {
          slog("warn", "per-reviewer auth check failed", { error: err.message });
          return false;
        });
        if (!authorized) {
          audit(req, "unauthorized", hash);
          return res.status(403).json({ error: "not an authorized reviewer for this campaign" });
        }
      } else if (!safeEqual(bearer(req), EVIDENCE_WRITE_TOKEN)) {
        // Shared-token fallback: per-reviewer mode with no recorded campaign
        // (legacy rows), or per-reviewer mode not enabled.
        audit(req, "unauthorized", hash);
        return res.status(401).json({ error: "unauthorized" });
      }
    }
    let manifest;
    try {
      manifest = decryptAtRest(row.manifest);
    } catch (err) {
      audit(req, "error", hash);
      slog("error", "evidence decrypt failed", { error: err.message });
      return res.status(500).json({ error: "evidence unavailable" });
    }
    audit(req, "ok", hash);
    res.type("application/json").send(manifest);
  });

  // Data-subject / retention-driven manual deletion. Admin-only: this removes
  // the manifest content (tombstoned, not row-deleted — see deleteEvidence)
  // ahead of any automatic EVIDENCE_RETENTION_DAYS sweep.
  app.delete("/evidence/:hash", sensitiveLimit, (req, res) => {
    if (!ADMIN_TOKEN) return res.status(404).json({ error: "not found" });
    if (!safeEqual(bearer(req), ADMIN_TOKEN)) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const hash = String(req.params.hash).toLowerCase();
    if (!isHash(hash)) return res.status(400).json({ error: "invalid hash" });
    const reason = typeof req.query.reason === "string" ? req.query.reason.slice(0, 200) : "manual";
    const deleted = deleteEvidence(db, hash, reason);
    audit(req, deleted ? "ok" : "not_found", hash);
    if (!deleted) return res.status(404).json({ error: "not found or already deleted" });
    res.json({ ok: true });
  });

  // ---- Admin-only audit endpoint -------------------------------------------
  // Disabled unless ADMIN_TOKEN is set. Returns recent evidence-access rows for
  // incident response and audit sampling. Fingerprints are one-way hashes, so
  // this cannot leak raw IPs or tokens even to an operator.
  app.get("/audit", sensitiveLimit, (req, res) => {
    if (!ADMIN_TOKEN) return res.status(404).json({ error: "not found" });
    if (!safeEqual(bearer(req), ADMIN_TOKEN)) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const limit = req.query.limit === undefined ? 100 : asInt(req.query.limit, 1000);
    if (limit === null) return res.status(400).json({ error: "invalid limit" });
    res.json(getEvidenceAccess(db, limit));
  });

  // Quick counts for a dashboard.
  app.get("/stats", (_req, res) => {
    const byType = db
      .prepare("SELECT event_name, COUNT(*) AS n FROM events GROUP BY event_name")
      .all();
    const total = db.prepare("SELECT COUNT(*) AS n FROM events").get().n;
    res.json({ total, byType });
  });

  app.listen(PORT, () =>
    slog("info", "api listening", {
      port: PORT,
      corsAllowlist: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : "all (dev)",
      evidenceWriteAuth: Boolean(EVIDENCE_WRITE_TOKEN),
      evidenceProtectedReads: EVIDENCE_PROTECTED,
      evidenceAccessMode: EVIDENCE_ACCESS_MODE,
      evidenceEncryptedAtRest: Boolean(EVIDENCE_ENC_KEY),
      evidenceRetentionDays: EVIDENCE_RETENTION_DAYS || "unset (keep indefinitely)",
      auditRetentionDays: AUDIT_RETENTION_DAYS || "unset (keep indefinitely)",
      auditEndpoint: Boolean(ADMIN_TOKEN),
    }),
  );
}

// ---- Retention sweeps -------------------------------------------------------
// Runs on an interval rather than only at startup, so a long-lived process
// doesn't need a restart to enforce a retention policy set after boot.
function startRetentionSweeps() {
  if (!EVIDENCE_RETENTION_DAYS && !AUDIT_RETENTION_DAYS) return;
  const sweep = () => {
    try {
      if (EVIDENCE_RETENTION_DAYS) {
        const n = sweepExpiredEvidence(db, EVIDENCE_RETENTION_DAYS);
        if (n > 0) slog("info", "evidence retention sweep", { tombstoned: n, retentionDays: EVIDENCE_RETENTION_DAYS });
      }
      if (AUDIT_RETENTION_DAYS) {
        const n = sweepExpiredAuditLogs(db, AUDIT_RETENTION_DAYS);
        if (n > 0) slog("info", "audit log retention sweep", { deleted: n, retentionDays: AUDIT_RETENTION_DAYS });
      }
    } catch (err) {
      slog("error", "retention sweep failed", { error: err.message });
    }
  };
  sweep(); // apply immediately at boot, then on the interval
  const interval = setInterval(sweep, RETENTION_SWEEP_MS);
  interval.unref?.();
}

// ---- Boot ------------------------------------------------------------------
(async () => {
  startApi(); // serve immediately (even mid-backfill)
  startRetentionSweeps();
  try {
    await backfill(); // catch up on history once
  } catch (err) {
    slog("error", "backfill failed (api still serving cached data)", {
      error: err.shortMessage || err.message,
    });
  }
  pollForever(); // then stay current forever
})();
