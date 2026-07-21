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

- the indexer restricts CORS to an explicit origin allowlist (`ALLOWED_ORIGINS`);
- the off-chain evidence registry requires a bearer token to write
  (`EVIDENCE_WRITE_TOKEN`) and can require one to read (`EVIDENCE_PROTECTED`);
- evidence reads and writes are audit-logged with outcome, a salted requester
  fingerprint, a salted IP fingerprint, user agent, method, and path — raw IPs
  and tokens are never stored (`evidence_access` table in the indexer);
- an admin-only audit endpoint (`GET /audit`, gated by `ADMIN_TOKEN`) can be
  enabled for incident review and audit sampling;
- the frontend and indexer send baseline security headers (nosniff, frame
  denial, HSTS, referrer policy, and `frame-ancestors` clickjacking protection);
- the indexer fails closed in production: with `NODE_ENV=production` it refuses
  to start if `ALLOWED_ORIGINS`, `EVIDENCE_WRITE_TOKEN`, `ADMIN_TOKEN`,
  `AUDIT_SALT`, or `EVIDENCE_ENC_KEY` are unset, so a misconfigured deploy
  can't silently run open (and, in any environment, `EVIDENCE_PROTECTED=true`
  without a write token refuses to start rather than failing open);
- per-IP rate limiting protects all API routes, with a stricter limit on
  evidence writes and `/audit` to slow token guessing and scraping;
- request bodies are size-capped (256 KB on evidence, 16 KB on the frontend
  drafting endpoint) and query/path inputs are validated and bounded;
- the indexer emits structured (JSON-line) logs suitable for centralized
  ingestion, and never logs secrets — only salted fingerprints and safe fields;
- automated supply-chain controls run in CI: Dependabot (weekly, grouped),
  CodeQL static analysis, and a dependency-audit job (see `.github/`);
- the product exposes a public Trust page that describes current controls and
  remaining gaps without falsely claiming certification.

Operator note: every indexer security control above is configured through
environment variables documented in `packages/indexer/.env.example`. They
default to permissive, dev-friendly values, and the indexer emits a structured
`security control unset` warning at startup for any control left unset — so an
insecure deployment is obvious in the logs. In production (`NODE_ENV=production`)
the critical controls are enforced by a fail-closed startup check.
**These must be set in production.**

## Phase 1 controls: in place vs. still missing

Everything below is free and lives in this repo. "In place" means implemented in
code; it does **not** mean independently audited.

