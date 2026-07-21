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
- **SQLite-backed rate limiting.** Shared across every process pointed at the
  same `DB_PATH` (fine for the current single-EC2 topology, including
  multiple PM2 instances on that host); a true multi-host deployment with
  independent local disks would still need a network-shared store (Redis).
- **`EVIDENCE_WRITE_TOKEN` doesn't secure browser-origin writes** — a browser
  can't hold a server secret. It suits trusted-uploader/proxy deployments;
  browser writes rely on content-addressing + rate limiting, and confidentiality
  comes from client-side encryption, not the write token.

## Per-reviewer access control (identity-based, opt-in)

`EVIDENCE_ACCESS_MODE=per-reviewer` (alongside `EVIDENCE_PROTECTED=true`)
replaces the shared-token read check with **live on-chain authorization**:

```
Reviewer's browser:
  sign "Covenant evidence access\nhash: <h>\ncampaignId: <id>\ntimestamp: <t>"
  GET /evidence/<h>?campaignId=<id>&address=<addr>&signature=<sig>&timestamp=<t>
Server:
  verify the EOA signature recovers to <addr> (no RPC needed — pure ECDSA)
  read isReviewer(campaignId, addr) and getCampaign(campaignId).creator on-chain
  authorized = isReviewer || addr == creator
```

This is identity-based, not capability-based: holding a link is no longer
sufficient, and the check reflects the **current** on-chain state, not a
snapshot taken when access was granted — so, for example, a `PlatformOperator`
campaign's authority follows an owner change automatically. It does **not**
add revocation for one specific `DesignatedReviewers` address: that list is
fixed on-chain at campaign creation (a contract-level limitation — see L4 in
[CONTRACT_SECURITY_REVIEW.md](./CONTRACT_SECURITY_REVIEW.md)), so removing a
single named reviewer's access still isn't possible without a contract change.
`WeightedApproval` "reviewers" are just donors, so this mode grants any current
donor read access to that campaign's evidence — the model already treats donor
weight as public information.

Evidence rows written without a `campaignId` (or written before this mode
existed) transparently fall back to the shared-token check, so enabling this
mode doesn't break access to older data.

## Retention and deletion

`DELETE /evidence/:hash` (admin-only, `ADMIN_TOKEN`) tombstones a manifest
immediately — the row's hash and timestamps stay (so the audit trail and
"this locator existed" fact survive), but the manifest content is nulled and a
subsequent `GET` returns `410 Gone`. Use this for data-subject deletion
requests.

`EVIDENCE_RETENTION_DAYS` (unset by default = keep indefinitely) runs the same
tombstoning automatically on a periodic sweep (`RETENTION_SWEEP_INTERVAL_MS`,
default 6h) for any evidence older than the configured age.
`AUDIT_RETENTION_DAYS` does the same for old `evidence_access` log rows (a
hard delete, not a tombstone — access-log rows are operational exhaust, not
evidence content). Neither policy is a lifecycle *requirement* by default —
you must opt in by setting the retention window for your deployment.

## Remaining gaps (not yet built)

- **No revocation of one specific named reviewer.** `DesignatedReviewers` is
  fixed at campaign creation on-chain; per-reviewer mode authorizes against
  *current* on-chain state, but can't remove a single named reviewer without a
  contract change (L4).
- **Metadata is not confidential.** The on-chain summary, `manifestHash`,
  timing, and the ciphertext's size/access pattern are observable. Only the
  manifest *contents* are protected.
- **Per-reviewer mode isn't the default** — `EVIDENCE_ACCESS_MODE` defaults to
  `token` (shared secret) for backward compatibility; deployments that want
  identity-based access must opt in explicitly.
- **No written data-classification or vendor policy** yet (tracked in
  [SOC2_READINESS.md](./SOC2_READINESS.md) and
  [SECURITY_POLICIES.md](./SECURITY_POLICIES.md)).

These are the natural next steps toward a full Confidentiality control set and
are tracked in [SOC2_READINESS.md](./SOC2_READINESS.md).

## Honest positioning

- ✅ "Private evidence is end-to-end encrypted in the browser; Covenant's servers
  store only ciphertext."
- ✅ "Evidence access is audit-logged and integrity is verifiable on-chain."
- ✅ "Per-reviewer, identity-based evidence access (checked live against
  on-chain reviewer/creator status) and a retention/deletion workflow are
  available, opt-in controls."
- ❌ Do **not** say "fully confidential" or "SOC 2 Confidentiality compliant" —
  metadata isn't hidden, per-reviewer mode isn't the default, and a single
  named `DesignatedReviewers` address still can't be individually revoked
  without a contract change.
