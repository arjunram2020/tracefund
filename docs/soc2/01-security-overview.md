# Security Overview

**Question this answers:** How does Covenant keep data secure?

## The short version

Covenant is a milestone-based crowdfunding platform where money sits in
smart-contract escrow and is only released when funders approve the evidence
that a milestone was met. Because the money and the rules live on a public
blockchain (Base), the most security-critical logic is enforced by code that no
one — not even us — can quietly change. Around that, we've added standard web
and data-security controls for the parts we do run.

## How data is protected (in plain terms)

- **The money is governed by the contract, not by us.** Escrow, milestone
  release, approvals, and refunds are enforced on-chain. We cannot move funds
  outside those rules. ✅ Implemented
- **Sensitive proof stays private and encrypted.** When a creator submits
  confidential evidence, it is encrypted **in their browser** before it ever
  reaches our servers. We store only unreadable ciphertext; the decryption key
  is shared directly with the reviewers, never with us or the blockchain.
  ✅ Implemented ([details](../EVIDENCE_SECURITY_MODEL.md))
- **Encryption at rest.** The off-chain database can be encrypted on disk, so a
  stolen backup or drive is useless without the key. ✅ Implemented
- **Every access to evidence is logged.** Reads and writes are recorded with the
  outcome and a one-way fingerprint of the requester — we can investigate an
  incident without storing anyone's raw IP or token. ✅ Implemented
- **The web surfaces are hardened.** Security headers, strict CORS, rate
  limiting, request-size limits, and input validation are in place on both the
  app and the API. ✅ Implemented
- **Safe-by-default configuration.** In production the API refuses to start if
  its security settings are missing, so it can't accidentally run wide open.
  ✅ Implemented
- **Supply-chain scanning.** Automated dependency updates (Dependabot) and code
  scanning (CodeQL) run in CI. ✅ Implemented

## What we deliberately do NOT do

- We don't take custody of funds outside the smart contract.
- We don't collect personal data we don't need (see [Trust Boundaries](./02-trust-boundaries.md)).
- We don't put confidential evidence on the public blockchain — only a
  tamper-evident fingerprint of it.

## What's still operational, not automated

Some protections depend on people and process, not just code — MFA on our
accounts, least-privilege access reviews, uptime monitoring, and a fully
enforced backup schedule. These are tracked honestly in
[Control Gaps & Next Steps](./09-control-gaps-and-next-steps.md). 🟡/⬜

## The honest bottom line

Covenant has real, working security controls and is **building toward** SOC 2
readiness. We are not claiming to be SOC 2 compliant; that is a funded, future
milestone.
