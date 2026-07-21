import { NextResponse } from "next/server";

/**
 * Authenticated write proxy for the off-chain evidence registry.
 *
 * The browser cannot hold the indexer's EVIDENCE_WRITE_TOKEN — anything the
 * client can read is public — so a direct browser PUT to the indexer 401s the
 * moment the indexer is run with a write token set (which it MUST be in
 * production; it refuses to boot otherwise). The result was a silent failure:
 * the PUT was rejected, the client fell back to localStorage, and the proof
 * package never reached the shared registry, so a reviewer on any other device
 * saw a null manifest.
 *
 * This server-side route closes that gap. It holds EVIDENCE_WRITE_TOKEN as a
 * server-only secret and forwards the client's already-hash-addressed body to
 * the indexer with the bearer token attached. The indexer still re-hashes the
 * body against the :locator, so this proxy cannot inject mismatched content —
 * it only supplies authorization, never integrity.
 *
 * Server env (NOT NEXT_PUBLIC_ — never shipped to the browser):
 *   INDEXER_URL           base URL of the indexer (falls back to
 *                         NEXT_PUBLIC_INDEXER_URL, which is already public).
 *   EVIDENCE_WRITE_TOKEN  the indexer's write bearer token.
 *
 * Reads are intentionally NOT proxied: unprotected reads work directly from the
 * browser, and per-reviewer protected reads require the reviewer's own wallet
 * signature, which this server cannot produce.
 */

const INDEXER_URL = (process.env.INDEXER_URL || process.env.NEXT_PUBLIC_INDEXER_URL || "").replace(
  /\/$/,
  "",
);
const WRITE_TOKEN = process.env.EVIDENCE_WRITE_TOKEN || "";

// keccak256 hex address the indexer uses to key evidence.
const isLocator = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v);

// Proof manifests are small JSON docs, but encrypted blobs may embed evidence,
// so allow generous headroom while still bounding the forwarded payload.
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// This route attaches a privileged bearer token to anonymous callers' writes,
// so it must not be a free write-amplification lever against the indexer.
// Same in-memory fixed-window limiter as draft-milestones: per-instance and
// best-effort behind a CDN, but it bounds single-source spam. Stricter than
// draft-milestones because each hit forwards a privileged upstream write.
const RL_WINDOW_MS = 60_000;
const RL_MAX = 10;
const rlHits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(req: Request): boolean {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  let e = rlHits.get(ip);
  if (!e || now > e.resetAt) {
    e = { count: 0, resetAt: now + RL_WINDOW_MS };
    rlHits.set(ip, e);
  }
  e.count += 1;
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) if (now > v.resetAt) rlHits.delete(k);
  }
  return e.count > RL_MAX;
}

// Scoping metadata forwarded to the indexer feeds per-reviewer read
// authorization there — validate shape here instead of passing raw strings.
const isBoundedInt = (v: string, max: number) => /^\d{1,15}$/.test(v) && Number(v) <= max;

export async function PUT(
  req: Request,
  { params }: { params: { locator: string } },
) {
  if (rateLimited(req)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const locator = params.locator;
  if (!isLocator(locator)) {
    return NextResponse.json({ error: "invalid locator" }, { status: 400 });
  }

  // No indexer configured server-side: report "no registry" so the client keeps
  // its localStorage-only tier instead of treating this as a hard error.
  if (!INDEXER_URL) {
    return NextResponse.json({ ok: false, tier: "none" }, { status: 204 });
  }

  const declaredLen = Number(req.headers.get("content-length") ?? 0);
  if (declaredLen > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "body too large" }, { status: 413 });
  }
  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "body too large" }, { status: 413 });
  }
  if (!body) {
    return NextResponse.json({ error: "missing manifest body" }, { status: 400 });
  }

  // Forward optional per-reviewer scoping metadata (campaignId / milestoneIndex)
  // so protected-read authorization can target the right campaign. Values must
  // be plain bounded integers — anything else is dropped, not forwarded.
  const incoming = new URL(req.url).searchParams;
  const forward = new URLSearchParams();
  const campaignId = incoming.get("campaignId");
  if (campaignId !== null && isBoundedInt(campaignId, Number.MAX_SAFE_INTEGER)) {
    forward.set("campaignId", campaignId);
  }
  const milestoneIndex = incoming.get("milestoneIndex");
  if (milestoneIndex !== null && isBoundedInt(milestoneIndex, 10_000)) {
    forward.set("milestoneIndex", milestoneIndex);
  }
  const qs = forward.toString();
  const target = `${INDEXER_URL}/evidence/${locator}${qs ? `?${qs}` : ""}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (WRITE_TOKEN) headers.Authorization = `Bearer ${WRITE_TOKEN}`;

  try {
    const res = await fetch(target, { method: "PUT", headers, body });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
    });
  } catch {
    // Indexer unreachable — surface a gateway error so the client can fall back
    // to its local tier rather than believing the write succeeded.
    return NextResponse.json({ error: "indexer unreachable" }, { status: 502 });
  }
}
