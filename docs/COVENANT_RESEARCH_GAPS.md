# Covenant Research Gaps

This document lists the strategic and product questions that Covenant does not yet answer strongly enough. These are not implementation tasks by default. They are areas that need more research, clearer decisions, or explicit product design before Covenant can be positioned more aggressively.

It should be read alongside:

- [COVENANT_CONTEXT.md](/Users/nityanthmaramreddy/Downloads/tracefund/docs/COVENANT_CONTEXT.md)
- [COVENANT_QA.md](/Users/nityanthmaramreddy/Downloads/tracefund/docs/COVENANT_QA.md)

## Why this document exists

Right now, Covenant has a credible story around:

- escrow;
- milestone-based release;
- transparency;
- accountability;
- fundraising and grants as early use cases.

The weaker areas are what matter if the company wants to expand toward B2B platforms, grant operators, investors, or institutions.

This document makes those gaps explicit.

## 1. Proof verification

Core question:

Who decides that milestone proof is good enough to justify release?

Why this matters:

The whole product narrative depends on the idea that money follows proof. If proof quality is unclear, then the strongest part of the narrative becomes weak under scrutiny.

Open models to research:

- creator-submitted proof with automatic release;
- donor approval;
- lead donor or lead investor approval;
- platform admin approval;
- third-party verifier approval;
- optimistic release with challenge period;
- hybrid off-chain review with on-chain release.

What needs research:

- which model fits consumer fundraising;
- which model fits grants;
- which model fits startup or investor workflows;
- how much friction users will tolerate;
- how much trust each model actually removes.

## 2. Milestone failure handling

Core question:

What happens if a milestone is not met?

Why this matters:

Escrow without a clear failure state leaves a major unanswered product risk.

Possible outcomes to research:

- funds remain locked;
- partial release;
- refund path;
- campaign pause;
- administrator intervention;
- third-party decision;
- re-scoping milestones.

What needs research:

- what users expect in donation contexts;
- what grant operators expect;
- what investors would require;
- legal and operational consequences of each path.

## 3. Disputes, challenges, and governance

Core question:

What happens when contributors, creators, or operators disagree?

Why this matters:

This becomes unavoidable once real money moves at meaningful scale.

Research topics:

- challenge windows;
- evidence review standards;
- arbitration models;
- admin override risk;
- user trust tradeoffs between decentralization and practical resolution;
- whether different customer segments need different dispute models.

Current state:

There is no strong finished answer here yet.

## 4. Compliance, identity, and institutional controls

Core question:

What would institutions, grant operators, or regulated platforms require before using Covenant?

Why this matters:

The current story is strong for demos and early-stage fundraising narratives, but weaker for serious institutional adoption.

Research areas:

- KYC/KYB expectations;
- AML implications;
- custody structure;
- role-based permissions;
- approval chains;
- audit/reporting requirements;
- accounting exports;
- legal review expectations;
- data retention and privacy issues.

Important note:

This research is required before claiming institutional readiness. It is not optional if the long-term direction includes large allocators.

## 5. Fiat rails and custody model

Core question:

How does Covenant work for users who do not want to interact directly with crypto wallets or on-chain assets?

Why this matters:

Many real customers will prefer card, ACH, wire, custodian, or admin-driven flows.

Research areas:

- stablecoin-only model versus hybrid fiat/on-chain model;
- card-to-stablecoin flows;
- ACH/wire into custody arrangements;
- off-chain escrow with on-chain attestations;
- institutional reluctance to place capital directly into new smart contracts.

Current state:

The product story is clearer than the payment-rail story.

## 6. Business model clarity

Core question:

How exactly does Covenant make money?

Why this matters:

A strong product story is not enough. Revenue logic needs to be explicit.

Research areas:

- take rate on funds raised;
- escrow or release fees;
- SaaS pricing for fundraising platforms;
- grant-program pricing;
- enterprise integration fees;
- API/infrastructure licensing;
- premium reporting/admin modules.

What needs validation:

- which buyer actually pays;
- whether pricing should be volume-based, seat-based, platform-based, or success-based;
- whether donation platforms and grant operators are willing to pay for trust infrastructure directly.

## 7. Investor return logic

Core question:

If Covenant moves toward investor use cases, how do capital providers actually get returns?

Why this matters:

This is one of the weakest current answers if Covenant is pitched too aggressively toward venture or institutional capital.

Research areas:

- when Covenant should remain strictly non-dilutive;
- when it should sit beside SAFE or equity agreements;
- whether debt, revenue-share, private credit, or grant structures fit better than equity-like stories;
- whether investors care more about downside control than upside creation in some workflows.

Current state:

Covenant currently has a much stronger accountability story than investor-return story.

## 8. Segment selection and go-to-market wedge

Core question:

Which customer segment is most likely to adopt first?

Why this matters:

The product can be described across many markets, but that does not mean all of them are good first markets.

Candidate segments:

- niche crowdfunding platforms;
- film or creator fundraising;
- auction platforms with escrow/trust issues;
- university or student funds;
- grant programs;
- Web3/public-goods grants;
- accelerators;
- angel syndicates;
- small venture or startup funding programs.

What needs research:

- who has the sharpest pain;
- who can buy fastest;
- who needs the least compliance overhead;
- who can pilot without long procurement cycles;
- who gains immediate trust benefits from milestone-based release.

## 9. Competitive landscape

Core question:

Who are the real competitors, and where is Covenant actually differentiated?

Why this matters:

Weak competitive framing creates weak fundraising and weak product decisions.

Research should separate competitors by category:

- standard crowdfunding platforms;
- niche fundraising software;
- grant management platforms;
- escrow or payout workflow tools;
- internal manual workflows and spreadsheets;
- institutional back-office processes.

What needs validation:

- where current differentiation is strong;
- where differentiation is only conceptual;
- where incumbents already solve enough of the problem;
- where blockchain helps materially versus where it adds friction.

## 10. Narrative discipline

Core question:

What should Covenant claim now, and what should it avoid claiming until the product and research catch up?

Why this matters:

Over-claiming will create credibility problems faster than under-claiming.

Needs clear guidance on:

- when to use the crowdfunding framing;
- when to use the infrastructure framing;
- when not to use investor or institutional language;
- how to explain the relationship to equity and legal agreements;
- how to talk about blockchain as infrastructure rather than hype.

## Priority order for research

If research has to be prioritized, the likely order is:

1. proof verification model;
2. milestone failure and dispute handling;
3. best early customer segment;
4. business model and who pays;
5. investor-return logic for capital-market narratives;
6. fiat rails, custody, and compliance requirements;
7. deeper institutional workflow requirements.

## Current honest assessment

Covenant already has a credible answer to:

- why escrow is useful;
- why milestone-based release improves accountability;
- why fundraising and grants are strong early narratives.

Covenant does not yet have equally strong answers to:

- who validates proof in difficult cases;
- how failed milestones are resolved;
- how serious institutional controls work;
- how investor returns are created or documented;
- which exact market should be the first scalable wedge.

Those are not minor open questions. They are core strategy questions that need direct research and explicit decisions.
