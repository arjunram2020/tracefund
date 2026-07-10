# Change Management

**Question this answers:** How do code changes reach production without breaking
or weakening the product?

Change management is about making sure changes are reviewed, tested, and
traceable — not shipped on a whim.

## What's in place today

- **Everything is in version control.** All code, configuration, and these
  policies live in Git, so every change has an author, a timestamp, and a
  history. ✅ Implemented
- **Automated checks run on every change.** Continuous integration runs a
  type-check gate, a dependency-vulnerability audit, and CodeQL static analysis
  on pushes and pull requests. ✅ Implemented
- **Automated dependency updates.** Dependabot proposes grouped weekly updates so
  we stay patched. ✅ Implemented
- **Safe-by-default deploys.** The production API fails to start if its security
  configuration is missing, so a misconfigured change can't silently run open.
  ✅ Implemented
- **A pre-deploy checklist exists** (build, type-check, confirm the right
  contract deployment) in the deployment docs. ✅ Implemented

## What's partial

- **Required peer review + branch protection.** We use pull requests, but
  enforced review and protected branches (no direct pushes to `main`) should be
  switched on in the repo settings. 🟡 Partial
- **A written release/approval record.** Changes are traceable in Git history;
  a lightweight, explicit "who approved this release" record is not yet formal.
  🟡 Partial

## What's planned

- **Documented change-approval policy** with named approvers and a rollback
  standard. ⬜ Planned
- **Release evidence collection** (the paper trail an auditor samples) gathered
  automatically over time. ⬜ Planned

## Why this matters to customers

The controls that protect your funds are enforced on-chain and are effectively
immutable once deployed. For the off-chain app, our goal is that no change
reaches production without being reviewed, tested by CI, and recorded — and we
are tightening the last operational pieces (enforced review, formal approval
records) as we mature.
