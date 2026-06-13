"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAllCampaigns,
  useCreatorStats,
  useTrustScore,
} from "../../hooks/useTraceFund";
import { CampaignCard } from "../../components/CampaignCard";
import { ReputationBadge } from "../../components/ReputationBadge";
import { Stat } from "../../components/Stat";
import { ContractNotice } from "../../components/ContractNotice";
import { Address } from "../../components/Address";
import { formatEth } from "../../lib/format";

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
        <h1 className="text-2xl font-bold text-white">Creator dashboard</h1>
        <p className="mt-1 text-sm text-gray-400">
          Your reputation and campaigns. Most actions happen on each campaign&apos;s page.
        </p>
      </div>

      <div className="mb-6">
        <ContractNotice />
      </div>

      {!isConnected ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-lg font-medium text-white">Connect your wallet</p>
          <p className="max-w-sm text-sm text-gray-400">
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
                <p className="text-sm text-gray-400">
                  Wallet <Address address={address} className="text-gray-200" />
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Reputation grows as you complete proof-backed milestones.
                </p>
              </div>
              <ReputationBadge score={score} variant="full" />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Campaigns" value={(stats?.campaignsCreated ?? 0n).toString()} />
              <Stat label="Completed" value={(stats?.campaignsCompleted ?? 0n).toString()} />
              <Stat label="Milestones" value={(stats?.milestonesCompleted ?? 0n).toString()} />
              <Stat label="Evidence" value={(stats?.evidenceUpdates ?? 0n).toString()} />
              <Stat label="Raised" value={formatEth(stats?.totalRaised)} sub="ETH" accent />
              <Stat label="Released" value={formatEth(stats?.totalReleased)} sub="ETH" />
            </div>
          </div>

          {/* Campaigns */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Your campaigns</h2>
            <Link href="/create" className="btn-secondary text-sm">
              + New campaign
            </Link>
          </div>

          {mine.length === 0 ? (
            <div className="card flex flex-col items-center gap-3 p-12 text-center">
              <p className="text-lg font-medium text-white">No campaigns yet</p>
              <p className="max-w-sm text-sm text-gray-400">
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
