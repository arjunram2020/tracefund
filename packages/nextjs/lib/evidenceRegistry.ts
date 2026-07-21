import { keccak256, toBytes } from "viem";
import type { ProofManifest } from "./proofManifest";
import { canonicalManifestJson, verifyManifest } from "./proofManifest";
import {
  generateEvidenceKey,
  encryptToBlob,
  decryptFromBlob,
  packCapability,
  parseCapability,
} from "./evidenceCrypto";

/**
 * Off-chain evidence registry — where full proof packages live when the
 * creator does NOT publish them on-chain.
 *
 * Two access models, chosen by the creator per submission:
 *
 *  A. PUBLIC-ish (storeManifest/fetchManifest): the manifest is stored in the
 *     clear, addressed by its keccak256 hash. Because that hash is ALSO on-chain,
 *     this is "unlisted", not access-controlled — anyone reading the chain can
 *     fetch it. Correct only for evidence the creator is fine making public.
 *
 *  B. ENCRYPTED (storeEncryptedManifest/fetchEncryptedManifest): the manifest is
 *     encrypted in the browser; only ciphertext reaches the registry, addressed
 *     by keccak256(ciphertext) — a locator that is NOT on-chain. The decryption
 *     key travels only inside the returned capability, which the creator shares
 *     out-of-band with reviewers. The server and chain observers see opaque
 *     bytes; reviewers still verify the decrypted manifest against the on-chain
 *     plaintext hash. This is the path for confidential proof.
 *
 * Storage tiers for both models, in order: the Covenant indexer (PUT/GET
 * /evidence/:hash), then localStorage for same-browser demos with no indexer.
 *
 * Remaining gap (documented in docs/EVIDENCE_SECURITY_MODEL.md): capability
 * distribution to reviewers is manual — there is no in-app secure channel or
 * per-reviewer revocation yet.
 */

const INDEXER_URL = (process.env.NEXT_PUBLIC_INDEXER_URL || "").replace(/\/$/, "");

const localKey = (hash: string) => `covenant-evidence-${hash.toLowerCase()}`;

/** Best-effort PUT of an already-addressed body to the registry tiers. */
async function putToRegistry(locator: string, body: string): Promise<RegistryTier> {
  let tier: RegistryTier = "none";
  try {
    localStorage.setItem(localKey(locator), body);
    tier = "local";
  } catch {
    /* storage full / SSR — the indexer tier may still succeed */
  }
  // Writes go through the same-origin API proxy (/api/evidence/:locator), which
  // attaches the indexer's EVIDENCE_WRITE_TOKEN server-side. A direct browser
  // PUT would 401 against any production indexer (the token can't live in the
  // bundle), so the proxy is what makes the shared "indexer" tier actually
  // reachable. Only a genuine 2xx promotes the tier — a 204 (no indexer
  // configured) or any error leaves us on the local tier.
  try {
    const res = await fetch(`/api/evidence/${locator}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok && res.status !== 204) tier = "indexer";
  } catch {
    /* proxy/indexer down — local tier (if any) still stands */
  }
  return tier;
}

/** Best-effort GET of a raw body by locator from the registry tiers. */
async function getFromRegistry(locator: string): Promise<string | null> {
  if (INDEXER_URL) {
    try {
      const res = await fetch(`${INDEXER_URL}/evidence/${locator}`);
      if (res.ok) return await res.text();
    } catch {
      /* fall through to local */
    }
  }
  try {
    return localStorage.getItem(localKey(locator));
  } catch {
    return null;
  }
}

export type RegistryTier = "indexer" | "local" | "none";

/**
 * PUBLIC path. Store a manifest IN THE CLEAR under its on-chain hash. Use only
 * for evidence the creator has chosen to make public — the hash is on-chain, so
 * anyone can fetch it. Best-effort on every tier; never throws.
 */
export async function storeManifest(
  hash: `0x${string}`,
  manifest: ProofManifest,
): Promise<RegistryTier> {
  return putToRegistry(hash, canonicalManifestJson(manifest));
}

/**
 * Fetch a PUBLIC manifest by its on-chain hash and verify it byte-for-byte
 * before returning it. Returns null when nothing (valid) is found. Encrypted
 * submissions are not stored under the on-chain hash, so this returns null for
 * them — callers should then fall back to {@link fetchEncryptedManifest}.
 */
export async function fetchManifest(hash: string): Promise<ProofManifest | null> {
  const raw = await getFromRegistry(hash);
  if (!raw) return null;
  try {
    const manifest = JSON.parse(raw) as ProofManifest;
    if (verifyManifest(manifest, hash)) return manifest;
  } catch {
    /* not a public manifest (may be ciphertext for a different locator) */
  }
  return null;
}

/** What a creator receives after storing encrypted evidence. */
export interface EncryptedEvidenceResult {
  /** Registry address of the ciphertext (keccak256 of the ciphertext). */
  locator: `0x${string}`;
  /** Opaque capability string to share with reviewers (contains the key). */
  capability: string;
  tier: RegistryTier;
}

/**
 * ENCRYPTED path. Encrypt the manifest in the browser and store only the
 * ciphertext, addressed by keccak256(ciphertext). Returns a capability the
 * creator shares out-of-band with reviewers. The on-chain plaintext hash
 * (computed by the caller for `submitProof`) is unaffected and still verifies.
 */
export async function storeEncryptedManifest(
  manifest: ProofManifest,
): Promise<EncryptedEvidenceResult> {
  const key = await generateEvidenceKey();
  const blob = await encryptToBlob(canonicalManifestJson(manifest), key);
  const locator = keccak256(toBytes(blob));
  const tier = await putToRegistry(locator, blob);
  return { locator, capability: packCapability(locator, key), tier };
}

/**
 * Fetch and decrypt an encrypted manifest from a capability. If `expectedHash`
 * (the on-chain plaintext hash) is given, the decrypted manifest is verified
 * against it and rejected on mismatch. Returns null on any failure.
 */
export async function fetchEncryptedManifest(
  capability: string,
  expectedHash?: string,
): Promise<ProofManifest | null> {
  const parsed = parseCapability(capability);
  if (!parsed) return null;
  const blob = await getFromRegistry(parsed.locator);
  if (!blob) return null;
  try {
    const json = await decryptFromBlob(blob, parsed.key);
    const manifest = JSON.parse(json) as ProofManifest;
    if (expectedHash && !verifyManifest(manifest, expectedHash)) return null;
    return manifest;
  } catch {
    return null;
  }
}