| Control | Status | Where / how to verify locally |
|---|---|---|
| Security response headers | ✅ In place | `curl -si localhost:4000/health \| grep -i x-frame`; Next.js: `curl -si localhost:3000 \| grep -i content-security` |
| CORS origin allowlist | ✅ In place | Set `ALLOWED_ORIGINS`; a disallowed `Origin` is rejected by the browser |
| Evidence write auth (bearer) | ✅ In place | `PUT /evidence/:hash` without/with wrong token → `401`; correct token → `200` |
| Protected evidence reads (opt-in) | ✅ In place | Set `EVIDENCE_PROTECTED=true`; `GET /evidence/:hash` without token → `401` |
| Evidence access audit log | ✅ In place | After any evidence call: `GET /audit` with `ADMIN_TOKEN` shows the row |
| Client-side E2E encryption for private evidence | ✅ In place | Private submit → server stores ciphertext only; reviewer unlocks with a capability. See [EVIDENCE_SECURITY_MODEL.md](./EVIDENCE_SECURITY_MODEL.md) |
| Evidence encryption at rest | ✅ In place | Set `EVIDENCE_ENC_KEY`; raw DB rows are `enc:v1:` ciphertext, GET decrypts transparently |
| Admin-only audit endpoint | ✅ In place | `GET /audit` without token → `401`; with `ADMIN_TOKEN` → rows; unset → `404` |
| Fail-closed production config | ✅ In place | `NODE_ENV=production` with tokens unset → process exits with an error log |
| Per-IP rate limiting | ✅ In place | Exceed `RATE_LIMIT_MAX` rapid requests → `429` + `RateLimit-*` headers |
| Request-size limits | ✅ In place | `PUT` a >256 KB body → `413`; oversized drafting body → `413` |
| Input validation / bounds | ✅ In place | Bad `?limit=`, `?campaignId=`, or hash → `400` (no 500s) |
| Structured logging | ✅ In place | Indexer stdout is one JSON object per line (`ts`, `level`, `msg`, fields) |
| Supply-chain scanning (CI) | ✅ In place | `.github/` — Dependabot, CodeQL, and audit workflow run on push/PR |
| Secrets kept out of git | ✅ In place | `.gitignore` ignores every `.env*` except `*.example`; secrets are env-only, never in code. See [SECURE_CONFIGURATION.md](./SECURE_CONFIGURATION.md) |
| Public vs server-only config separation | ✅ In place | `NEXT_PUBLIC_*` documented as browser-public; secrets confined to server packages. See [SECURE_CONFIGURATION.md](./SECURE_CONFIGURATION.md) |
| Deploy-key format validation | ✅ In place | `hardhat.config.ts` rejects a malformed `DEPLOYER_PRIVATE_KEY` instead of deploying with the wrong signer |
| MFA on admin systems | ❌ Missing | Human control, not code — AWS/GitHub/DNS/RPC/WalletConnect. Checklist: [OPERATIONAL_ACCESS_CHECKLIST.md](./OPERATIONAL_ACCESS_CHECKLIST.md) |
| Least-privilege + access reviews | ❌ Missing | Named production access, documented approvals, quarterly review. Checklist: [OPERATIONAL_ACCESS_CHECKLIST.md](./OPERATIONAL_ACCESS_CHECKLIST.md) |
| Backups + restore test | 🟡 Partial | `yarn backup` (online snapshot + checksum + manifest + optional mirror), `yarn restore:verify`, and `offsite-copy.sh` exist; enabling the cron schedule + offsite destination is operational. See [BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md) |
| Uptime monitoring | 🟡 Partial | Free GitHub Actions `/health` cron (`.github/workflows/uptime.yml`); set the `HEALTH_URL` repo variable to activate |
| Security disclosure policy | ✅ In place | `SECURITY.md` — private reporting, scope, safe harbor |
| Emergency contract pause | 🟡 Partial | OZ `Pausable` circuit breaker implemented + tested in source (halts inflows/releases, never refunds); takes effect on next deploy. See [CONTRACT_SECURITY_REVIEW.md](./CONTRACT_SECURITY_REVIEW.md) |
| WeightedApproval Sybil hardening (H1) + denominator snapshot (M4) | 🟡 Partial | Per-voter weight cap + minimum distinct approvers + submission-time snapshot implemented + tested in source; batched with the Pausable redeploy above. See [CONTRACT_SECURITY_REVIEW.md](./CONTRACT_SECURITY_REVIEW.md) |
| Smart-contract test coverage | ✅ In place | 54 tests incl. reentrancy, escrow isolation, refund-dust, weighted-approval hardening, pause. CI runs them on every PR |
| Uptime monitoring + alerting | 🟡 Partial | `.github/workflows/uptime.yml` now opens/updates a single tracking GitHub issue on failure (auto-closes on recovery) in addition to the red-run email — durable, zero-cost, no vendor. Real paging/on-call integration (PagerDuty, Opsgenie, etc.) is still a vendor setup step, not a code gap |
| Full script/connect CSP | ✅ In place | `next.config.js` now sets `default-src 'self'`, blocks `object-src`/foreign `form-action`/`base-uri`, and scopes `connect-src`/`frame-src` to what wallet connections need. `script-src`/`style-src` still use `'unsafe-inline'` (no nonce middleware yet) and `connect-src` stays broad (`https:`/`wss:`) because the RPC/WalletConnect relay hosts are env-configured — narrow both once a nonce pass is done and hosts are pinned. **Verify the live wallet-connect flow (MetaMask + WalletConnect) after this change, before relying on it.** |
| Shared-store rate limiting | ✅ In place | Rate-limit counters now live in the indexer's SQLite DB (`rate_limits` table) instead of an in-process `Map`, so the limit is shared across every process pointed at the same `DB_PATH` (e.g. multiple PM2 instances on one host). A deployment that scales to independent-disk multi-host still needs a network-shared store (Redis) for a true cross-host limit — that's a further step, not needed for the current single-EC2 topology |
| Written security policies | 🟡 Partial | [SECURITY_POLICIES.md](./SECURITY_POLICIES.md) now documents access control, change management, incident response, retention, and vendor management as they actually operate today; it is a working document, not board/legal-reviewed policy |
| Per-reviewer evidence access + revocation | 🟡 Partial | `EVIDENCE_ACCESS_MODE=per-reviewer` (opt-in) authorizes evidence reads via a wallet signature checked live against on-chain `isReviewer()`/campaign creator — identity-based, not capability-based. Still can't revoke one specific named `DesignatedReviewers` address (fixed on-chain at creation — contract-level limitation). See [EVIDENCE_SECURITY_MODEL.md](./EVIDENCE_SECURITY_MODEL.md) |
| Evidence retention / deletion workflow | ✅ In place | `DELETE /evidence/:hash` (admin-only) tombstones a manifest immediately; `EVIDENCE_RETENTION_DAYS`/`AUDIT_RETENTION_DAYS` run the same automatically on a sweep. Off by default — must be opted into per deployment. See [EVIDENCE_SECURITY_MODEL.md](./EVIDENCE_SECURITY_MODEL.md) |

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

