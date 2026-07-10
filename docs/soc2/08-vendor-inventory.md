# Vendor Inventory

**Question this answers:** Which third parties are in Covenant's stack, what do
they touch, and why does that matter?

SOC 2 expects you to know your vendors — because their security becomes part of
yours. This is a living inventory plus a template to keep it current.

## Why this matters

Every vendor that can touch customer or operational data is part of your risk
surface. Keeping this list current (and reviewing it periodically) is a
low-cost control that auditors and enterprise customers both ask for.

## Current vendor inventory

> Fill in the account owner and review date for your deployment. Values below
> reflect the default architecture.

| Vendor | What it does | Data it touches | Sensitivity | Notes |
|---|---|---|---|---|
| **Base (L2 blockchain)** | Runs the smart contract & escrow | Public on-chain data | Public | Source of truth; not a confidentiality risk |
| **RPC provider** (e.g. public Base RPC / Alchemy / Infura) | Reads/writes chain data | Public tx data; your requests | Low–Med | If keyed, restrict the key by domain |
| **Hosting** (e.g. AWS EC2 or Vercel) | Runs the app + indexer | Ciphertext evidence, audit log, config | Med–High | Core infrastructure; MFA on the account |
| **GitHub** | Source control + CI | Source code, CI secrets | Med | Enable secret scanning + branch protection |
| **WalletConnect** | Mobile/cross-device wallet connect | Public wallet session data | Low | Project ID is public by design |
| **Domain / DNS registrar** | Domain + DNS | DNS records | Med | MFA; DNS is a common attack path |

## Vendor review template (copy per new vendor)

```
Vendor name:
Purpose / what it does for us:
Data it can access:            (none / public only / operational / customer)
Sensitivity:                   (low / medium / high)
Authentication:                (MFA on? SSO?)
Account owner:
Has a SOC 2 / security page?:  (link)
Data processing / DPA in place?: (yes / no / n/a)
Date added:
Last reviewed:
Offboarding steps if we drop them:
```

## Review cadence

- **Add a vendor** → fill in the template row before it goes live.
- **Review the whole list** → at least twice a year, or when the architecture
  changes. 🟡 Partial (list exists; recurring review not yet formalized)

## Status

- ✅ Inventory exists and is maintained in-repo.
- 🟡 A recurring, dated review with the account owners is still to be formalized.
- ⬜ Signed data-processing agreements where a vendor handles customer data.
