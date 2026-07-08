/**
 * Minimal concurrency primitives — no external load framework needed.
 */

/** Run tasks with at most `limit` in flight; returns settled results in order. */
export async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<Array<{ ok: boolean; value?: T; error?: unknown }>> {
  const results: Array<{ ok: boolean; value?: T; error?: unknown }> = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const i = cursor++;
      try {
        results[i] = { ok: true, value: await tasks[i]() };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/** Counting semaphore — used as the global in-flight transaction cap. */
export class Semaphore {
  private queue: Array<() => void> = [];
  private available: number;

  constructor(count: number) {
    this.available = count;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
    } else {
      await new Promise<void>((r) => this.queue.push(r));
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) next();
      else this.available++;
    };
  }
}
