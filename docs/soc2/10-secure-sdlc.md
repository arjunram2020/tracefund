# Secure SDLC (Software Development Lifecycle)

**Question this answers:** How do code changes reach production safely, and how
would we prove to an enterprise that changes are reviewed and traceable?

This is a zero-cost baseline built entirely on GitHub-native and free features.
Some pieces are code/config in this repo; others are GitHub **settings you must
turn on manually** (a repo setting can't be committed). Both are listed below.

## What's in the repo now (✅ implemented as code/config)

- **CI gate** (`.github/workflows/ci.yml`): on every push/PR to `main` it
  type-checks the frontend, **compiles and runs the full contract test suite**
  (including the security tests), and runs a dependency audit.
- **CodeQL** static analysis (`.github/workflows/codeql.yml`).
- **Dependency Review** (`.github/workflows/dependency-review.yml`): blocks PRs
  that add dependencies with known high-severity vulnerabilities.
- **Dependabot** (`.github/dependabot.yml`): weekly grouped dependency updates.
- **PR template** (`.github/pull_request_template.md`): a security checklist plus
  a smart-contract redeploy checklist.
- **CODEOWNERS** (`.github/CODEOWNERS`): routes security-sensitive paths
  (contracts, deploy scripts, crypto, CI, security docs) to a required reviewer.

## What you must turn on manually in GitHub (⬜ settings — do these)

Go to **Settings → Branches → Add branch ruleset** (or "Branch protection rule")
for `main` and enable:

1. **Require a pull request before merging** — no direct pushes to `main`.
   - **Require approvals: 1** (or more).
   - **Require review from Code Owners** — makes `CODEOWNERS` binding.
   - **Dismiss stale approvals when new commits are pushed.**
2. **Require status checks to pass before merging**, and select these checks:
   - `Typecheck (nextjs)`
   - `Contracts (compile + test)`
   - `Dependency review`
   - `Analyze (javascript-typescript)` (CodeQL)
   - **Require branches to be up to date before merging.**
3. **Require conversation resolution before merging.**
4. **Do not allow bypassing the above** (uncheck "Allow administrators to
   bypass", or scope a ruleset that includes admins) — for real change-management
   evidence, the rules must apply to everyone.
5. **Require signed commits** (optional but recommended for auditability).

Then, under **Settings → Code security and analysis**, enable (all free for this
public repo):

- **Dependency graph** (required for Dependency Review) — usually on by default.
- **Dependabot alerts** and **Dependabot security updates.**
- **Secret scanning** and **Push protection** — blocks pushes that contain a
  detected secret. This is the backstop for [Secrets Handling](./04-secrets-handling.md).
- **CodeQL / code scanning** (the workflow is already in the repo; enable the
  feature so alerts surface in the Security tab).

> Note: Dependency Review and CodeQL are free on **public** repositories. If this
> repo is ever made private, those specific features require GitHub Advanced
> Security — the rest of this baseline still works.

## Required PR review guidance (how we actually review)

- **Every change goes through a PR.** No direct commits to `main`.
- **At least one approving review**, and **Code Owner approval** for anything
  under contracts, deploy scripts, crypto, CI, or security docs.
- Reviewers check the PR template's security checklist — especially: no secrets
  in the diff, nothing secret behind `NEXT_PUBLIC_`, tests added, CI green.
- **Smart-contract PRs get extra scrutiny:** the security test suite must pass,
  and the change must be reflected in
  [CONTRACT_SECURITY_REVIEW.md](../CONTRACT_SECURITY_REVIEW.md). Remember the
  deployed contract is immutable — a contract change means a new deployment.
- **Self-merging is allowed only for docs/config trivialities**, and even then CI
  must pass. Anything touching security or funds needs a second set of eyes.

## Release / change documentation template

Keep a running log so any change is traceable — this is the auditability
enterprises ask for. Add an entry per production change (a `CHANGELOG.md`, GitHub
Releases, or a simple log file all work).

```
### <date> — <short title>
- Change: <what changed, 1–2 lines>
- Type: [app | contract | infra | docs]
- PR: #<number>   Commit: <short sha>
- Reviewed/approved by: <name>
- CI: <green? link>
- Rollout: <how it reached prod — merge/deploy/env change/indexer restart>
- Contract deploy (if any): address <0x…>, block <n>, network <base/…>,
    owner <multisig 0x…>, Basescan verified [y/n]
- Rollback plan: <how to revert>
- Notes / risk: <anything to watch>
```

For **contract deployments specifically**, also record: the commit hash built,
the deployer address, the resulting `deployedContracts.json` entry, and
confirmation that the post-deploy verification in `scripts/deploy.ts` passed.

## Status summary

- ✅ **Implemented (code):** CI with contract tests, CodeQL, Dependency Review,
  Dependabot, PR template, CODEOWNERS.
- 🟡 **Partial (needs the manual toggles above):** branch protection, required
  Code Owner review, required status checks, secret scanning + push protection.
- ⬜ **Planned:** signed commits enforced, a maintained release/change log, and a
  formal contract-deploy runbook sign-off.

None of this claims SOC 2 compliance; it is the change-management and
auditability groundwork that a future audit builds on.
