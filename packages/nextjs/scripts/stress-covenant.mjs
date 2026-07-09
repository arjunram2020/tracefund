#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";

const HELP = `
Covenant stress harness

Usage:
  yarn stress --base-url http://127.0.0.1:3000 --users 1000 --duration 180

Options:
  --base-url <url>         Next.js app base URL. Default: http://127.0.0.1:3000
  --mix <mode>             http | rpc | hybrid. Default: hybrid
  --users <n>              Virtual users to simulate. Default: 1000
  --duration <seconds>     Sustained load duration after ramp-up. Default: 180
  --ramp-up <seconds>      Time to spread user launch over. Default: 45
  --timeout <ms>           Per request timeout. Default: 10000
  --min-think-ms <ms>      Minimum pause between actions per user. Default: 150
  --max-think-ms <ms>      Maximum pause between actions per user. Default: 900
  --chain-id <id>          Contract chain id. Default: env or first deployment
  --rpc-url <url>          Override RPC endpoint for contract-read load
  --seed <n>               Deterministic random seed. Default: 42
  --report-file <path>     Write JSON summary to a file
  --dry-run                Resolve config and scenarios without sending traffic
  --help                   Show this message
`;

const DEFAULTS = {
  baseUrl: "http://127.0.0.1:3000",
  mix: "hybrid",
  users: 1000,
  durationSeconds: 180,
  rampUpSeconds: 45,
  timeoutMs: 10_000,
  minThinkMs: 150,
  maxThinkMs: 900,
  seed: 42,
};

const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, "..");
const deploymentPath = resolve(nextRoot, "contracts/deployedContracts.json");

