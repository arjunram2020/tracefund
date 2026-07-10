# Access Control Expectations

**Question this answers:** Who can access what — and what should an enterprise
customer expect about how their data is handled inside our infrastructure?

## Who can access what today

| Actor | Can access | Enforced by |
|---|---|---|
| Anyone | Public on-chain data; public evidence | The blockchain (public by design) |
| Campaign creator | Their own campaign actions; submitting proof | Their wallet signature | ✅ |
| Reviewer / funder | Approving milestones; reading evidence they hold the capability for | Wallet signature + evidence capability | ✅ |
| Covenant operators | The server, the database (ciphertext), the audit log | Cloud/SSH credentials + admin token | 🟡 |
| Covenant operators | **Cannot** read client-encrypted private evidence | By design — we don't hold the key | ✅ |

## What enterprise customers should expect

- **We minimize our own access.** For private evidence, Covenant operators can
  see that a package exists and when it was accessed, but **not its contents** —
  the decryption key never reaches us. ✅ Implemented
- **Access to evidence is logged.** Every read/write is recorded so access can be
  reviewed after the fact. ✅ Implemented
- **Admin functions require a separate token.** The audit endpoint and
  evidence-write path are gated by server-side tokens, not open to the public.
  ✅ Implemented
- **Least privilege is our policy intent.** Production access should be limited
  to named people with the minimum rights needed, reviewed regularly. The
  mechanisms exist; the formal review cadence and MFA attestation are
  operational steps we are standing up. 🟡 Partial

## What is not yet in place (stated honestly)

- **Formal, documented access reviews** (e.g. quarterly re-certification of who
  has production access). ⬜ Planned
- **Enforced MFA and SSO** across every operator account and vendor. ⬜ Planned
  (operational — see [Secrets Handling](./04-secrets-handling.md) and
  [Control Gaps](./09-control-gaps-and-next-steps.md)).
- **Per-reviewer revocation of evidence access.** Today access is capability-
  based; we cannot yet revoke one reviewer without re-issuing the evidence.
  ⬜ Planned

## Our commitment

We will not access customer data beyond what is operationally necessary, we log
the access we do have, and we are building toward formal, auditable access-review
practices as we scale.
