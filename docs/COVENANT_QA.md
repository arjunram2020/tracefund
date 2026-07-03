# Covenant Q&A

This document is a practical answer sheet for common strategic questions about Covenant. It is meant to help founders, contributors, and future AI agents answer clearly without overstating what the product does today.

It should be read alongside [COVENANT_CONTEXT.md](/Users/nityanthmaramreddy/Downloads/tracefund/docs/COVENANT_CONTEXT.md).

## 1. What is Covenant?

Short answer:

Covenant is verifiable escrow infrastructure for milestone-based fundraising.

Simple answer:

It is like crowdfunding, except funds are locked in escrow and released in stages when progress is shown.

Operational answer:

- A campaign creator defines milestones.
- Contributors fund the campaign.
- Funds stay locked in escrow.
- The creator submits proof of progress.
- Funds release according to milestone logic.
- Donations, evidence, and release history form a transparent audit trail.

Core principle:

Money should follow proof, not trust.

## 2. What is security like?

Short answer:

Covenant is strongest on fund-control security and transparency, not yet on full institutional workflow security.

What Covenant does well today:

- Funds are not paid out immediately to the fundraiser.
- Funds remain in smart-contract escrow until milestone conditions are met.
- Release history is transparent and tamper-resistant.
- The system reduces the risk of a creator receiving all funds upfront and disappearing.
- Evidence submission and release events create accountability that normal crowdfunding often lacks.

What this means in plain language:

The product gives backers more control over when money moves, and it creates a public record of what was promised and what was released.

Important limitation:

This does not yet mean Covenant is a complete institutional-grade security, compliance, or dispute-resolution system.

## 3. What security features are better than competitors?

This depends on which competitor is being discussed.

### Against standard crowdfunding platforms

Covenant has a clear advantage in:

- escrowed funds instead of immediate payout;
- milestone-based release instead of trust-only release;
- transparent release history;
- evidence-backed accountability;
- public auditability of campaign activity.

Better framing:

Traditional crowdfunding is mostly trust first, money now, updates later.

Covenant changes the flow to:

commit money, lock it, require proof, then release in stages.

### Against fundraising software or grant tools

Covenant may be stronger where users want:

- programmable escrow;
- milestone-based disbursement;
- visible proof history;
- public or shared audit trails.

### Against institutional finance workflows

This answer is weaker today.

Institutions will care about:

- custody;
- compliance;
- approval controls;
- permissions;
- reporting;
- dispute handling;
- legal fallback processes.

Covenant does not yet have a complete answer across all of those areas.

Honest positioning:

Our current security advantage is programmable escrow plus transparent capital release, not a full institutional control stack.

## 4. How does Covenant work better than an equity-based model?

Short answer:

It is not a replacement for equity. It solves a different problem.

Equity answers:

Who owns what?

Covenant answers:

When should committed money be released?

### Where Covenant works better

Covenant is stronger for:

- donations;
- grants;
- non-dilutive funding;
- cause-based fundraising;
- milestone-based disbursement;
- cases where trust and accountability matter more than ownership.

Benefits in those cases:

- no dilution;
- no need to price ownership;
- fewer securities complications in the MVP;
- clearer milestone-based fund control;
- easier alignment for grants, nonprofit funding, and accountability-heavy use cases.

### Where equity works better

Equity is stronger when the funder wants:

- ownership;
- upside;
- governance rights;
- legal economic participation in the result.

### Best way to explain the relationship

Covenant should be framed as complementary to equity or SAFE documents, not a substitute for them.

For investor use cases:

- legal agreements stay off-chain;
- ownership stays in legal documents;
- Covenant can potentially manage tranche-based capital release.

## 5. How do users get returns?

This question has two different meanings, and they should not be mixed together.

### A. Returns for donors or capital providers using the product

In the current crowdfunding-style version, there is usually no financial return.

What users get instead:

- accountability;
- transparency;
- staged release protection;
- greater confidence that funds are used toward stated milestones.

Honest answer:

If the product is being used for donations or grants, the return is confidence and impact, not equity upside.

### B. Returns for Covenant as a business

This is the stronger answer today.

Possible business-model paths:

- take a platform fee on funds raised;
- charge escrow or release fees;
- charge SaaS fees to fundraising platforms or grant programs;
- charge for integrations or infrastructure access;
- later add premium reporting, admin tooling, or compliance-oriented features.

This means Covenant can become a business even if many campaigns do not offer financial upside to contributors.

## 6. What is the strongest investor-facing answer today?

Best answer:

Covenant is strongest today as accountability infrastructure for fundraising and grants. It improves on trust-only fundraising by locking funds in escrow, releasing them in milestone-based stages, and creating a transparent audit trail. For investor workflows, it is best understood as a capital-release layer that can sit alongside off-chain legal agreements, not as a replacement for equity.

## 7. What are the honest weak spots right now?

These are the current weak answers or unfinished areas:

- who verifies that submitted proof is actually valid;
- what happens if a milestone fails;
- whether contributors can challenge a release;
- refunds or redirection of locked funds;
- dispute resolution;
- institutional compliance and custody expectations;
- KYC/KYB and permissions;
- the exact financial-return model for investor-backed campaigns;
- proof that this is better than mature institutional back-office processes.

These are not small details. They are future product and go-to-market questions that need explicit decisions.

## 8. What is the best concise answer set?

If someone asks quickly:

### What is Covenant?

Verifiable escrow infrastructure for milestone-based fundraising.

### Why is it safer than normal crowdfunding?

Because funds are locked in escrow and released in stages based on progress, instead of being handed over immediately.

### Why is it better than competitors?

Because it builds accountability into the money flow itself through escrow, milestone release, and transparent history.

### Is it better than equity?

Not as a replacement. It solves disbursement and accountability, while equity solves ownership.

### How do people get returns?

In donation and grant use cases, they do not get financial return; they get accountability and confidence. Covenant’s business returns would likely come from fees, software, and infrastructure revenue.

## 9. What should future contributors avoid saying?

Do not say:

- Covenant replaces equity.
- Covenant already solves institutional finance.
- Covenant already has dispute resolution, compliance, or verification fully handled.
- Covenant guarantees that proof is truthful in all cases.
- Covenant is valuable only because it uses blockchain.

Better language:

- Covenant improves how money is controlled and released.
- Covenant reduces trust risk by using escrow and milestone-based disbursement.
- Covenant is strongest today in fundraising, grants, and accountability-heavy workflows.
- Institutional use is a long-term direction, not the current finished state.
