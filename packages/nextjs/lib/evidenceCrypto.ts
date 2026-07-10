/**
 * Client-side (end-to-end) encryption for private evidence.
 *
 * Threat model this addresses: the off-chain evidence registry is addressed by
 * a keccak256 hash that Covenant ALSO publishes on-chain. That makes the plain
 * "capability-by-hash" model effectively public — anyone reading the chain can
 * fetch the manifest. For genuinely confidential proof (financials, customer or
 * beneficiary data) we instead encrypt the manifest in the creator's browser
 * with a fresh random key and store only the CIPHERTEXT in the registry.
 *
 * What goes where:
 *  - registry:  ciphertext, addressed by keccak256(ciphertext) — the server and
 *               anyone scraping it see only opaque bytes.
 *  - on-chain:  keccak256 of the PLAINTEXT manifest (unchanged) — integrity only,
 *               never the key.
 *  - capability: the decryption key + ciphertext locator, packed into one string
 *               the creator shares out-of-band with reviewers. It never touches
 *               the chain or the server.
 *
 * AES-256-GCM via the Web Crypto API (`globalThis.crypto.subtle`), which is
 * present in modern browsers and in Node 18+ — so this module is isomorphic and
 * has zero dependencies.
 */

const subtle = () => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("Web Crypto unavailable in this environment");
  return c.subtle;
};

// --- base64url helpers (no Buffer dependency, work in browser and Node) ------
function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin =
    typeof atob === "function"
      ? atob(b64)
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

// TS's DOM lib types Web Crypto inputs as `BufferSource` backed by a plain
// `ArrayBuffer`, while `TextEncoder`/`subarray` yield `Uint8Array<ArrayBufferLike>`.
// Our arrays satisfy the API at runtime, so narrow the type at the call boundary.
const bs = (b: Uint8Array): BufferSource => b as BufferSource;

/** Generate a fresh 256-bit key, returned as a base64url string. */
export async function generateEvidenceKey(): Promise<string> {
  const raw = new Uint8Array(32);
  globalThis.crypto.getRandomValues(raw);
  return bytesToB64Url(raw);
}

async function importKey(keyB64Url: string): Promise<CryptoKey> {
  const raw = b64UrlToBytes(keyB64Url);
  if (raw.length !== 32) throw new Error("invalid evidence key length");
  return subtle().importKey("raw", bs(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * Encrypt a UTF-8 string. Output blob = base64url(iv[12] || ciphertext+tag),
 * suitable for storing directly in the evidence registry.
 */
export async function encryptToBlob(plaintext: string, keyB64Url: string): Promise<string> {
  const key = await importKey(keyB64Url);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv: bs(iv) }, key, bs(enc.encode(plaintext))),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64Url(out);
}

/** Decrypt a blob produced by {@link encryptToBlob}. Throws on tamper/bad key. */
export async function decryptFromBlob(blob: string, keyB64Url: string): Promise<string> {
  const key = await importKey(keyB64Url);
  const bytes = b64UrlToBytes(blob);
  const iv = bytes.subarray(0, 12);
  const ct = bytes.subarray(12);
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: bs(iv) }, key, bs(ct));
  return dec.decode(pt);
}

// --- capability = locator + key ---------------------------------------------
// A single opaque string the creator shares with reviewers. Format:
//   cov1.<locator>.<keyB64url>
// where <locator> is the 0x keccak256 hash of the ciphertext (its registry
// address). Parsing is strict so a malformed paste fails cleanly.
const CAP_PREFIX = "cov1";

export interface EvidenceCapability {
  locator: `0x${string}`;
  key: string;
}

export function packCapability(locator: `0x${string}`, key: string): string {
  return `${CAP_PREFIX}.${locator}.${key}`;
}

export function parseCapability(input: string): EvidenceCapability | null {
  const raw = input.trim();
  // Accept a bare capability or one embedded in a URL (?ev= or #ev=).
  const fromUrl = raw.match(/[?#]ev=([^&\s]+)/);
  const cap = fromUrl ? decodeURIComponent(fromUrl[1]) : raw;
  const parts = cap.split(".");
  if (parts.length !== 3 || parts[0] !== CAP_PREFIX) return null;
  const [, locator, key] = parts;
  if (!/^0x[0-9a-fA-F]{64}$/.test(locator) || key.length < 40) return null;
  return { locator: locator.toLowerCase() as `0x${string}`, key };
}