In product now (added):

- identity-based, per-reviewer evidence access checked live against on-chain
  reviewer/creator status (`EVIDENCE_ACCESS_MODE=per-reviewer`, opt-in — see
  [EVIDENCE_SECURITY_MODEL.md](./EVIDENCE_SECURITY_MODEL.md)).

Still required:

- enforce protected mode (and per-reviewer mode) in production by default,
  not opt-in;
- revocation for one specific named `DesignatedReviewers` address (fixed
  on-chain at creation today);
- vendor and data-classification policy (see
  [SECURITY_POLICIES.md](./SECURITY_POLICIES.md) for a first pass);
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

In product now (added):

- evidence retention/deletion tooling: `DELETE /evidence/:hash` for
  data-subject requests, `EVIDENCE_RETENTION_DAYS`/`AUDIT_RETENTION_DAYS` for
  automatic age-based sweeps (opt-in, off by default). See
  [EVIDENCE_SECURITY_MODEL.md](./EVIDENCE_SECURITY_MODEL.md).

Still required:

- privacy notice;
- a retention *schedule* — the tooling exists but no default retention window
  is set, and no one has decided what it should be;
- a documented data-subject request *process* (the technical means exists —
  who triggers it and how is not yet written down);
- vendor list and cross-border data review if applicable.

## What you should do next

1. Define the audit scope and system boundary.
2. Enable MFA and least-privilege access across AWS, GitHub, DNS, RPC vendors,
   WalletConnect, and any admin tooling — checklist:
   [OPERATIONAL_ACCESS_CHECKLIST.md](./OPERATIONAL_ACCESS_CHECKLIST.md).
3. Turn on the protected evidence API and admin audit token in production;
   consider `EVIDENCE_ACCESS_MODE=per-reviewer` for identity-based access.
4. Add centralized logging, alerting (paging), and backup/restore tests.
5. ~~Write short policies~~ — a first pass now exists:
   [SECURITY_POLICIES.md](./SECURITY_POLICIES.md) (access control, change
   management, incident response, retention, vendor management). Review and
   adapt it as the team/infra grows.
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
