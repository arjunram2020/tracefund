import { parseArgs } from "node:util";
import { parseCliConfig, pick, randInt, sleep } from "./lib/config.js";
import { loadDeployment, makePublicClient } from "./lib/chain.js";
import { Covenant } from "./lib/covenant.js";
import { Metrics } from "./lib/metrics.js";

/**
 * Web/app + RPC read load, kept deliberately separate from the wallet actors
 * so page-serving pressure and chain-read pressure can be measured apart.
 *
 * Covenant's pages are client-rendered: the Next server only serves HTML/JS
 * and the draft-milestones API — every data read happens browser->RPC. So a
 * real "page view" is BOTH an HTTP GET and a burst of eth_calls. The three
 * modes reflect that split:
 *
 *   --mode app     HTTP GETs against the Next.js server + the drafting API
 *   --mode rpc     the eth_call/getLogs burst each page fires, straight at the RPC
 *   --mode hybrid  each virtual user does the GET *and* the page's RPC burst
 *
 *   yarn workspace @covenant/loadtest web --mode hybrid --vus 200 --duration 60
 */

interface WebConfig {
  mode: "app" | "rpc" | "hybrid";
  vus: number;
  durationSec: number;
  rampSec: number;
  baseUrl: string;
}

function parseWebArgs(): WebConfig {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      mode: { type: "string" },
      vus: { type: "string" },
      duration: { type: "string" },
      ramp: { type: "string" },
      "base-url": { type: "string" },
      // absorbed by parseCliConfig; declared so parseArgs tolerates them
      rpc: { type: "string" },
      users: { type: "string" },
      scenario: { type: "string" },
      label: { type: "string" },
      "max-inflight": { type: "string" },
      "approve-mode": { type: "string" },
      preset: { type: "string" },
    },
    allowPositionals: true,
  });
  const vus = Number(values.vus ?? 100);
  return {
    mode: (values.mode as WebConfig["mode"]) ?? "hybrid",
    vus,
    durationSec: Number(values.duration ?? 60),
    rampSec: Number(values.ramp ?? Math.min(20, Math.ceil(vus / 10))),
    baseUrl: (values["base-url"] ?? process.env.LOADTEST_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  };
}

// Realistic traffic distribution across the app's routes.
type Journey = { name: string; weight: number };
const JOURNEYS: Journey[] = [
  { name: "home", weight: 25 },
  { name: "campaigns-list", weight: 30 },
  { name: "campaign-detail", weight: 30 },
  { name: "dashboard", weight: 5 },
  { name: "create", weight: 5 },
  { name: "draft-api", weight: 5 },
];

function pickJourney(): string {
  const total = JOURNEYS.reduce((s, j) => s + j.weight, 0);
  let roll = Math.random() * total;
  for (const j of JOURNEYS) {
    roll -= j.weight;
    if (roll <= 0) return j.name;
  }
  return JOURNEYS[0].name;
}

