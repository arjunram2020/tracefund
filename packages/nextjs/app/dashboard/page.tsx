"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAllCampaigns,
  useCreatorStats,
  useTrustScore,
} from "../../hooks/useCovenant";
import { CampaignCard } from "../../components/CampaignCard";
import { ReputationBadge } from "../../components/ReputationBadge";
import { Stat } from "../../components/Stat";
import { ContractNotice } from "../../components/ContractNotice";
import { Address } from "../../components/Address";
import { formatUsdc } from "../../lib/format";

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { campaigns } = useAllCampaigns();
  const { stats } = useCreatorStats(address);
  const { score } = useTrustScore(address);

  const mine = address
    ? [...campaigns].reverse().filter((c) => c.creator.toLowerCase() === address.toLowerCase())
    : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Creator dashboard</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Your reputation and campaigns. Most actions happen on each campaign&apos;s page.
        </p>
      </div>

      <div className="mb-6">
        <ContractNotice />
      </div>

      {!isConnected ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-lg font-medium text-[var(--text-primary)]">Connect your wallet</p>
          <p className="max-w-sm text-sm text-[var(--text-secondary)]">
            Connect to see your creator reputation and the campaigns you&apos;ve launched.
          </p>
          <div className="mt-2">
            <ConnectButton />
          </div>
        </div>
      ) : (
        <>
          {/* Reputation + stats */}
          <div className="card mb-6 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Wallet <Address address={address} className="text-[var(--text-primary)]" />
                </p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Reputation only grows when reviewers approve your milestone proof — submissions
                  alone don&apos;t count.
                </p>
              </div>
              <ReputationBadge score={score} variant="full" />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Campaigns" value={(stats?.campaignsCreated ?? 0n).toString()} />
              <Stat label="Completed" value={(stats?.campaignsCompleted ?? 0n).toString()} />
              <Stat label="Approved" value={(stats?.milestonesApproved ?? 0n).toString()} />
              <Stat label="Submissions" value={(stats?.proofSubmissions ?? 0n).toString()} />
              <Stat label="Raised" value={formatUsdc(stats?.totalRaised)} sub="USDC" accent />
              <Stat label="Released" value={formatUsdc(stats?.totalReleased)} sub="USDC" />
            </div>
          </div>

          {/* Campaigns */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Your campaigns</h2>
            <Link href="/create" className="btn-secondary text-sm">
              + New campaign
            </Link>
          </div>

          {mine.length === 0 ? (
            <div className="card flex flex-col items-center gap-3 p-12 text-center">
              <p className="text-lg font-medium text-[var(--text-primary)]">No campaigns yet</p>
              <p className="max-w-sm text-sm text-[var(--text-secondary)]">
                Launch your first accountable fundraiser to start building reputation.
              </p>
              <Link href="/create" className="btn-primary mt-2">
                Create campaign
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map((c) => (
                <CampaignCard key={c.id.toString()} campaign={c} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
