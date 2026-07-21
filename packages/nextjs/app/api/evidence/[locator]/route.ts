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

export async function PUT(
  req: Request,
  { params }: { params: { locator: string } },
) {
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
  // untouched so protected-read authorization can target the right campaign.
  const incoming = new URL(req.url).searchParams;
  const forward = new URLSearchParams();
  for (const key of ["campaignId", "milestoneIndex"]) {
    const val = incoming.get(key);
    if (val !== null) forward.set(key, val);
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
