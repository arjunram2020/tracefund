import { test, expect, type Page } from "@playwright/test";
import { walletShimScript } from "./wallet-shim.js";
import { readState } from "./global-setup.js";

/**
 * End-to-end UI realism flows, driven through the REAL RainbowKit/wagmi stack
 * with an injected mock wallet (node-side signing — see wallet-shim.ts).
 *
 * These five flows share one campaign created in global-setup and run in
 * order: browse -> create -> donate (approve+donate) -> submit proof ->
 * weighted approval vote releasing the milestone. Together they cross every
 * write surface the app exposes and the trickiest read-after-write UX seams
 * (allowance refetch, milestone lock, review threshold release).
 */

const state = readState();

async function withWallet(page: Page, address: string) {
  await page.addInitScript(
    walletShimScript({ address, rpcUrl: state.rpcUrl, chainId: state.chainId }),
  );
}

async function connect(page: Page) {
  await page
    .getByRole("button", { name: /connect wallet/i })
    .first()
    .click();
  // RainbowKit renders each discovered wallet as rk-wallet-option-<rdns>.
  // dispatchEvent instead of click: the modal animates while mounting and
  // closes (detaching the button) as soon as the connection lands, which makes
  // a normal actionability-checked click race itself and time out.
  const option = page.getByTestId("rk-wallet-option-dev.covenant.loadtest");
  await option.waitFor({ state: "visible" });
  await option.dispatchEvent("click");
  // Once connected, every "Connect wallet" affordance disappears.
  await expect(page.getByRole("button", { name: /connect wallet/i })).toHaveCount(0, {
    timeout: 20_000,
  });
}

const campaignUrl = `/campaigns/${state.campaignId}`;

test.describe.serial("covenant browser flows", () => {
  test("browse: home -> campaigns list -> campaign detail", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();

    await page.goto("/campaigns");
    await expect(page.getByText(/BT flow target/).first()).toBeVisible();

    await page.goto(campaignUrl);
    await expect(page.getByText("Donate into escrow")).toBeVisible();
    await expect(page.getByText(/BT flow target/).first()).toBeVisible();
  });

  test("create: full campaign creation through the form", async ({ page }) => {
    await withWallet(page, state.creator);
    await page.goto("/create");
    await connect(page);

    await page.getByPlaceholder(/Community Medical Relief Fund/).fill("BT created via UI");
    await page
      .getByPlaceholder(/Describe the goal/)
      .fill("Browser-flow campaign created through the real create form.");

    // Down to a single milestone (removal collapses the criteria section).
    await page.getByTitle("Remove milestone").first().click();
    await page.getByTitle("Remove milestone").first().click();
    await page.getByRole("button", { name: /criteria/ }).click();

    await page.getByPlaceholder(/Milestone 1 title/).fill("Ship the deliverable");
    await page.getByPlaceholder("USDC", { exact: true }).fill("1");
    await page
      .getByPlaceholder(/What does "done" mean/)
      .fill("The deliverable is publicly accessible and verifiable.");

    await page.getByRole("button", { name: "Create campaign" }).click();
    await page.waitForURL(/\/campaigns\/\d+$/, { timeout: 60_000 });
    await expect(page.getByText("BT created via UI").first()).toBeVisible();
  });

  test("donate: approve step then donation into escrow", async ({ page }) => {
    await withWallet(page, state.donorA);
    await page.goto(campaignUrl);
    await connect(page);

    // Milestone 1 needs exactly 1 USDC; the helper fills the remaining gap.
    await page.getByRole("button", { name: "Fill to milestone" }).click();

    // Fresh wallet -> zero allowance -> two-step approve + donate.
    await page.getByRole("button", { name: /Approve 1 USDC/ }).click();
    await page.getByRole("button", { name: /Donate 1 USDC/ }).click({ timeout: 30_000 });
    await expect(page.getByText("Donation locked in escrow.")).toBeVisible({ timeout: 30_000 });
  });

  test("submit proof: creator files the proof package", async ({ page }) => {
    await withWallet(page, state.creator);
    await page.goto(campaignUrl);
    await connect(page);

    await expect(page.getByText("Submit proof package")).toBeVisible();
    await page.getByPlaceholder(/One line, non-sensitive/).fill("Milestone 1 done, receipt attached");
    await page.getByPlaceholder(/Your write-up/).fill("We completed the first deliverable.");
    await page
      .getByPlaceholder(/Connect the links below/)
      .fill("The linked receipt matches the milestone amount.");
    await page.getByPlaceholder(/https:\/\/…/).first().fill("https://example.com/receipt.pdf");

    await page.getByRole("button", { name: "Submit proof for review" }).click();
    await expect(page.getByText(/Proof package submitted/)).toBeVisible({ timeout: 30_000 });
  });

  test("weighted vote: sole donor's approval releases the milestone", async ({ page }) => {
    await withWallet(page, state.donorA);
    await page.goto(campaignUrl);
    await connect(page);

    await expect(page.getByText("Proof review")).toBeVisible();
    await page.getByRole("button", { name: "✓ Approve" }).click();
    // Donor holds 100% of donated weight >= the 50% threshold, so the UI
    // labels the vote as the releasing one.
    await page.getByRole("button", { name: /Approve — releases this milestone's funds/ }).click();
    await expect(page.getByText("Review recorded on-chain.")).toBeVisible({ timeout: 30_000 });
  });
});
