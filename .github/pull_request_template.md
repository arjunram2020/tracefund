<!--
  Covenant PR template. Keep it short and honest. The point is a reviewable,
  auditable record of what changed and why — not paperwork.
-->

## What & why

<!-- One or two sentences: what this change does and the reason for it. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Security / hardening
- [ ] Smart-contract change (**requires redeploy + re-verify — see checklist**)
- [ ] Docs / config only

## Security checklist

- [ ] No secrets, private keys, or tokens added to the diff (checked `git diff`).
- [ ] No secret placed behind a `NEXT_PUBLIC_` name (those ship to the browser).
- [ ] New/changed env vars are documented in the relevant `.env.example`.
- [ ] Tests added or updated for the change; CI is green.
- [ ] For dependency changes: reviewed the dependency-review result on this PR.

## Smart-contract changes only

<!-- Delete this section if no .sol changed. -->

- [ ] Contract tests (`yarn workspace @covenant/hardhat test`) pass, including the
      security suite (`test/CovenantSecurity.ts`).
- [ ] Change is described in `docs/CONTRACT_SECURITY_REVIEW.md` if it affects
      escrow, releases, approvals, refunds, or admin powers.
- [ ] Redeploy plan noted (the deployed contract is immutable; this needs a new
      deployment + Basescan verification + frontend ABI re-export).

## Release / rollout notes

<!-- How does this reach production? Anything to watch, any manual step
     (env var to set, GitHub setting to toggle, indexer restart, redeploy)? -->
