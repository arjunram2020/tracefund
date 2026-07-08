import {
  BaseError,
  ContractFunctionRevertedError,
  type Abi,
  type Account,
  type PublicClient,
  type WalletClient,
} from "viem";
import { NonceManager } from "./nonce.js";
import { Semaphore } from "./pool.js";
import { classifyRevert, type Metrics } from "./metrics.js";
import { sleep } from "./config.js";

export interface TxContext {
  publicClient: PublicClient;
  walletFor: (account: Account) => WalletClient;
  nonces: NonceManager;
  inflight: Semaphore;
  metrics: Metrics;
  /** ms to wait for a receipt before declaring the tx stuck. */
  receiptTimeoutMs: number;
}

export interface TxRequest {
  op: string;
  role?: string;
  account: Account;
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: unknown[];
}

function revertReason(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return revert.reason ?? revert.shortMessage;
    }
    // `details` carries the node's own message (e.g. the actual RPC complaint),
    // which is far more diagnostic than viem's generic shortMessage.
    return err.details ? `${err.shortMessage} [${err.details.slice(0, 120)}]` : err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

const isRevert = (err: unknown): boolean =>
  err instanceof BaseError &&
  err.walk((e) => e instanceof ContractFunctionRevertedError) !== null;

// "Missing or invalid parameters" is hardhat node's occasional response to a
// perfectly valid request under concurrent load — observed to succeed on
// retry with identical parameters. Treated as transient, not as a revert.
const isTransient = (msg: string): boolean =>
  /timeout|timed out|ECONNRESET|ECONNREFUSED|socket|fetch failed|429|rate limit|underpriced|missing or invalid parameters/i.test(
    msg,
  );

/**
 * Send one contract write with the full production-shaped pipeline:
 * global in-flight cap -> per-wallet nonce lock -> gas estimation (client-side
 * revert detection with reason) -> broadcast -> receipt wait. Retries only
 * what is safe to retry (nonce races, transport blips) — never a revert.
 * Every outcome is recorded in metrics; failures never throw out of an actor loop.
 */
export async function sendTx(ctx: TxContext, req: TxRequest): Promise<"ok" | "failed"> {
  const started = Date.now();
  const release = await ctx.inflight.acquire();
  try {
    const wallet = ctx.walletFor(req.account);
    for (let attempt = 0; ; attempt++) {
      try {
        const hash = await ctx.nonces.withNonce(req.account.address as `0x${string}`, (nonce) =>
          wallet.writeContract({
            address: req.address,
            abi: req.abi,
            functionName: req.functionName,
            args: req.args,
            nonce,
            account: req.account,
            chain: wallet.chain,
          } as never),
        );
        const submitted = Date.now();
        const receipt = await ctx.publicClient.waitForTransactionReceipt({
          hash,
          timeout: ctx.receiptTimeoutMs,
          pollingInterval: 250,
        });
        ctx.metrics.record({
          op: req.op,
          role: req.role,
          wallet: req.account.address,
          status: receipt.status === "success" ? "ok" : "reverted",
          latencyMs: submitted - started,
          confirmMs: Date.now() - submitted,
          gasUsed: receipt.gasUsed.toString(),
          txHash: hash,
          error: receipt.status === "success" ? undefined : "reverted on-chain (post-broadcast)",
        });
        return receipt.status === "success" ? "ok" : "failed";
      } catch (err) {
        const msg = revertReason(err);
        if (isRevert(err)) {
          // Deterministic contract rejection — surfaced during estimation.
          ctx.metrics.record({
            op: req.op,
            role: req.role,
            wallet: req.account.address,
            status: classifyRevert(msg),
            latencyMs: Date.now() - started,
            error: msg,
          });
          return "failed";
        }
        const nonceIssue = NonceManager.isNonceError(msg);
        if ((nonceIssue || isTransient(msg)) && attempt < 2) {
          await sleep(100 * (attempt + 1) + Math.random() * 150);
          continue; // NonceManager resynced itself on failure
        }
        ctx.metrics.record({
          op: req.op,
          role: req.role,
          wallet: req.account.address,
          status: nonceIssue ? "nonce-error" : "error",
          latencyMs: Date.now() - started,
          error: msg,
        });
        return "failed";
      }
    }
  } finally {
    release();
  }
}

/** Timed contract read recorded into metrics (never throws). */
export async function timedRead<T>(
  ctx: TxContext,
  op: string,
  role: string | undefined,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const started = Date.now();
  try {
    const result = await fn();
    ctx.metrics.record({ op, role, status: "ok", latencyMs: Date.now() - started });
    return result;
  } catch (err) {
    ctx.metrics.record({
      op,
      role,
      status: "error",
      latencyMs: Date.now() - started,
      error: err instanceof BaseError ? err.shortMessage : String(err),
    });
    return undefined;
  }
}
