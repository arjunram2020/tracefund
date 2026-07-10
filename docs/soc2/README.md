# Covenant Trust & Security Docs

A lean, plain-English set of documents describing how Covenant handles security
and data. They are written to be read by founders, customers, partners, and
prospective investors — no legal jargon, no overstatement.

## Honest positioning (read this first)

Covenant is **not SOC 2 compliant**, and these documents do not claim otherwise.
SOC 2 requires an independent CPA examination and, for Type II, months of
operating evidence — both of which cost real money we intend to fund as we grow.

What we have done is **build the security controls and infrastructure that a SOC
2 program is built on**, so that when we run a formal audit the groundwork is
already in place. Our honest statement is: *"Covenant is building toward SOC 2
readiness and has implemented foundational security controls."*

## How to read these docs

Every control is labeled with its real status:

- ✅ **Implemented** — built and working in the product today.
- 🟡 **Partial** — the mechanism exists; some operational piece (a schedule, a
  policy sign-off, an enforcement toggle) is still outstanding.
- ⬜ **Planned** — not built yet; a deliberate future step, often gated on scale
  or funding.

## Contents

1. [Security Overview](./01-security-overview.md) — how we protect data, in plain terms.
2. [Trust Boundaries](./02-trust-boundaries.md) — what data we hold, where it lives, and what we deliberately don't collect.
3. [Access Control Expectations](./03-access-control.md) — who can access what, and what enterprise customers should expect.
4. [Secrets Handling](./04-secrets-handling.md) — how keys, tokens, and credentials are managed.
5. [Change Management](./05-change-management.md) — how code changes reach production safely.
6. [Incident Response](./06-incident-response.md) — what we do when something goes wrong.
7. [Backup & Recovery](./07-backup-recovery.md) — how off-chain data survives failure.
8. [Vendor Inventory](./08-vendor-inventory.md) — the third parties in our stack (template + current list).
9. [Control Gaps & Next Steps](./09-control-gaps-and-next-steps.md) — what's not done yet, honestly.
10. [Secure SDLC](./10-secure-sdlc.md) — how code changes reach production safely, plus the exact GitHub settings to enable.

## Deeper technical references

These founder docs summarize; the engineering detail lives in:
[SOC2_READINESS.md](../SOC2_READINESS.md) ·
[SECURE_CONFIGURATION.md](../SECURE_CONFIGURATION.md) ·
[EVIDENCE_SECURITY_MODEL.md](../EVIDENCE_SECURITY_MODEL.md) ·
[BACKUP_RECOVERY.md](../BACKUP_RECOVERY.md)
