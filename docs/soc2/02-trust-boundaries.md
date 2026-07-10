# Trust Boundaries

**Question this answers:** What data does Covenant actually hold, where does it
live, and what do we deliberately not collect?

We take a minimal-data posture: the less sensitive data we hold, the less there
is to lose. Here is exactly where everything lives.

## Where data lives

| Data | Where it lives | Who controls it | Sensitivity |
|---|---|---|---|
| Funds in escrow, campaign & milestone state, approvals | Base blockchain (public) | The smart contract | Public by design |
| Wallet addresses / transactions | Base blockchain (public) | The user's wallet | Public by design |
| Public evidence (creator opted in) | Blockchain + our registry | Creator's choice | Public by design |
| **Private evidence content** | Our registry, **encrypted**; plus creator/reviewer copies | Creator + reviewers (they hold the key) | Confidential — we cannot read it |
| Evidence access audit log | Our indexer database | Covenant | Internal / security |
| Operational secrets (keys, tokens) | Server env / secret store | Covenant | Highly sensitive |

## What we DON'T collect

- **No custody of user funds** outside the smart contract.
- **No accounts, passwords, or password databases** — users authenticate with
  their own wallet; we store no login credentials.
- **No unnecessary personal data.** Covenant does not require names, emails, or
  KYC to use the core product. Any personal detail only exists if a creator
  chooses to put it inside an evidence package — and if that package is private,
  it's encrypted so we can't read it.
- **No selling or sharing of customer data.** We are not in the data-brokerage
  business.

## The key boundary for enterprise customers

If you are a VC, grant program, hedge fund, or enterprise using Covenant, the
important line is this:

> **On-chain = public. Off-chain private evidence = encrypted and controlled by
> you.** Covenant's servers hold only ciphertext and metadata for private
> evidence; the ability to read it stays with you and your chosen reviewers.

That means the confidential substance of your milestone proof (financials,
customer data, internal documents) is never readable by Covenant, and never
written to a public ledger. We hold a fingerprint for integrity and encrypted
bytes for availability — nothing more. ✅ Implemented

See [Evidence Security Model](../EVIDENCE_SECURITY_MODEL.md) for how this works
technically, including its documented limits (e.g. metadata such as timing and
size is not hidden).
