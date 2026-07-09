export interface ActionRecord {
  scenario: string;
  walletIndex: number;
  role: string;
  ok: boolean;
  isRead: boolean;
  durationMs: number;
  gasUsed?: bigint;
  revertReason?: string;
  errorMessage?: string;
  retries: number;
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * ratio) - 1),
  );
  return sortedValues[index];
}

function latencySummary(values: number[]) {
  if (values.length === 0) return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return {
    avg,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

export class SwarmMetrics {
  private records: ActionRecord[] = [];
  private startedAt = Date.now();

  record(entry: ActionRecord) {
    this.records.push(entry);
  }

  totals() {
    const failures = this.records.filter(r => !r.ok).length;
    return { requests: this.records.length, failures };
  }

  /** Emitted periodically to stdout while the swarm is running. */
  progressLine(stopAt: number): string {
    const elapsed = Math.max((Date.now() - this.startedAt) / 1000, 1);
    const remaining = Math.max((stopAt - Date.now()) / 1000, 0);
    const t = this.totals();
    return (
      `[progress] ${t.requests} actions, ${t.failures} failures, ` +
      `${(t.requests / elapsed).toFixed(1)} actions/s, ${remaining.toFixed(0)}s remaining`
    );
  }

  summary(meta: Record<string, unknown>) {
    const elapsedSeconds = Math.max((Date.now() - this.startedAt) / 1000, 0.001);
    const writes = this.records.filter(r => !r.isRead);
    const reads = this.records.filter(r => r.isRead);
    const failures = this.records.filter(r => !r.ok);

    const byScenario = new Map<string, ActionRecord[]>();
    for (const r of this.records) {
      if (!byScenario.has(r.scenario)) byScenario.set(r.scenario, []);
      byScenario.get(r.scenario)!.push(r);
    }

    const scenarios = Array.from(byScenario.entries())
      .map(([name, entries]) => {
        const entryFailures = entries.filter(e => !e.ok).length;
        return {
          name,
          count: entries.length,
          failures: entryFailures,
          failureRate: (entryFailures / Math.max(entries.length, 1)) * 100,
          latency: latencySummary(entries.map(e => e.durationMs)),
          totalGasUsed: entries.reduce((s, e) => s + (e.gasUsed ?? 0n), 0n).toString(),
          retries: entries.reduce((s, e) => s + e.retries, 0),
        };
      })
      .sort((a, b) => b.count - a.count);

    const byWallet = new Map<number, ActionRecord[]>();
    for (const r of this.records) {
      if (!byWallet.has(r.walletIndex)) byWallet.set(r.walletIndex, []);
      byWallet.get(r.walletIndex)!.push(r);
    }
    const perWallet = Array.from(byWallet.entries()).map(([walletIndex, entries]) => {
      const entryFailures = entries.filter(e => !e.ok).length;
      return {
        walletIndex,
        role: entries[0]?.role,
        actions: entries.length,
        failures: entryFailures,
        totalGasUsed: entries.reduce((s, e) => s + (e.gasUsed ?? 0n), 0n).toString(),
      };
    });

    const revertReasons = new Map<string, number>();
    for (const r of failures) {
      const key = r.revertReason || r.errorMessage || "unknown error";
      revertReasons.set(key, (revertReasons.get(key) ?? 0) + 1);
    }

    return {
      ...meta,
      elapsedSeconds,
      totalActions: this.records.length,
      writeActions: writes.length,
      readActions: reads.length,
      failures: failures.length,
      failureRate: (failures.length / Math.max(this.records.length, 1)) * 100,
      actionsPerSecond: this.records.length / elapsedSeconds,
      writeActionsPerSecond: writes.length / elapsedSeconds,
      latency: latencySummary(this.records.map(r => r.durationMs)),
      writeLatency: latencySummary(writes.map(r => r.durationMs)),
      readLatency: latencySummary(reads.map(r => r.durationMs)),
      totalGasUsed: writes.reduce((s, r) => s + (r.gasUsed ?? 0n), 0n).toString(),
      totalRetries: this.records.reduce((s, r) => s + r.retries, 0),
      scenarios,
      perWallet,
      topRevertReasons: Array.from(revertReasons.entries())
        .map(([message, count]) => ({ message, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
    };
  }
}
