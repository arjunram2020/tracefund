# Control Gaps & Next Steps

**Question this answers:** What is NOT done yet — stated plainly — and what's the
path forward?

Being honest about gaps is itself a control. Nothing here should be read as a
claim of SOC 2 compliance; it is a map of where we are and where we're going.

## Snapshot of status

### ✅ Implemented (working today)
- Smart-contract escrow with reviewer-gated milestone release.
- Client-side end-to-end encryption of private evidence (server holds only
  ciphertext; keys never reach us or the chain).
- Encryption at rest for the off-chain database.
- Evidence-access audit logging + an admin-only audit endpoint.
- Web/API hardening: security headers, strict CORS, rate limiting, request-size
  limits, input validation.
- Fail-closed production configuration.
- Secrets kept out of Git; clear public-vs-secret config separation; deploy-key
  validation.
- CI supply-chain controls: Dependabot, CodeQL, dependency audit.
- Backup, restore, and restore-test tooling with documented recovery targets,
  plus a same-host mirror and an offsite-copy script.
- Published security disclosure policy (`SECURITY.md`).
- Emergency pause / circuit breaker in the contract source (owner-only; halts
  inflows and releases, never refunds) — awaiting the next deployment.

### 🟡 Partial (mechanism exists; operational piece outstanding)
- **Backups:** scripts + offsite-copy exist; a running cron schedule and a
  configured offsite destination still need to be enabled on the server.
- **Uptime monitoring:** a free GitHub Actions health-check workflow exists;
  set the `HEALTH_URL` repo variable to activate it.
- **Change management:** CI + PRs exist; enforced peer review, branch protection,
  and a formal approval record are not switched on.
- **Access control:** minimized access + logging exist; formal, dated access
  reviews do not.
- **Incident response:** plan + tooling exist; no monitoring/paging and no
  practiced drill yet.
- **Vendor inventory:** the list exists; a recurring dated review does not.

### ⬜ Planned (deliberate future steps, some gated on funding)
- Enforced MFA + SSO across all operator accounts and vendors.
- A managed secrets store with a rotation cadence.
- Per-reviewer evidence access with revocation; a data retention/deletion policy.
- A full content-security policy on the frontend.
- Enable secret-scanning/push protection and branch protection on the repo (free
  toggles — see [Secure SDLC](./10-secure-sdlc.md)).
- Redeploy the contract with the emergency pause + a multisig owner.
- **An independent SOC 2 examination (Type I, then Type II).**

## Why some things are deliberately "later"

A SOC 2 **Type II** audit requires an independent CPA and months of collected
operating evidence — a real, recurring cost. Our strategy is to **build the
controls and infrastructure first** (most of the ✅ list above), so that when we
raise the capital to run a formal audit, the groundwork already exists and the
audit is faster and cheaper. We would rather have honest, working controls now
than a compliance claim we haven't earned.

## The path forward (rough order)

1. **Turn on the free operational toggles:** branch protection + required
   review, GitHub secret scanning/push protection, MFA everywhere, a backup cron
   + offsite copy, basic uptime monitoring, and a `SECURITY.md`.
2. **Formalize the light process:** dated access reviews, a vendor review
   cadence, a release-approval record, and one incident-response tabletop.
3. **Fund and run a readiness assessment**, then a SOC 2 Type I examination.
4. **Collect operating evidence** over 3–12 months toward a Type II.

## How to talk about this (honest language)

- ✅ "Covenant is building toward SOC 2 readiness and has implemented foundational
  security controls."
- ✅ "Covenant has not completed an independent SOC 2 examination."
- ❌ Do not say "Covenant is SOC 2 compliant" — only ever as a stated **future
  goal**.
