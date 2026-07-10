# Security Policy

We take the security of Covenant — and of the funds and data it handles —
seriously. Thank you for helping keep it safe.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Report privately, one of:

- Email **nityanth.maramreddy@gmail.com** with subject `SECURITY: Covenant`, or
- Use GitHub's **[Report a vulnerability](https://github.com/arjunram2020/tracefund/security/advisories/new)**
  (Security → Advisories) for a private, coordinated disclosure.

Please include: what you found, where (file / URL / contract address), how to
reproduce it, and the impact you believe it has. A minimal proof-of-concept
helps us verify quickly.

## What to expect

- **Acknowledgement:** within 3 business days.
- **Assessment & triage:** we'll confirm severity and keep you updated.
- **Fix & disclosure:** we'll coordinate a fix and a disclosure timeline with
  you. We're a small team building toward SOC 2 readiness, so timelines are
  best-effort, but we will not go silent.

## Scope

In scope:

- The smart contract `packages/hardhat/contracts/Covenant.sol` and its
  deployment/integration logic.
- The off-chain indexer / evidence API (`packages/indexer`).
- The web app (`packages/nextjs`) and its handling of evidence and config.
- Secrets/config handling and CI/CD.

Out of scope:

- The Base blockchain, USDC/Circle, RPC providers, WalletConnect, and other
  third-party infrastructure (report those to the respective vendor).
- Findings that require a compromised user device or wallet.
- Best-practice suggestions with no concrete security impact.

## Safe harbor

We will not pursue or support legal action against researchers who:

- make a good-faith effort to avoid privacy violations, data destruction, and
  service disruption;
- only interact with accounts/data they own or have explicit permission to test;
- give us reasonable time to remediate before any public disclosure.

## A note on funds

Covenant's escrow is governed by an on-chain smart contract; we cannot move or
freeze user funds outside its rules. For the highest-severity contract issues,
prioritize a private report so we can respond (including, on a future
deployment, using the contract's emergency pause) before any exploitation.

For how we handle data and configuration, see
[docs/soc2/](./docs/soc2/README.md).
