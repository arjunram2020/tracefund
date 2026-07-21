# Security Policy

Covenant holds real funds in an on-chain escrow and stores off-chain evidence
for milestone review. We take security reports seriously and appreciate
responsible disclosure.

> Covenant is building toward SOC 2 readiness and has implemented foundational
> security controls. Covenant has **not** completed an independent SOC 2
> examination — see [docs/soc2/](docs/soc2/README.md) for our honest status.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately. The primary channel is GitHub private vulnerability
reporting, which routes to the maintainers without exposing the report and does
not depend on any individual's inbox:

- **GitHub private vulnerability reporting** (primary): use the
  ["Report a vulnerability"](../../security/advisories/new) button on this
  repository's Security tab.
- **Email** (fallback): security@covenant.example — replace with the project's
  monitored security alias before publishing this policy externally; until that
  alias exists, reports reach the maintainer at nityanth.maramreddy@gmail.com.
  Use the subject line `[SECURITY] Covenant vulnerability report`.

Include, where you can:

- A description of the issue and its impact.
- Steps to reproduce (a proof of concept is ideal).
- The affected component: smart contract (`packages/hardhat`), frontend
  (`packages/nextjs`), indexer/API (`packages/indexer`), or infrastructure.
- Any suggested remediation.

## What to expect

- **Acknowledgement** of your report within **3 business days**.
- An assessment and severity triage within **7 business days**.
- We will keep you informed of progress and credit you in the fix notes if
  you'd like (or keep you anonymous — your choice).
- Please give us a reasonable window to remediate before public disclosure;
  we will work with you on coordinated disclosure timing.

## Scope

In scope:

- The `Covenant` smart contract and deployment scripts (`packages/hardhat`).
- The web application (`packages/nextjs`), including the evidence
  encryption/registry client code.
- The indexer HTTP API (`packages/indexer`): evidence registry, audit
  endpoint, auth, and rate limiting.
- Leaked secrets or credentials anywhere in this repository's history.

Out of scope:

- Denial-of-service / volumetric attacks against our infrastructure.
- Issues in third-party dependencies with no demonstrated impact on Covenant
  (report those upstream — but do tell us if Covenant is exploitable through
  them).
- Social engineering of maintainers or users.
- Issues requiring a compromised user wallet or operator machine.

## Safe harbor

We will not pursue legal action against good-faith security research that:

- Stays within the scope above and avoids privacy violations, data
  destruction, and service degradation.
- Uses test funds/accounts wherever possible and never moves or withholds
  other users' funds.
- Reports findings promptly and privately, and does not exploit them beyond
  what is needed to demonstrate the issue.

## Supported versions

Only the latest deployed contract and the `main` branch of this repository
receive security fixes. Retired contract deployments (listed in the app's
History tab) are legacy and out of support.