main().catch((error) => {
  console.error("\nStress harness failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP.trim());
    return;
  }

  const deployments = JSON.parse(await readFile(deploymentPath, "utf8"));
  const chainId = resolveChainId(args, deployments);
  const deployment = deployments[String(chainId)]?.Covenant;
  const baseUrl = normalizeBaseUrl(String(args["base-url"] ?? DEFAULTS.baseUrl));
  const mix = String(args.mix ?? DEFAULTS.mix).toLowerCase();
  const options = {
    baseUrl,
    mix,
    users: readInt(args.users, DEFAULTS.users),
    durationSeconds: readInt(args.duration, DEFAULTS.durationSeconds),
    rampUpSeconds: readInt(args["ramp-up"], DEFAULTS.rampUpSeconds),
    timeoutMs: readInt(args.timeout, DEFAULTS.timeoutMs),
    minThinkMs: readInt(args["min-think-ms"], DEFAULTS.minThinkMs),
    maxThinkMs: readInt(args["max-think-ms"], DEFAULTS.maxThinkMs),
    seed: readInt(args.seed, DEFAULTS.seed),
    reportFile: args["report-file"] ? resolve(process.cwd(), String(args["report-file"])) : null,
    dryRun: Boolean(args["dry-run"]),
    chainId,
    rpcUrl: resolveRpcUrl(args, chainId),
  };

  validateOptions(options, deployment);

  const httpContext = createHttpContext(options.baseUrl, options.timeoutMs);
  const rpcContext = createRpcContext({
    abi: deployment?.abi ?? [],
    address: deployment?.address,
    chainId: options.chainId,
    rpcUrl: options.rpcUrl,
  });

  const bootstrap = await collectBootstrap({
    dryRun: options.dryRun,
    httpContext,
    mix: options.mix,
    rpcContext,
  });

  const shared = {
    campaignIds: bootstrap.campaignIds,
    creatorAddresses: bootstrap.creatorAddresses,
    historyIds: bootstrap.historyIds,
  };

  const scenarios = buildScenarios({
    httpContext,
    mix: options.mix,
    rngSeed: options.seed,
    rpcContext,
    shared,
  });

  if (scenarios.length === 0) {
    throw new Error("No stress scenarios were available for the chosen configuration.");
  }

  printConfiguration(options, deployment, shared, scenarios);

  if (options.dryRun) {
    console.log("\nDry run complete. No traffic was sent.");
    return;
  }

  const metrics = new Metrics();
  const startAt = Date.now();
  const stopAt = startAt + options.durationSeconds * 1000;
  const progressTimer = setInterval(() => {
    printProgress(metrics, startAt, stopAt);
  }, 5000);

  try {
    const tasks = Array.from({ length: options.users }, (_, index) =>
      runVirtualUser({
        index,
        metrics,
        options,
        scenarios,
        stopAt,
      }),
    );
    await Promise.all(tasks);
  } finally {
    clearInterval(progressTimer);
  }

  const summary = metrics.summary({
    baseUrl: options.baseUrl,
    chainId: options.chainId,
    durationSeconds: options.durationSeconds,
    endedAt: new Date().toISOString(),
    mix: options.mix,
    rpcUrl: options.rpcUrl,
    startedAt: new Date(startAt).toISOString(),
    users: options.users,
  });

  printSummary(summary);

  if (options.reportFile) {
    await writeFile(options.reportFile, JSON.stringify(summary, null, 2));
    console.log(`\nSaved JSON report to ${options.reportFile}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const trimmed = token.slice(2);
    if (trimmed.includes("=")) {
      const [key, value] = trimmed.split(/=(.*)/s, 2);
      parsed[key] = value === "" ? true : value;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[trimmed] = true;
      continue;
    }
    parsed[trimmed] = next;
    index += 1;
  }
  return parsed;
}

function readInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveChainId(args, deployments) {
  const fromArg = args["chain-id"];
  if (fromArg !== undefined) {
    return readInt(fromArg, 0);
  }
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID;
  if (fromEnv) {
    return readInt(fromEnv, 0);
  }
  const available = Object.keys(deployments).map(Number).sort((a, b) => a - b);
  if (available.length === 0) {
    throw new Error("No Covenant deployments were found in deployedContracts.json.");
  }
  if (available.includes(8453)) return 8453;
  if (available.includes(31337)) return 31337;
  return available[0];
}

function resolveRpcUrl(args, chainId) {
  if (args["rpc-url"]) {
    return String(args["rpc-url"]);
  }
  if (chainId === 31337) {
    return "http://127.0.0.1:8545";
  }
  if (chainId === 8453) {
    return process.env.NEXT_PUBLIC_BASE_RPC_URL || null;
  }
  if (chainId === 84532) {
    return process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || null;
  }
  return process.env.NEXT_PUBLIC_BASE_RPC_URL || null;
}

function validateOptions(options, deployment) {
  if (!["http", "rpc", "hybrid"].includes(options.mix)) {
    throw new Error(`Unsupported mix "${options.mix}". Use http, rpc, or hybrid.`);
  }
  if (options.users < 1) {
    throw new Error("users must be at least 1.");
  }
  if (options.durationSeconds < 1) {
    throw new Error("duration must be at least 1 second.");
  }
  if (options.rampUpSeconds < 0) {
    throw new Error("ramp-up cannot be negative.");
  }
  if (options.timeoutMs < 250) {
    throw new Error("timeout should be at least 250ms.");
  }
  if (options.minThinkMs < 0 || options.maxThinkMs < 0) {
    throw new Error("think times cannot be negative.");
  }
  if (options.minThinkMs > options.maxThinkMs) {
    throw new Error("min-think-ms cannot be greater than max-think-ms.");
  }
  if ((options.mix === "rpc" || options.mix === "hybrid") && !deployment) {
    throw new Error(`No Covenant deployment is recorded for chain ${options.chainId}.`);
  }
  if ((options.mix === "rpc" || options.mix === "hybrid") && !options.rpcUrl) {
    throw new Error(
      "RPC mode needs --rpc-url or the matching NEXT_PUBLIC_* RPC environment variable.",
    );
  }
}

function normalizeBaseUrl(input) {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

function createHttpContext(baseUrl, timeoutMs) {
  return {
    baseUrl,
    timeoutMs,
    async get(path) {
      return request({
        baseUrl,
        timeoutMs,
        path,
      });
    },
    async post(path, body) {
      return request({
        baseUrl,
        body,
        method: "POST",
        path,
        timeoutMs,
      });
    },
  };
}

function createRpcContext({ abi, address, chainId, rpcUrl }) {
  if (!rpcUrl || !address) {
    return null;
  }
  return {
    address,
    abi,
    chainId,
    client: createPublicClient({
      transport: http(rpcUrl, { timeout: 10_000 }),
    }),
    rpcUrl,
  };
}

async function collectBootstrap({ dryRun, httpContext, mix, rpcContext }) {
  const shared = {
    campaignIds: [],
    creatorAddresses: [],
    historyIds: ["approval-1", "auto-1", "1"],
  };

  if (dryRun) {
    return shared;
  }

  if (mix === "http" || mix === "hybrid") {
    await httpContext.get("/");
  }

  if ((mix === "rpc" || mix === "hybrid") && rpcContext) {
    await rpcContext.client.getBlockNumber();

    const allCampaigns = await rpcContext.client.readContract({
      address: rpcContext.address,
      abi: rpcContext.abi,
      functionName: "getAllCampaigns",
    });

    const campaigns = Array.isArray(allCampaigns) ? allCampaigns : [];
    shared.campaignIds = campaigns
      .map((campaign) => campaign?.id)
      .filter((value) => typeof value === "bigint");
    shared.creatorAddresses = Array.from(
      new Set(
        campaigns
          .map((campaign) => campaign?.creator)
          .filter((value) => typeof value === "string"),
      ),
    );

    const count = await rpcContext.client.readContract({
      address: rpcContext.address,
      abi: rpcContext.abi,
      functionName: "campaignCount",
    });

    if (typeof count === "bigint" && count > 0n && shared.campaignIds.length === 0) {
      shared.campaignIds = Array.from({ length: Number(count) }, (_, index) => BigInt(index));
    }
  }

  return shared;
}

function buildScenarios({ httpContext, mix, rngSeed, rpcContext, shared }) {
  const scenarios = [];

  if (mix === "http" || mix === "hybrid") {
    scenarios.push(
      weighted("http:home", 16, () => httpContext.get("/")),
      weighted("http:campaigns", 18, () => httpContext.get("/campaigns")),
      weighted("http:campaign-detail", 20, ({ rng }) =>
        httpContext.get(`/campaigns/${pickCampaignSlug(shared.campaignIds, rng)}`),
      ),
      weighted("http:create", 8, () => httpContext.get("/create")),
      weighted("http:dashboard", 8, () => httpContext.get("/dashboard")),
      weighted("http:history", 10, () => httpContext.get("/history")),
      weighted("http:history-detail", 6, ({ rng }) =>
        httpContext.get(`/history/${pick(shared.historyIds, rng)}`),
      ),
      weighted("http:api-draft-milestones", 14, ({ rng }) =>
        httpContext.post("/api/draft-milestones", buildDraftPayload(rng)),
      ),
    );
  }

  if ((mix === "rpc" || mix === "hybrid") && rpcContext) {
    scenarios.push(
      weighted("rpc:campaignCount", 8, () =>
        rpcRead(rpcContext, {
          functionName: "campaignCount",
        }),
      ),
      weighted("rpc:getAllCampaigns", 8, () =>
        rpcRead(rpcContext, {
          functionName: "getAllCampaigns",
        }),
      ),
    );

    if (shared.campaignIds.length > 0) {
      scenarios.push(
        weighted("rpc:getCampaign", 14, ({ rng }) =>
          rpcRead(rpcContext, {
            functionName: "getCampaign",
            args: [pick(shared.campaignIds, rng)],
          }),
        ),
        weighted("rpc:getMilestones", 14, ({ rng }) =>
          rpcRead(rpcContext, {
            functionName: "getMilestones",
            args: [pick(shared.campaignIds, rng)],
          }),
        ),
        weighted("rpc:getApprovalConfig", 8, ({ rng }) =>
          rpcRead(rpcContext, {
            functionName: "getApprovalConfig",
            args: [pick(shared.campaignIds, rng)],
          }),
        ),
        weighted("rpc:getDonation", 6, ({ rng }) =>
          rpcRead(rpcContext, {
            functionName: "getDonation",
            args: [pick(shared.campaignIds, rng), randomAddress(rng)],
          }),
        ),
        weighted("rpc:refundOf", 6, ({ rng }) =>
          rpcRead(rpcContext, {
            functionName: "refundOf",
            args: [pick(shared.campaignIds, rng), randomAddress(rng)],
          }),
        ),
        weighted("rpc:isReviewer", 4, ({ rng }) =>
          rpcRead(rpcContext, {
            functionName: "isReviewer",
            args: [pick(shared.campaignIds, rng), randomAddress(rng)],
          }),
        ),
      );
    }

    if (shared.creatorAddresses.length > 0) {
      scenarios.push(
        weighted("rpc:trustScore", 6, ({ rng }) =>
          rpcRead(rpcContext, {
            functionName: "trustScore",
            args: [pick(shared.creatorAddresses, rng)],
          }),
        ),
        weighted("rpc:getCreatorStats", 6, ({ rng }) =>
          rpcRead(rpcContext, {
            functionName: "getCreatorStats",
            args: [pick(shared.creatorAddresses, rng)],
          }),
        ),
      );
    }
  }

  return scenarios;
}

function weighted(name, weight, run) {
  return { name, weight, run };
}

async function runVirtualUser({ index, metrics, options, scenarios, stopAt }) {
  const rng = createRng(options.seed + index * 9973);
  const rampDelayMs =
    options.rampUpSeconds <= 0
      ? 0
      : Math.floor((index / Math.max(options.users - 1, 1)) * options.rampUpSeconds * 1000);

  if (rampDelayMs > 0) {
    await sleep(rampDelayMs);
  }

  while (Date.now() < stopAt) {
    const scenario = pickWeighted(scenarios, rng);
    const startedAt = performance.now();

    try {
      const result = await scenario.run({ index, rng });
      metrics.record({
        durationMs: performance.now() - startedAt,
        name: scenario.name,
        ok: true,
        sizeBytes: result?.sizeBytes ?? 0,
        status: result?.status ?? "ok",
      });
    } catch (error) {
      metrics.record({
        durationMs: performance.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        name: scenario.name,
        ok: false,
        sizeBytes: 0,
        status: "error",
      });
    }

    const pause = randomBetween(rng, options.minThinkMs, options.maxThinkMs);
    if (pause > 0) {
      await sleep(pause);
    }
  }
}

async function request({ baseUrl, body, method = "GET", path, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        "accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        "content-type": "application/json",
        "user-agent": "covenant-stress-harness/1.0",
      },
      signal: controller.signal,
    });
    const payload = await response.arrayBuffer();
    if (!response.ok) {
      throw new Error(`${method} ${path} returned ${response.status}`);
    }
    return {
      sizeBytes: payload.byteLength,
      status: response.status,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function rpcRead(rpcContext, { args = [], functionName }) {
  const result = await rpcContext.client.readContract({
    address: rpcContext.address,
    abi: rpcContext.abi,
    functionName,
    args,
  });
  return {
    sizeBytes: roughSize(result),
    status: "ok",
  };
}

function roughSize(value) {
  try {
    return Buffer.byteLength(
      JSON.stringify(value, (_, current) =>
        typeof current === "bigint" ? current.toString() : current,
      ),
      "utf8",
    );
  } catch {
    return 0;
  }
}

function buildDraftPayload(rng) {
  const kind = Math.floor(randomBetween(rng, 0, 4));
  const goal = randomBetween(rng, 5_000, 80_000);
  const milestoneCount = Math.floor(randomBetween(rng, 2, 6));
  const suffix = Math.floor(randomBetween(rng, 1000, 9999));
  return {
    kind,
    milestoneCount,
    title: `Stress Campaign ${suffix}`,
    description:
      "Synthetic traffic for Covenant load testing. This request validates milestone drafting latency under concurrent form usage.",
    goalAmount: String(goal),
  };
}

function pickCampaignSlug(campaignIds, rng) {
  if (!campaignIds.length) {
    return Math.floor(randomBetween(rng, 1, 25)).toString();
  }
  return pick(campaignIds, rng).toString();
}

function pick(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function pickWeighted(items, rng) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item;
    }
  }
  return items[items.length - 1];
}

function randomAddress(rng) {
  let hex = "";
  for (let index = 0; index < 40; index += 1) {
    hex += Math.floor(rng() * 16).toString(16);
  }
  const address = `0x${hex}`;
  return address === ZERO_ADDRESS ? `0x${"1".repeat(40)}` : address;
}

function randomBetween(rng, min, max) {
  if (max <= min) return min;
  return min + rng() * (max - min);
}

function createRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function printConfiguration(options, deployment, shared, scenarios) {
  console.log("Covenant stress harness");
  console.log(`- base URL: ${options.baseUrl}`);
  console.log(`- mode: ${options.mix}`);
  console.log(`- users: ${options.users}`);
  console.log(`- duration: ${options.durationSeconds}s (+ ${options.rampUpSeconds}s ramp-up)`);
  console.log(`- timeout: ${options.timeoutMs}ms`);
  console.log(`- think time: ${options.minThinkMs}-${options.maxThinkMs}ms`);
  console.log(`- chain: ${options.chainId}`);
  if (deployment?.address) {
    console.log(`- contract: ${deployment.address}`);
  }
  if (options.rpcUrl) {
    console.log(`- rpc: ${options.rpcUrl}`);
  }
  console.log(`- seed: ${options.seed}`);
  console.log(
    `- bootstrap: ${shared.campaignIds.length} campaign ids, ${shared.creatorAddresses.length} creator addresses`,
  );
  console.log(`- scenarios: ${scenarios.map((scenario) => scenario.name).join(", ")}`);
}

function printProgress(metrics, startAt, stopAt) {
  const elapsed = Math.max((Date.now() - startAt) / 1000, 1);
  const remaining = Math.max((stopAt - Date.now()) / 1000, 0);
  const totals = metrics.totals();
  console.log(
    `[progress] ${totals.requests} requests, ${totals.failures} failures, ${(
      totals.requests / elapsed
    ).toFixed(1)} req/s, ${remaining.toFixed(0)}s remaining`,
  );
}

function printSummary(summary) {
  console.log("\nSummary");
  console.log(
    `- ${summary.requests} requests over ${summary.elapsedSeconds.toFixed(1)}s (${summary.requestsPerSecond.toFixed(1)} req/s)`,
  );
  console.log(
    `- failures: ${summary.failures} (${summary.failureRate.toFixed(2)}%) | throughput: ${(summary.megabytes / summary.elapsedSeconds).toFixed(2)} MB/s`,
  );
  console.log(
    `- latency ms: avg ${summary.latency.avg.toFixed(1)} | p50 ${summary.latency.p50.toFixed(1)} | p95 ${summary.latency.p95.toFixed(1)} | p99 ${summary.latency.p99.toFixed(1)} | max ${summary.latency.max.toFixed(1)}`,
  );

  console.log("\nBy scenario");
  for (const scenario of summary.scenarios) {
    console.log(
      `- ${scenario.name}: ${scenario.requests} req | fail ${scenario.failureRate.toFixed(2)}% | avg ${scenario.latency.avg.toFixed(1)}ms | p95 ${scenario.latency.p95.toFixed(1)}ms | max ${scenario.latency.max.toFixed(1)}ms`,
    );
  }

  if (summary.topErrors.length > 0) {
    console.log("\nTop errors");
    for (const error of summary.topErrors) {
      console.log(`- ${error.count}x ${error.message}`);
    }
  }
}

class Metrics {
  constructor() {
    this.startedAt = Date.now();
    this.records = [];
    this.byScenario = new Map();
  }

  record(entry) {
    this.records.push(entry);
    if (!this.byScenario.has(entry.name)) {
      this.byScenario.set(entry.name, []);
    }
    this.byScenario.get(entry.name).push(entry);
  }

  totals() {
    const failures = this.records.filter((entry) => !entry.ok).length;
    return {
      failures,
      requests: this.records.length,
    };
  }

  summary(meta) {
    const elapsedSeconds = Math.max((Date.now() - this.startedAt) / 1000, 0.001);
    const failures = this.records.filter((entry) => !entry.ok).length;
    const totalBytes = this.records.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0);
    const scenarios = Array.from(this.byScenario.entries())
      .map(([name, entries]) => summarizeEntries(name, entries))
      .sort((left, right) => right.requests - left.requests);

    const errorCounts = new Map();
    for (const entry of this.records) {
      if (!entry.error) continue;
      errorCounts.set(entry.error, (errorCounts.get(entry.error) ?? 0) + 1);
    }

    return {
      ...meta,
      elapsedSeconds,
      failures,
      failureRate: (failures / Math.max(this.records.length, 1)) * 100,
      latency: latencySummary(this.records.map((entry) => entry.durationMs)),
      megabytes: totalBytes / 1_048_576,
      requests: this.records.length,
      requestsPerSecond: this.records.length / elapsedSeconds,
      scenarios,
      topErrors: Array.from(errorCounts.entries())
        .map(([message, count]) => ({ message, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 8),
    };
  }
}

function summarizeEntries(name, entries) {
  const failures = entries.filter((entry) => !entry.ok).length;
  return {
    name,
    requests: entries.length,
    failures,
    failureRate: (failures / Math.max(entries.length, 1)) * 100,
    latency: latencySummary(entries.map((entry) => entry.durationMs)),
  };
}

function latencySummary(values) {
  if (values.length === 0) {
    return { avg: 0, max: 0, min: 0, p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const avg = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    avg,
    max: sorted[sorted.length - 1],
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function percentile(sortedValues, ratio) {
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * ratio) - 1));
  return sortedValues[index];
}
