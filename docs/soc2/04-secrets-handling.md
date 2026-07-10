# Secrets Handling

**Question this answers:** How does Covenant manage keys, tokens, and other
credentials so they don't leak?

## The rules we follow

- **Secrets never live in the code or in Git.** `.gitignore` blocks every `.env`
  file (any name, any package) except the safe `*.example` templates, so a real
  secret cannot be committed by accident. ✅ Implemented
- **Public and secret config are clearly separated.** Anything the browser needs
  (RPC URLs, chain IDs) is marked `NEXT_PUBLIC_` and treated as public; real
  secrets (deploy keys, admin tokens, the evidence encryption key) live only in
  server-side config. Each package ships an `.env.example` that spells out which
  is which. ✅ Implemented ([details](../SECURE_CONFIGURATION.md))
- **No secrets in the browser bundle.** We reviewed every `NEXT_PUBLIC_` value;
  none is a secret, and the examples warn against pasting a key-bearing URL.
  ✅ Implemented
- **Deploy keys are validated.** A malformed deployer key is rejected up front
  instead of silently producing a bad deploy. ✅ Implemented
- **The evidence-encryption key is kept apart from backups.** Storing it with the
  encrypted database would defeat the encryption, so it's held separately.
  ✅ Documented / operational

## The secrets we hold

| Secret | Purpose | Where it belongs |
|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | Deploys/owns the contract | Local/CI only — never on the app server |
| `EVIDENCE_ENC_KEY` | Encrypts the database at rest | Server secret store, backed up separately |
| `EVIDENCE_WRITE_TOKEN` | Authorizes evidence writes | Server env |
| `ADMIN_TOKEN` | Guards the audit endpoint | Server env |
| RPC / API keys | Provider access | Server env (or referrer-restricted if public) |

## What's still operational (not automated yet)

- **A managed secrets store with rotation.** Today secrets live in host
  environment/`.env` files with least-privilege file permissions. A cloud secret
  manager and a rotation cadence are a funded, future upgrade. ⬜ Planned
- **GitHub secret scanning + push protection.** Free to enable on the repo;
  should be turned on so a pushed secret is blocked/alerted. ⬜ Planned
  (operational).
- **Break-glass procedure** for a suspected leak (revoke → rotate → redeploy →
  review the audit log). Drafted in [Incident Response](./06-incident-response.md);
  not yet exercised. 🟡 Partial

## The honest bottom line

The high-risk mistakes (committing a secret, shipping one to the browser,
mixing the encryption key into a backup) are prevented today. Formal rotation
and a managed secret store are deliberate next steps as we grow.
