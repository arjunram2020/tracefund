const CRITERIA = [
  {
    title: "Security",
    now: "Smart-contract escrow, reviewer-gated milestone release paths, evidence hashing, and baseline web security headers.",
    next: "MFA on every admin system, formal access reviews, SSO where possible, vulnerability scans, and documented incident response.",
  },
  {
    title: "Availability",
    now: "On-chain state remains the source of truth and the indexer can rebuild from chain history after outage.",
    next: "Backups, restore drills, uptime monitoring, alerting, and a documented disaster-recovery target.",
  },
  {
    title: "Confidentiality",
    now: "Private proof is end-to-end encrypted in the browser — the registry stores only ciphertext, keys never touch the chain or server — with encryption at rest and access audit logging as added layers.",
    next: "Add per-reviewer access and revocation, hide metadata, and define a retention/deletion policy.",
  },
  {
    title: "Processing Integrity",
    now: "Milestone payouts only release when contract rules pass; off-chain evidence is content-addressed and re-hashed before storage.",
    next: "Formal change management, production approvals, release checklists, and reconciliation monitoring.",
  },
  {
    title: "Privacy",
    now: "The product minimizes on-chain sensitive data by design.",
    next: "Publish a privacy notice, data inventory, retention schedule, and DSAR/deletion workflow if personal data is collected.",
  },
];

export default function TrustPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="card overflow-hidden">
        <div className="border-b border-[var(--border-primary)] bg-[var(--brand-muted)] px-6 py-8 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-primary)]">
            Trust Center
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            Covenant SOC 2 readiness
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
            Covenant is not self-certifying as SOC 2 compliant. SOC 2 requires an independent CPA
            examination and operating evidence over time. This page shows the controls the product
            already supports and the work still required before an audit.
          </p>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
          <div className="rounded-2xl bg-[var(--bg-faint)] p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
              Current posture
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
              SOC 2 readiness in progress
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--bg-faint)] p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
              Strongest control
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
              Verifiable fund-release logic
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--bg-faint)] p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
              Biggest remaining gap
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
              Operational controls and audit evidence
            </p>
          </div>
        </div>

        <div className="border-t border-[var(--border-primary)] px-6 py-8 sm:px-8">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Trust Services Criteria</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {CRITERIA.map((item) => (
              <div key={item.title} className="rounded-2xl border border-[var(--border-primary)] p-5">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{item.title}</h3>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                  In the product now
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{item.now}</p>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                  Still required
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{item.next}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--border-primary)] px-6 py-8 sm:px-8">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">What changed in this repo</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-[var(--surface-secondary-bg)] p-5">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Evidence audit trail</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                The indexer now logs evidence reads and writes with outcome, hashed requester
                fingerprint, hashed IP fingerprint, user agent, and request path.
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--surface-secondary-bg)] p-5">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Protected admin review</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Operators can enable bearer-protected evidence APIs and an admin-only audit endpoint
                for incident response and audit sampling.
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--surface-secondary-bg)] p-5">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Baseline hardening</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Next.js and the indexer now send basic security headers, and the indexer can be
                restricted to explicit CORS origins in hosted deployments.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border-primary)] px-6 py-8 sm:px-8">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Founder checklist before claiming SOC 2 readiness
          </h2>
          <div className="mt-4 grid gap-3">
            {[
              "Choose scope: hosted frontend, indexer API, cloud accounts, code repo, monitoring, and support tools.",
              "Turn on MFA for GitHub, AWS, domain/DNS, WalletConnect, Vercel or EC2 operators, and any RPC vendors.",
              "Restrict production access to named people, document approvals, and review access at least quarterly.",
              "Add centralized logging, uptime alerting, and documented incident response ownership.",
              "Back up the indexer database and run a restore test on a schedule.",
              "Publish security, privacy, retention, and vendor-management policies.",
              "Run a readiness assessment, then collect 3-12 months of evidence for a Type II audit.",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-[var(--border-primary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
