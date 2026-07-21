# Operational Access Checklist (MFA + Least Privilege)

MFA and least-privilege access are **human/account-configuration controls,
not code** — no commit to this repo can turn them on. This checklist exists so
they're tracked somewhere concrete instead of just "known missing" in
[SOC2_READINESS.md](./SOC2_READINESS.md). Work through it whenever
provisioning access to a production system, and re-run it quarterly.

## Systems in scope

- [ ] AWS root account + IAM users (EC2 host, any other AWS resources)
- [ ] GitHub organization/repo (source, Actions secrets, branch protection)
- [ ] Domain registrar / DNS provider
- [ ] RPC provider account (Alchemy, Infura, or equivalent, if using a paid tier)
- [ ] WalletConnect Cloud project (if a paid/managed project is used)
- [ ] Any admin tooling that holds `ADMIN_TOKEN` / `EVIDENCE_WRITE_TOKEN` /
      `AUDIT_SALT` / `EVIDENCE_ENC_KEY` / the deployer private key

## Per-system checklist

For each system above:

- [ ] MFA is enabled for every account with access (not just the primary
      owner) — use an authenticator app or hardware key, not SMS where the
      provider offers a stronger option.
- [ ] Access is granted to named individuals, not shared logins.
- [ ] Access is scoped to what the person's role actually needs (e.g. a
      read-only DNS viewer doesn't need change permissions).
- [ ] There's a record of who currently has access and why (even a simple
      spreadsheet/doc beats no record).
- [ ] Removing access when someone's role changes or they leave is a known,
      immediate step — not something that happens "eventually."

## Quarterly review

- [ ] Re-list who has access to each system above.
- [ ] Confirm each person still needs that access for their current role.
- [ ] Revoke anything that's no longer justified.
- [ ] Rotate any shared secrets that more people have seen than strictly
      necessary (deployer key, `ADMIN_TOKEN`, etc.) if there's any doubt about
      who has copies.
- [ ] Record the date this review happened (even a git-tracked note in this
      file is enough — it's the "we did this" evidence a SOC 2 Type II audit
      is looking for).

## Specific to this project (as of this checklist's writing)

- Deployer key lives in `packages/hardhat/.env` (gitignored). See
  [SECURE_CONFIGURATION.md](./SECURE_CONFIGURATION.md) for custody guidance —
  a hardware wallet or dedicated low-balance key, never on the app server.
- `Covenant.owner()` is currently a single EOA, not a multisig — see M2 in
  [CONTRACT_SECURITY_REVIEW.md](./CONTRACT_SECURITY_REVIEW.md). Moving to a
  Gnosis Safe is the single highest-value item on this checklist for the
  smart-contract side specifically, because it turns "one person's MFA" into
  "N-of-M people must agree," which is a stronger control than MFA alone. Use
  `packages/hardhat/scripts/transferOwnership.ts` to make the move safely
  once you've deployed (or picked) the Safe.

## Review log

| Date | Reviewed by | Notes |
|---|---|---|
| _(none yet)_ | | First real review still needs to happen — this checklist was authored 2026-07-17 but no review has been logged against it yet. |
