import { ethers } from "hardhat";
import type { Provider } from "ethers";
import { ROLE_WEIGHTS, type Role } from "./config";

export interface SwarmWallet {
  index: number;
  role: Role;
  wallet: ethers.Wallet;
}

/** Deterministic role assignment: same index always gets the same role, for
 *  any total user count, so `--users 100` is a strict prefix of `--users 1000`. */
export function roleForIndex(index: number): Role {
  // Interleave roles over a fixed-size block instead of splitting the index
  // range into contiguous bands, so a small `--users N` run still gets a
  // representative mix instead of "the first N are all creators".
  const BLOCK = 20; // matches the 5/10/65/20 % weights exactly at this size
  const counts = ROLE_WEIGHTS.map(({ weight }) => Math.round(weight * BLOCK));
  const slot = index % BLOCK;
  let cursor = 0;
  for (let i = 0; i < ROLE_WEIGHTS.length; i++) {
    cursor += counts[i];
    if (slot < cursor) return ROLE_WEIGHTS[i].role;
  }
  return ROLE_WEIGHTS[ROLE_WEIGHTS.length - 1].role;
}

/** Derive `count` deterministic HD wallets from `mnemonic`, starting at
 *  `offset` in the derivation path, connected to `provider`. */
export function deriveWallets(
  mnemonic: string,
  offset: number,
  count: number,
  provider: Provider,
): SwarmWallet[] {
  const wallets: SwarmWallet[] = [];
  for (let i = 0; i < count; i++) {
    const path = `m/44'/60'/0'/0/${offset + i}`;
    const hd = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
    const wallet = new ethers.Wallet(hd.privateKey, provider);
    wallets.push({ index: i, role: roleForIndex(i), wallet });
  }
  return wallets;
}

export function summarizeRoles(wallets: SwarmWallet[]): Record<Role, number> {
  const summary: Record<Role, number> = { creator: 0, donor: 0, reviewer: 0, readonly: 0 };
  for (const w of wallets) summary[w.role] += 1;
  return summary;
}
