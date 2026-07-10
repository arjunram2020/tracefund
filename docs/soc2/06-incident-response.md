# Incident Response

**Question this answers:** What does Covenant do when something goes wrong — a
suspected breach, a leaked secret, an outage, or corrupted data?

This is a lightweight, founder-usable plan. It is drafted and ready to follow;
it has not yet been exercised in a formal tabletop drill.

## Roles

- **Incident lead:** the founder / on-call engineer. Owns the response end to end.
- **Scribe:** whoever is available — keeps a timestamped log of what happened and
  what we did (this log is itself the evidence of our response).

## The response steps

1. **Detect & declare.** A problem is noticed (alert, report, or the access
   audit log). The incident lead declares an incident and starts the log.
2. **Contain.** Stop the bleeding: rotate a leaked credential, disable an
   affected endpoint, or take the indexer offline. On-chain funds remain
   governed by the contract and are not ours to move.
3. **Assess.** Determine what data or systems are affected. For evidence, check
   the access audit log (`GET /audit`) for who touched what.
4. **Eradicate & recover.** Remove the cause; restore data from a verified
   backup if needed (see [Backup & Recovery](./07-backup-recovery.md)).
5. **Notify.** If customer data is affected, inform affected customers promptly
   and honestly. Decide on any regulatory notice.
6. **Review.** Within a week, write a short blameless post-mortem: what happened,
   why, and the one or two changes that prevent a repeat.

## Specific playbooks

- **Leaked secret:** revoke → rotate the key/token → redeploy → review the audit
  log for misuse → confirm the secret is gone from wherever it leaked.
- **Data loss / corruption:** run `yarn restore:verify`, then restore the latest
  good backup with the indexer stopped; the on-chain event cache self-heals on
  restart.
- **Outage:** the blockchain remains the source of truth; the indexer can rebuild
  its state from the chain, so a full app outage does not lose committed data.

## What supports this today

- Structured, greppable logs and a dedicated evidence-access audit log.
  ✅ Implemented
- A tested restore path for off-chain data. ✅ Implemented

## What's not done yet

- **Monitoring and alerting** that would page us automatically. ⬜ Planned
- **A practiced tabletop drill** and a named external contact for disclosure.
  ⬜ Planned
- **A published security contact** (`SECURITY.md`) for outside reporters.
  ⬜ Planned

We have a plan and the tooling to act on it; formal alerting and rehearsal are
next steps.