async function main() {
  const web = parseWebArgs();
  const cfg = parseCliConfig();
  const metrics = new Metrics();

  // RPC-side setup is optional in app mode (works even with no deployment).
  let covenant: Covenant | undefined;
  let campaignIds: bigint[] = [];
  let deployBlock = 0n;
  let getBlockNumber: (() => Promise<bigint>) | undefined;
  let getContractEvents: ((from: bigint, to: bigint) => Promise<unknown>) | undefined;
  if (web.mode !== "app") {
    const deployment = loadDeployment(cfg);
    const client = makePublicClient(cfg, deployment);
    covenant = new Covenant(deployment, client);
    deployBlock = deployment.covenant.deployBlock;
    getBlockNumber = () => client.getBlockNumber();
    getContractEvents = (fromBlock, toBlock) =>
      client.getContractEvents({
        address: deployment.covenant.address,
        abi: deployment.covenant.abi,
        fromBlock,
        toBlock,
      });
    const count = await covenant.campaignCount();
    campaignIds = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
    if (campaignIds.length === 0) {
      console.warn("No campaigns on-chain — rpc journeys will only hit list/count reads.");
    }
  }

  const httpGet = async (path: string, init?: RequestInit) => {
    const started = Date.now();
    const op = `${init?.method ?? "GET"} ${path.replace(/\/\d+$/, "/[id]")}`;
    try {
      const res = await fetch(`${web.baseUrl}${path}`, init);
      const body = await res.text();
      metrics.record({
        op,
        status: res.ok ? "ok" : "error",
        latencyMs: Date.now() - started,
        httpStatus: res.status,
        bytes: body.length,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      });
    } catch (err) {
      metrics.record({
        op,
        status: "error",
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const timedRpc = async (op: string, fn: () => Promise<unknown>) => {
    const started = Date.now();
    try {
      await fn();
      metrics.record({ op, status: "ok", latencyMs: Date.now() - started });
    } catch (err) {
      metrics.record({
        op,
        status: "error",
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  };

  const randomId = () => (campaignIds.length ? pick(campaignIds) : 0n);

  // The eth_call burst each page actually fires (mirrors hooks/useCovenant.ts
  // + useActivity.ts), so rpc/hybrid load reproduces real read amplification.
  const rpcForJourney: Record<string, () => Promise<void>> = {
    home: async () => {
      await timedRpc("rpc:getAllCampaigns", () => covenant!.getAllCampaigns());
      await timedRpc("rpc:campaignCount", () => covenant!.campaignCount());
    },
    "campaigns-list": async () => {
      await timedRpc("rpc:getAllCampaigns", () => covenant!.getAllCampaigns());
    },
    "campaign-detail": async () => {
      const id = randomId();
      await Promise.all([
        timedRpc("rpc:getCampaign", () => covenant!.getCampaign(id)),
        timedRpc("rpc:getMilestones", () => covenant!.getMilestones(id)),
        timedRpc("rpc:getApprovalConfig", () => covenant!.getApprovalConfig(id)),
      ]);
      // Activity feed scan (deploy block -> head), the heaviest per-page read.
      await timedRpc("rpc:getLogs(activity)", async () => {
        const latest = await getBlockNumber!();
        return getContractEvents!(deployBlock, latest);
      });
    },
    dashboard: async () => {
      await timedRpc("rpc:getAllCampaigns", () => covenant!.getAllCampaigns());
    },
    create: async () => {
      await timedRpc("rpc:campaignCount", () => covenant!.campaignCount());
    },
    "draft-api": async () => {},
  };

  const pageForJourney: Record<string, () => Promise<void>> = {
    home: () => httpGet("/"),
    "campaigns-list": () => httpGet("/campaigns"),
    "campaign-detail": () => httpGet(`/campaigns/${randomId()}`),
    dashboard: () => httpGet("/dashboard"),
    create: () => httpGet("/create"),
    "draft-api": () =>
      httpGet("/api/draft-milestones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: 0,
          title: "Load test campaign",
          description: "Synthetic drafting request from the web load runner.",
          milestoneCount: 3,
        }),
      }),
  };

  console.log(
    `Web load: mode=${web.mode} vus=${web.vus} ramp=${web.rampSec}s duration=${web.durationSec}s app=${web.baseUrl} rpc=${cfg.rpcUrl}`,
  );

  const deadline = Date.now() + (web.rampSec + web.durationSec) * 1000;
  await Promise.all(
    Array.from({ length: web.vus }, async (_, i) => {
      await sleep((i / web.vus) * web.rampSec * 1000);
      while (Date.now() < deadline) {
        const journey = pickJourney();
        if (web.mode !== "rpc") await pageForJourney[journey]();
        if (web.mode !== "app") await rpcForJourney[journey]();
        await sleep(randInt(300, 2000)); // reading/scrolling pause
      }
    }),
  );

  metrics.printSummary();
  const { jsonPath, csvPath } = metrics.write(cfg.outDir, `web-${web.mode}-${web.vus}vu`);
  console.log(`\nResults written:\n  ${jsonPath}\n  ${csvPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
