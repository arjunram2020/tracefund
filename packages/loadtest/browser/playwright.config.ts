import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

/**
 * Browser realism layer: a handful of REAL browser sessions driving the app
 * through RainbowKit/wagmi with an injected mock wallet (see wallet-shim.ts).
 * This is not the load generator — it exists to catch hydration bugs, wallet
 * flow breakage, stale-read UX and race conditions that HTTP/RPC load cannot.
 *
 * Requirements before running:
 *   1. local chain:      yarn chain          (repo root)
 *   2. deploy:           yarn deploy
 *   3. app dev server:   started automatically below (or reused if running —
 *      make sure a manually started one has NEXT_PUBLIC_DEFAULT_CHAIN_ID=31337)
 */
const appUrl = process.env.LOADTEST_APP_URL ?? "http://localhost:3000";
const appPort = new URL(appUrl).port || "3000";

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  globalSetup: fileURLToPath(new URL("./global-setup.ts", import.meta.url)),
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Flows share on-chain state and must run in order (donate -> proof -> vote).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: appUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "yarn workspace @covenant/nextjs dev",
    url: appUrl,
    reuseExistingServer: true,
    timeout: 120_000,
    cwd: fileURLToPath(new URL("../../..", import.meta.url)),
    env: {
      ...process.env,
      PORT: appPort,
      NEXT_PUBLIC_DEFAULT_CHAIN_ID: "31337",
      NEXT_PUBLIC_INDEXER_URL: "",
    },
  },
});
