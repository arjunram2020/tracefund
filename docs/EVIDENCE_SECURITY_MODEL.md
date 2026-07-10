# Covenant Evidence Security Model

How Covenant stores and controls access to off-chain **proof packages**
("evidence"), what each control defends against, the tradeoffs we accepted, and
the gaps that remain.

This document describes real, shipped controls. It does **not** claim Covenant
meets any formal confidentiality standard or SOC 2 Confidentiality criterion —
see [SOC2_READINESS.md](./SOC2_READINESS.md) for that framing.

## What "evidence" is

When a creator submits proof for a milestone, the app builds a **manifest**
(`packages/nextjs/lib/proofManifest.ts`): narrative, justification, metrics,
reporting notes, and supporting links. This can be sensitive — financials,
customer or beneficiary data, private documents.

Covenant separates three things:

| Layer | What lives there | Who can see it |
|---|---|---|
| **On-chain** | `keccak256(plaintext manifest)` + a short public summary + (optional) a public copy of the manifest | Everyone (public blockchain) |
| **Off-chain registry** | the manifest (public mode) or its **ciphertext** (private mode), addressed by a keccak256 hash | Depends on the access model below |
| **Capability** | for private evidence: the decryption key + registry locator | Only whoever the creator shares it with |

The on-chain hash is always the integrity anchor: a reviewer recomputes it from
whatever manifest they were given and compares.

## Two access models (creator chooses per submission)

### A. Public evidence (checkbox on)

The manifest is stored **in the clear**, addressed by its on-chain hash, and
optionally embedded on-chain as a `data:` URI. Because that hash is on-chain,
this is **"unlisted," not access-controlled** — anyone reading the chain can
fetch it. Correct only when the creator is fine making the package public
(e.g. charity receipts).

### B. Private evidence (checkbox off) — client-side end-to-end encryption

```
Creator's browser:
  manifest --(canonicalize)--> JSON --(AES-256-GCM, fresh random key)--> ciphertext
  locator = keccak256(ciphertext)
  PUT ciphertext to registry at /evidence/<locator>     # server sees only ciphertext
  capability = "cov1.<locator>.<key>"                    # never sent to server or chain
On-chain (submitProof):
  manifestHash = keccak256(PLAINTEXT manifest)           # integrity only, no key, no locator
Reviewer:
  opens the creator's capability link (?ev=<capability>) or pastes it
  GET ciphertext by <locator> --> decrypt with <key> in-browser
  verify keccak256(decrypted) == on-chain manifestHash   # integrity + confidentiality
```

Key properties:

- **The server never holds plaintext or the key** — only ciphertext addressed by
  `keccak256(ciphertext)`. A registry/database compromise leaks opaque bytes.
- **The on-chain data reveals nothing readable** — just a hash of the plaintext
  (for verification) and the public summary the creator wrote. The locator and
  key are not on-chain.
- **Integrity is preserved** — reviewers still verify against the on-chain hash,
  and AES-GCM's auth tag rejects any tampering with the ciphertext.
- **Confidentiality = possession of the capability.** It is an unguessable
  capability, shared out-of-band with reviewers.

Implementation: `lib/evidenceCrypto.ts` (crypto + capability format),
`lib/evidenceRegistry.ts` (`storeEncryptedManifest` / `fetchEncryptedManifest`),
wired in `components/EvidencePanel.tsx` (creator) and
`components/ReviewPanel.tsx` (reviewer).

## Defense in depth on the registry (indexer)

Even for public evidence and as a second layer under client encryption, the
indexer (`packages/indexer`) applies:

- **Encryption at rest** (`EVIDENCE_ENC_KEY`, AES-256-GCM): stored manifests are
  encrypted on the server so a stolen DB file or backup is useless without the
  key. Transparent on read; backward-compatible with legacy plaintext rows.
- **Write authentication** (`EVIDENCE_WRITE_TOKEN`) and optional **read
  protection** (`EVIDENCE_PROTECTED`).
- **Content-addressing**: the server re-hashes every write and refuses bodies
  that don't match their address, so it can never serve content that doesn't
  match its locator.
- **Access audit log**: every read/write is logged with outcome and *salted*
  (non-reversible) IP and token fingerprints — raw IPs/tokens are never stored.
  Reviewable via the admin-only `GET /audit`.
- **Rate limiting, request-size caps, and input validation** on all routes.

See `packages/indexer/.env.example` for configuration. In production
(`NODE_ENV=production`) the critical controls are enforced by a fail-closed
startup check.

## Threat model — what each control defends against

| Threat | Defended by | Result |
|---|---|---|
| On-chain observer reads private evidence | Client-side encryption (locator+key off-chain) | Sees only a hash; cannot fetch or read |
| Registry/DB or backup theft | Client encryption + at-rest encryption | Opaque ciphertext only |
| Tampered/substituted evidence | On-chain hash verification + AES-GCM auth tag | Rejected |
| Unauthorized/abusive writes | Write token + content-addressing + rate limit | Rejected/throttled |
| Undetected access | Salted audit log + admin audit endpoint | Reviewable trail |
| Sensitive data sprawl | Minimal on-chain data + ciphertext-only storage + salted fingerprints | Little sensitive data stored |

## Tradeoffs we accepted

- **Manual capability distribution.** There is no in-app secure channel to
  reviewers, so the creator shares the capability link out-of-band (the product
  already used manual sharing for private evidence). Simpler, no vendor, but
  puts distribution on the creator.
- **Key loss = unrecoverable evidence.** No key escrow (by design — escrow would
  reintroduce a party who can read everything). Creators keep the downloaded
  package as backup.
- **Per-instance rate limiting / in-memory limiter.** Fine for the current
  single-indexer deployment; a shared store is needed for multi-instance.
- **`EVIDENCE_WRITE_TOKEN` doesn't secure browser-origin writes** — a browser
  can't hold a server secret. It suits trusted-uploader/proxy deployments;
  browser writes rely on content-addressing + rate limiting, and confidentiality
  comes from client-side encryption, not the write token.

## Remaining gaps (not yet built)

- **No per-reviewer access control or revocation.** A capability grants read to
  anyone who holds it; you cannot revoke one reviewer without re-encrypting and
  re-sharing.
- **Metadata is not confidential.** The on-chain summary, `manifestHash`,
  timing, and the ciphertext's size/access pattern are observable. Only the
  manifest *contents* are protected.
- **No reviewer-allowlist enforcement tied to the campaign's approval config.**
  Access is capability-based, not identity-based.
- **No retention/deletion workflow** for evidence yet.

These are the natural next steps toward a full Confidentiality control set and
are tracked in [SOC2_READINESS.md](./SOC2_READINESS.md).

## Honest positioning

- ✅ "Private evidence is end-to-end encrypted in the browser; Covenant's servers
  store only ciphertext."
- ✅ "Evidence access is audit-logged and integrity is verifiable on-chain."
- ❌ Do **not** say "fully confidential" or "SOC 2 Confidentiality compliant" —
  capability distribution is manual, there is no per-reviewer revocation, and
  metadata is not hidden.
