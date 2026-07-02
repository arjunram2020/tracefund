"use client";

import Link from "next/link";
import { useAllCampaigns } from "../../hooks/useCovenant";
import { CampaignCard } from "../../components/CampaignCard";
import { ContractNotice } from "../../components/ContractNotice";

export default function CampaignsPage() {
  const { campaigns, isLoading, isError } = useAllCampaigns();
  const list = [...campaigns].reverse(); // newest first

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Campaigns</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Every campaign holds its donations in on-chain escrow until milestones are proven.
          </p>
        </div>
        <Link href="/create" className="btn-primary">
          + Create campaign
        </Link>
      </div>

      <div className="mb-6">
        <ContractNotice />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-52 animate-pulse bg-[var(--surface-bg)]" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-[var(--text-secondary)]">Could not load campaigns from the contract.</p>
      ) : list.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <p className="text-lg font-medium text-[var(--text-primary)]">No campaigns yet</p>
          <p className="max-w-sm text-sm text-[var(--text-secondary)]">
            Be the first to launch an accountable fundraiser. Add milestones, then let donors fund
            the escrow.
          </p>
          <Link href="/create" className="btn-primary mt-2">
            Create the first campaign
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <CampaignCard key={c.id.toString()} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}
