import * as fs from "node:fs";
import * as path from "node:path";

/**
 * One flat record per operation (tx, RPC read, HTTP request), plus a summary
 * pass at the end. Everything lands in results/<timestamp>-<label>.{json,csv}
 * so runs can be diffed and graphed without any extra tooling.
 */

export type OpStatus =
  | "ok"
  | "reverted-expected" // business-rule rejection the scenario anticipates
  | "reverted" // unexpected revert — a finding
  | "nonce-error"
  | "error"; // transport/timeout/HTTP failure

export interface OpRecord {
  t: number; // ms since run start
  op: string; // e.g. "donate", "GET /campaigns", "rpc:getAllCampaigns"
  role?: string;
  wallet?: string;
  status: OpStatus;
  latencyMs: number; // submit latency (tx) or full round trip (read/http)
  confirmMs?: number; // tx broadcast -> receipt
  gasUsed?: string;
  txHash?: string;
  httpStatus?: number;
  bytes?: number;
  error?: string;
}

// Business-rule reverts that a realistic population WILL hit; they indicate
// the contract defending itself, not a harness bug. Anything else that
// reverts is surfaced as a finding.
const EXPECTED_REVERTS = [
  "Donation exceeds campaign goal",
  "Milestone deadline passed",
  "Milestone not funded",
  "No proof awaiting review",
  "Already reviewed this submission",
  "Milestone not awaiting proof",
  "Campaign not active",
  "One campaign per day",
  "Campaign limit reached",
  "Not an authorized reviewer",
  "Nothing to refund",
  "Campaign not cancelled",
];

export function classifyRevert(message: string): OpStatus {
  return EXPECTED_REVERTS.some((m) => message.includes(m)) ? "reverted-expected" : "reverted";
}

const quantile = (sorted: number[], q: number): number =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

export class Metrics {
  readonly records: OpRecord[] = [];
  readonly startedAt = Date.now();
  private counters = new Map<string, number>();

  now(): number {
    return Date.now() - this.startedAt;
  }

  record(rec: Omit<OpRecord, "t">): void {
    this.records.push({ t: this.now(), ...rec });
  }

  /** Free-form counters for things that aren't operations (e.g. donors skipping a locked milestone). */
  bump(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  summary() {
    const byOp = new Map<string, OpRecord[]>();
    for (const r of this.records) {
      const list = byOp.get(r.op) ?? [];
      list.push(r);
      byOp.set(r.op, list);
    }
    const elapsedSec = this.now() / 1000;

    const ops = [...byOp.entries()].map(([op, recs]) => {
      const lat = recs.map((r) => r.latencyMs).sort((a, b) => a - b);
      const conf = recs
        .filter((r) => r.confirmMs !== undefined)
        .map((r) => r.confirmMs!)
        .sort((a, b) => a - b);
      const gas = recs.filter((r) => r.gasUsed).map((r) => Number(r.gasUsed));
      const count = (s: OpStatus) => recs.filter((r) => r.status === s).length;
      return {
        op,
        total: recs.length,
        ok: count("ok"),
        revertedExpected: count("reverted-expected"),
        revertedUnexpected: count("reverted"),
        nonceErrors: count("nonce-error"),
        errors: count("error"),
        throughputPerSec: +(recs.length / Math.max(elapsedSec, 1)).toFixed(2),
        latencyMs: {
          p50: quantile(lat, 0.5),
          p95: quantile(lat, 0.95),
          p99: quantile(lat, 0.99),
          max: lat[lat.length - 1] ?? 0,
        },
        confirmMs: conf.length
          ? { p50: quantile(conf, 0.5), p95: quantile(conf, 0.95), max: conf[conf.length - 1] }
          : undefined,
        avgGasUsed: gas.length ? Math.round(gas.reduce((s, g) => s + g, 0) / gas.length) : undefined,
      };
    });

    // Top unexpected failure messages — the actual findings list.
    const failures = new Map<string, number>();
    for (const r of this.records) {
      if ((r.status === "reverted" || r.status === "error" || r.status === "nonce-error") && r.error) {
        const key = `${r.op}: ${r.error.slice(0, 160)}`;
        failures.set(key, (failures.get(key) ?? 0) + 1);
      }
    }

    return {
      startedAt: new Date(this.startedAt).toISOString(),
      elapsedSec: +elapsedSec.toFixed(1),
      totalOps: this.records.length,
      overallThroughputPerSec: +(this.records.length / Math.max(elapsedSec, 1)).toFixed(2),
      ops: ops.sort((a, b) => b.total - a.total),
      counters: Object.fromEntries(this.counters),
      topFailures: [...failures.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([message, count]) => ({ count, message })),
    };
  }

  write(outDir: string, label: string): { jsonPath: string; csvPath: string } {
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date(this.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const base = path.join(outDir, `${stamp}-${label}`);

    const jsonPath = `${base}.json`;
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({ summary: this.summary(), records: this.records }, null, 2),
    );

    const csvPath = `${base}.csv`;
    const cols: (keyof OpRecord)[] = [
      "t", "op", "role", "wallet", "status", "latencyMs", "confirmMs",
      "gasUsed", "txHash", "httpStatus", "bytes", "error",
    ];
    const esc = (v: unknown) =>
      v === undefined || v === null
        ? ""
        : /[",\n]/.test(String(v))
          ? `"${String(v).replace(/"/g, '""')}"`
          : String(v);
    fs.writeFileSync(
      csvPath,
      [cols.join(","), ...this.records.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n"),
    );
    return { jsonPath, csvPath };
  }

  printSummary(): void {
    const s = this.summary();
    console.log(`\n===== ${s.totalOps} ops in ${s.elapsedSec}s (${s.overallThroughputPerSec}/s) =====`);
    console.table(
      s.ops.map((o) => ({
        op: o.op,
        total: o.total,
        ok: o.ok,
        "rev(exp)": o.revertedExpected,
        "rev(!!)": o.revertedUnexpected,
        nonce: o.nonceErrors,
        err: o.errors,
        "/s": o.throughputPerSec,
        p50: o.latencyMs.p50,
        p95: o.latencyMs.p95,
        p99: o.latencyMs.p99,
        "conf p95": o.confirmMs?.p95 ?? "",
        gas: o.avgGasUsed ?? "",
      })),
    );
    if (Object.keys(s.counters).length) console.log("counters:", s.counters);
    if (s.topFailures.length) {
      console.log("\nTop unexpected failures:");
      for (const f of s.topFailures) console.log(`  ${f.count}× ${f.message}`);
    }
  }
}
