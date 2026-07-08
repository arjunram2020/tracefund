import { mnemonicToAccount } from "viem/accounts";
import type { HDAccount } from "viem";
import { ACTOR_INDEX_OFFSET, type LoadtestConfig, type RoleMix } from "./config.js";

export type Role = "creator" | "donor" | "reviewer" | "reader";

export interface ActorWallet {
  /** HD derivation index — the wallet is fully reproducible from (mnemonic, index). */
  index: number;
  role: Role;
  account: HDAccount;
  address: `0x${string}`;
}

/** Derive one wallet at an explicit HD index (m/44'/60'/0'/0/index). */
export function deriveWallet(mnemonic: string, index: number): HDAccount {
  return mnemonicToAccount(mnemonic, { addressIndex: index });
}

export interface ActorSet {
  all: ActorWallet[];
  creators: ActorWallet[];
  donors: ActorWallet[];
  reviewers: ActorWallet[];
  readers: ActorWallet[];
}

/**
 * Deterministically split `users` wallets into roles from a scenario mix.
 * Index layout within the actor range is stable: creators first, then
 * reviewers, then donors, then readers — so wallet #103's role never changes
 * between runs of the same preset, and results are comparable run-over-run.
 */
export function deriveActors(cfg: LoadtestConfig): ActorSet {
  const { users, mnemonic } = cfg;
  const mix: RoleMix = cfg.scenario.mix;

  let creatorCount = Math.max(1, Math.round(users * mix.creators));
  let reviewerCount = cfg.scenario.sharedReviewerCount ?? Math.round(users * mix.reviewers);
  // Designated-model scenarios need at least the committee threshold.
  if (cfg.scenario.approvalModels.includes("designated")) {
    reviewerCount = Math.max(reviewerCount, cfg.scenario.reviewerThreshold);
  }
  let readerCount = Math.round(users * mix.readers);
  let donorCount = users - creatorCount - reviewerCount - readerCount;
  if (donorCount < 1) {
    donorCount = 1;
    readerCount = Math.max(0, users - creatorCount - reviewerCount - donorCount);
  }

  const roles: Role[] = [
    ...Array<Role>(creatorCount).fill("creator"),
    ...Array<Role>(reviewerCount).fill("reviewer"),
    ...Array<Role>(donorCount).fill("donor"),
    ...Array<Role>(readerCount).fill("reader"),
  ];

  const all: ActorWallet[] = roles.map((role, i) => {
    const index = ACTOR_INDEX_OFFSET + i;
    const account = deriveWallet(mnemonic, index);
    return { index, role, account, address: account.address };
  });

  return {
    all,
    creators: all.filter((w) => w.role === "creator"),
    donors: all.filter((w) => w.role === "donor"),
    reviewers: all.filter((w) => w.role === "reviewer"),
    readers: all.filter((w) => w.role === "reader"),
  };
}
