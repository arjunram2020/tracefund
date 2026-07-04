"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { percent } from "../../../lib/format";
import {
  getArchive,
  legacyCampaignStatus,
  type ArchivedDeployment,
  type LegacyMilestone,
} from "../../../lib/legacy";
import { useLegacyCampaign, useLegacyMilestones } from "../../../hooks/useLegacy";
import { campaignPhoto } from "../../../lib/campaignImage";
import { Address } from "../../../components/Address";
import { Stat } from "../../../components/Stat";
import { ProgressBar } from "../../../components/ProgressBar";
import { EvidenceLink } from "../../../components/EvidenceLink";

/**
 * Archived campaign detail. Route param is "<archiveKey>-<campaignId>",
 * e.g. /history/approval-3 — plain numeric ids resolve against the original
 * approval-era contract so old links keep working.
 */
export default function LegacyCampaignDetailPage() {
  const params = useParams();
  const raw = Array.isArray(params.id) ? params.id[0] : params.id;

  let archive: ArchivedDeployment | undefined;
  let id: bigint | undefined;
  if (raw !== undefined) {
    const match = /^(?:([a-z0-9]+)-)?(\d+)$/.exec(raw);
    if (match) {
      archive = getArchive(match[1] ?? "approval");
      try {
        id = BigInt(match[2]);
      } catch {
        id = undefined;
      }
    }
  }

  const { campaign, isLoading, isError } = useLegacyCampaign(archive, id);
  const { milestones } = useLegacyMilestones(archive, id);

  if (!archive || id === undefined) {
    return <CenteredMessage title="Invalid campaign" body="That campaign id is not valid." />;
  }
  if (isError) {
    return (
      <CenteredMessage
        title="Campaign not found"
        body="No archived campaign exists with that id."
      />
    );
  }
  if (isLoading || !campaign) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="card h-40 animate-pulse bg-[var(--surface-bg)]" />
      </div>
    );
  }

  const status = legacyCampaignStatus(campaign);
  const raisedPct = percent(campaign.totalRaised, campaign.goalAmount);
  const inEscrow = campaign.totalRaised - campaign.totalReleased;
  const amount = archive.formatAmount;
  const symbol = archive.symbol;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/history" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        ← Campaign history
      </Link>

      {/* Header */}
      <div className="card mt-4 overflow-hidden">
        <div className="relative h-[160px] overflow-hidden">
          <img
            src={campaignPhoto(campaign.id)}
            alt=""
            className="h-full w-full object-cover"
            style={{ filter: "brightness(0.55) saturate(0.5)" }}
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)" }}
          />
          <div className="absolute bottom-4 left-6 flex flex-wrap items-center gap-2">
            <span className="pill bg-white/90 text-[var(--text-secondary)]">{archive.label}</span>
            <span className={`pill ${status.pill}`}>{status.label}</span>
            <span className="ml-1 text-xs text-white/60">
              by <Address address={campaign.creator} className="text-white/80" />
            </span>
          </div>
        </div>

        <div className="p-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">{campaign.title}</h1>
          <p className="mt-4 max-w-3xl text-[var(--text-secondary)]">{campaign.description}</p>

          {/* Read-only notice — this deployment is retired, never write to it. */}
          <div className="mt-5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-faint)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            This campaign ran in {symbol} on a previous version of the Covenant contract (
            <span className="font-mono text-xs">{archive.address}</span> on Base) and is closed to
            new donations. {archive.note} Everything shown is its permanent on-chain record.
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Raised" value={amount(campaign.totalRaised)} sub={symbol} accent />
            <Stat label="Goal" value={amount(campaign.goalAmount)} sub={symbol} />
            <Stat label="Released" value={amount(campaign.totalReleased)} sub={symbol} />
            <Stat label="Unreleased" value={amount(inEscrow)} sub={symbol} />
            <Stat label="Donors" value={campaign.donorCount.toString()} />
            <Stat
              label="Milestones"
              value={`${milestones.filter((m) => m.released).length}/${campaign.milestoneCount}`}
            />
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-sm text-[var(--text-secondary)]">
              <span>Final funding</span>
              <span className="font-mono">{raisedPct.toFixed(0)}%</span>
            </div>
            <ProgressBar value={raisedPct} />
          </div>
        </div>
      </div>

      {/* Milestones */}
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">Milestones</h2>
        <ol className="relative space-y-3">
          {milestones.map((m, i) => (
            <LegacyMilestoneRow
              key={i}
              milestone={m}
              index={i}
              milestones={milestones}
              archive={archive}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

function LegacyMilestoneRow({
  milestone: m,
  index: i,
  milestones,
  archive,
}: {
  milestone: LegacyMilestone;
  index: number;
  milestones: LegacyMilestone[];
  archive: ArchivedDeployment;
}) {
  const cumTarget = milestones.slice(0, i + 1).reduce((s, x) => s + x.amount, 0n);
  const amount = archive.formatAmount;
  return (
    <li className="card relative p-4">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            m.released
              ? "bg-[var(--brand-primary)] text-[var(--on-brand)]"
              : "bg-[var(--bg-subtle)] text-[var(--text-tertiary)]"
          }`}
        >
          {m.released ? "✓" : i + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-[var(--text-primary)]">{m.description}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-tertiary)]">
                at {amount(cumTarget)} {archive.symbol}
              </span>
              <span className="font-mono text-sm font-semibold text-[var(--brand-primary)]">
                +{amount(m.amount)} {archive.symbol}
              </span>
            </div>
          </div>

          <div className="mt-1.5">
            <span
              className={`pill ${
                m.released
                  ? "bg-[var(--brand-secondary)] text-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/25"
                  : "bg-[var(--bg-subtle)] text-[var(--text-tertiary)] ring-1 ring-[var(--border-primary)]"
              }`}
            >
              {m.released ? "Released" : "Never released"}
            </span>
          </div>

          {m.evidenceSubmitted && (
            <div className="mt-2 rounded-lg bg-[var(--bg-faint)] px-3 py-2 text-sm">
              <p className="mb-0.5 text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                On-chain proof
              </p>
              <EvidenceLink evidence={m.evidence} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">{title}</h1>
      <p className="mt-2 text-[var(--text-secondary)]">{body}</p>
      <Link href="/history" className="btn-secondary mt-6 inline-flex">
        Back to history
      </Link>
    </div>
  );
}
