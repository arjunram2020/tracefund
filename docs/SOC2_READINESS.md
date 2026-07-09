# Covenant SOC 2 Readiness

This repository can support SOC 2 readiness work, but it is **not enough on its
own to make Covenant "SOC 2 compliant."**

Important distinction:

- **SOC 2 Type I**: an independent CPA examines whether your controls are
  suitably designed at a point in time.
- **SOC 2 Type II**: an independent CPA examines whether those controls both
  exist and operate effectively over a period of time, commonly 3-12 months.

That means no code change, policy document, or self-attestation in this repo
can honestly claim Covenant is already SOC 2 compliant.

## Scope Covenant should use

For Covenant, the practical audit scope is likely:

- hosted Next.js frontend;
- indexer API and evidence registry;
- AWS account / EC2 / Nginx / PM2 operations;
- source control and CI/CD;
- incident response and logging systems;
- third-party vendors that touch customer or operational data.

The Base blockchain and wallet providers matter to your risk model, but they do
not remove Covenant's own shared-responsibility obligations for hosted systems.

## What this repo now supports

Recent repo changes add a real compliance seam instead of vague marketing:

- the indexer can run with restricted CORS origins;
- the off-chain evidence registry can require a bearer token;
- evidence reads and writes are audit-logged with outcome, hashed requester
  fingerprint, hashed IP fingerprint, user agent, and path;
- an admin-only audit endpoint can be enabled for incident review and audit
  sampling;
- the frontend and indexer send baseline security headers;
- the product exposes a public Trust page that describes current controls and
  remaining gaps without falsely claiming certification.

## Control mapping

### Security

In product now:

- escrow and milestone release logic enforced by the smart contract;
- explicit review and approval flows;
- evidence hashing to detect tampering;
- security headers on hosted web surfaces;
- audit logging for off-chain evidence access.

Still required outside code:

- MFA on every production admin account;
- least-privilege access management and quarterly reviews;
- vulnerability management;
- secure SDLC / change approval process;
- incident response policy and tabletop exercise.

### Availability

In product now:

- chain remains the source of truth;
- indexer can rebuild state from deployment block;
- health endpoint exposes indexing status.

Still required:

- backups and restore tests;
- uptime monitoring and paging;
- documented recovery time / recovery point targets;
- operational runbooks.

### Confidentiality

In product now:

- sensitive evidence can stay off-chain;
- protected evidence API mode is available;
- evidence access is auditable.

Still required:

- enforce protected mode in production;
- role-based access rules for creators / reviewers / operators;
- vendor and data-classification policy;
- secrets management and rotation.

### Processing Integrity

In product now:

- deterministic contract rules for payout release;
- content-addressed evidence re-hashing before storage.

Still required:

- release approvals;
- deployment evidence;
- reconciliation checks for production services.

### Privacy

In product now:

- the design minimizes on-chain sensitive data.

Still required:

- privacy notice;
- retention/deletion schedule;
- data subject request workflow if personal data is collected;
- vendor list and cross-border data review if applicable.

## What you should do next

1. Define the audit scope and system boundary.
2. Enable MFA and least-privilege access across AWS, GitHub, DNS, RPC vendors,
   WalletConnect, and any admin tooling.
3. Turn on the protected evidence API and admin audit token in production.
4. Add centralized logging, alerting, and backup/restore tests.
5. Write short policies: access control, change management, incident response,
   retention, vendor management.
6. Run a readiness assessment with an auditor or compliance advisor.
7. Collect operating evidence long enough for a Type II audit.

## Honest positioning language

Safe wording:

- "Covenant is building toward SOC 2 readiness."
- "Covenant has implemented foundational security and auditability controls."
- "Covenant has not yet completed an independent SOC 2 examination."

Avoid:

- "Covenant is SOC 2 compliant" unless an independent audit has actually been
  completed.
