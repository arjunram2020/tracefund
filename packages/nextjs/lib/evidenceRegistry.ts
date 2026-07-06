import type { ProofManifest } from "./proofManifest";
import { canonicalManifestJson, verifyManifest } from "./proofManifest";

/**
 * Off-chain evidence registry — where full proof packages live when the
 * creator does NOT publish them on-chain.
 *
 * Storage tiers, in order:
 *  1. The Covenant indexer (packages/indexer) exposes PUT/GET /evidence/:hash.
 *     Manifests are addressed by their keccak256 hash — an unguessable
 *     32-byte capability derived from the content, so only people who were
 *     given the hash (it IS on-chain, so: anyone who can read the chain) can
 *     fetch the package. This is "unlisted", not access-controlled.
 *  2. localStorage, so same-browser demos work with no indexer running.
 *
 * TODO(privacy): production-grade private evidence needs authenticated
 * storage with role-based access (reviewer allowlists read from the campaign
 * config, expiring signed URLs, access audit log). This adapter is the seam:
 * swap the fetch calls for the authed storage client without touching any UI.
 * Until then, creators handling genuinely confidential documents should keep
 * the package private (download JSON, share directly with reviewers) — the
 * on-chain hash still lets reviewers verify what they were sent.
 */

const INDEXER_URL = (process.env.NEXT_PUBLIC_INDEXER_URL || "").replace(/\/$/, "");

const localKey = (hash: string) => `covenant-evidence-${hash.toLowerCase()}`;

export type RegistryTier = "indexer" | "local" | "none";

/** Store a manifest under its hash. Best-effort on every tier; never throws. */
export async function storeManifest(
  hash: `0x${string}`,
  manifest: ProofManifest,
): Promise<RegistryTier> {
  let tier: RegistryTier = "none";

  try {
    localStorage.setItem(localKey(hash), canonicalManifestJson(manifest));
    tier = "local";
  } catch {
    /* storage full / SSR — the indexer tier may still succeed */
  }

  if (INDEXER_URL) {
    try {
      const res = await fetch(`${INDEXER_URL}/evidence/${hash}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: canonicalManifestJson(manifest),
      });
      if (res.ok) tier = "indexer";
    } catch {
      /* indexer down — local tier (if any) still stands */
    }
  }

  return tier;
}

/**
 * Fetch a manifest by its on-chain hash and verify it byte-for-byte before
 * returning it. Returns null when nothing (valid) is found.
 */
export async function fetchManifest(hash: string): Promise<ProofManifest | null> {
  if (INDEXER_URL) {
    try {
      const res = await fetch(`${INDEXER_URL}/evidence/${hash}`);
      if (res.ok) {
        const manifest = (await res.json()) as ProofManifest;
        if (verifyManifest(manifest, hash)) return manifest;
      }
    } catch {
      /* fall through to local */
    }
  }

  try {
    const raw = localStorage.getItem(localKey(hash));
    if (raw) {
      const manifest = JSON.parse(raw) as ProofManifest;
      if (verifyManifest(manifest, hash)) return manifest;
    }
  } catch {
    /* ignore */
  }

  return null;
}
