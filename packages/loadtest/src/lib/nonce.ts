import type { PublicClient } from "viem";

/**
 * Nonce-safe transaction sequencing.
 *
 * Each wallet gets (a) a mutex so its transactions serialize locally — two
 * concurrent sends from one wallet can never race for the same nonce — and
 * (b) a locally incremented nonce counter, initialized once from
 * eth_getTransactionCount(pending) and resynced whenever the node disagrees
 * ("nonce too low", "already known", replacement errors). Distinct wallets
 * stay fully parallel, which is the whole point of the actor model.
 */
export class NonceManager {
  private next = new Map<string, number>();
  private locks = new Map<string, Promise<unknown>>();

  constructor(private client: PublicClient) {}

  /** Serialize `fn` per address and hand it the next nonce to use. */
  async withNonce<T>(
    address: `0x${string}`,
    fn: (nonce: number) => Promise<T>,
  ): Promise<T> {
    const key = address.toLowerCase();
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    this.locks.set(key, new Promise<void>((r) => (release = r)));
    await prev.catch(() => {});
    try {
      let nonce = this.next.get(key);
      if (nonce === undefined) {
        nonce = await this.client.getTransactionCount({ address, blockTag: "pending" });
      }
      const result = await fn(nonce);
      this.next.set(key, nonce + 1);
      return result;
    } catch (err) {
      // On any failure the local counter may be stale — drop it so the next
      // send re-reads the pending count from the node.
      this.next.delete(key);
      throw err;
    } finally {
      release();
    }
  }

  /** Whether an error message looks like a nonce/sequencing problem (retryable). */
  static isNonceError(message: string): boolean {
    return /nonce too low|nonce too high|already known|replacement transaction|invalid nonce/i.test(
      message,
    );
  }
}
