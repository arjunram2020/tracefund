import { keccak256, toBytes } from "viem";

/**
 * The proof-package manifest: the canonical off-chain record of one proof
 * submission. Only its keccak256 hash (plus a short public summary and an
 * OPTIONAL public pointer) goes on-chain — sensitive evidence URLs never
 * have to be published.
 *
 * On-chain / off-chain boundary:
 *  - on-chain:  manifestHash (keccak256 of the canonical JSON below),
 *               a short public summary, and — only when the creator opts
 *               into public evidence — a data: URI of this manifest.
 *  - off-chain: this manifest (narrative, justification, metrics, links),
 *               stored in the evidence registry (see evidenceRegistry.ts)
 *               and/or shared directly with reviewers.
 *  - verified:  reviewers recompute the hash of the manifest they were given
 *               and compare it to the on-chain manifestHash.
 */
export interface ProofManifest {
  version: 1;
  campaignId: string;
  milestoneIndex: number;
  /** The creator's write-up: what was accomplished. Not "perfect proof" —
   *  it exists to help reviewers understand the evidence. */
  narrative: string;
  /** How the attached evidence supports this milestone's success definition. */
  justification: string;
  /** Optional dates / reporting-period notes. */
  reportingNotes: string;
  /** Optional metrics summary (e.g. "WAU 540, retention 22%"). */
  metricsSummary: string;
  /** One or more supporting links. Future-proofing: `kind` reserves room for
   *  typed artifacts (file uploads, content hashes) without a version bump. */
  links: Array<{ url: string; label?: string; kind?: "url" }>;
  createdAt: string; // ISO timestamp
}

/**
 * Canonical serialization: JSON with object keys sorted at every level.
 * Both sides (creator hashing before submit, reviewer verifying after
 * download) must run the manifest through this exact function.
 */
export function canonicalManifestJson(manifest: ProofManifest): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((value as Record<string, unknown>)[k])]),
      );
    }
    return value;
  };
  return JSON.stringify(sort(manifest));
}

/** keccak256 of the canonical manifest JSON — what Covenant stores on-chain. */
export function hashManifest(manifest: ProofManifest): `0x${string}` {
  return keccak256(toBytes(canonicalManifestJson(manifest)));
}

/** Self-contained public pointer for creators who opt into public evidence. */
export function manifestToDataUri(manifest: ProofManifest): string {
  const json = canonicalManifestJson(manifest);
  const base64 =
    typeof window === "undefined"
      ? Buffer.from(json, "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(json)));
  return `data:application/json;base64,${base64}`;
}

/** Decode a manifest from an on-chain data: URI. Returns null on any failure. */
export function manifestFromDataUri(uri: string): ProofManifest | null {
  const m = uri.match(/^data:application\/json;base64,(.+)$/);
  if (!m) return null;
  try {
    const json =
      typeof window === "undefined"
        ? Buffer.from(m[1], "base64").toString("utf8")
        : decodeURIComponent(escape(atob(m[1])));
    const parsed = JSON.parse(json) as ProofManifest;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

/** Verify a manifest against the hash recorded on-chain. */
export function verifyManifest(manifest: ProofManifest, onChainHash: string): boolean {
  return hashManifest(manifest).toLowerCase() === onChainHash.toLowerCase();
}
