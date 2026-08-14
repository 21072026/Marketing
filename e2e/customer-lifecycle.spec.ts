import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";
import { createCustomer, moveStage } from "./helpers/customers";
import { cleanupCustomers, prisma, uniqueName } from "./helpers/db";

// The funnel is the product: a customer that enters a trial must come out with a
// 30-day window, a conversion must be dated, and every move must leave a trace.
// These are the assertions that would catch a lifecycle regression before it
// quietly corrupts the reporting everyone reads.
const PREFIX = "E2E-Lifecycle";

test.afterAll(async () => {
  await cleanupCustomers(PREFIX);
});

test("a new trial customer gets a 30-day window and an estimated price", { tag: "@smoke" }, async ({ page }) => {
  const companyName = uniqueName(PREFIX);

  await signIn(page);
  await createCustomer(page, {
    companyName,
    city: "Langenfeld",
    stage: "TRIAL_ACTIVE_500",
    source: "WEBSITE_TRIAL",
    pricingModel: "API_TRANSACTION_TIERED",
    monthlyTransactions: "1200",
    channels: ["AMAZON", "SHOPIFY"],
  });

  // The trial dates were left empty in the form, so the app must derive them.
  // SaleVali trials run 30 days and never auto-renew, which is exactly why this
  // countdown exists.
  await expect(page.getByText("Trial ends in 30 days")).toBeVisible();

  // 100 × €0.20 + 900 × €0.05 + 200 × €0.033 = €71.60, marked as an estimate
  // because no explicit MRR was recorded.
  const revenue = page.locator("div", { hasText: /^Recurring revenue/ }).last();
  await expect(revenue).toContainText("71,60");
  await expect(revenue).toContainText("estimated");

  // Channels ticked on the form become integration rows. Matched by test id
  // rather than by label: the "add channel" select in the same panel lists every
  // channel as an option, so a text match would find those too.
  const channels = page.getByTestId("customer-channel");
  await expect(channels).toHaveCount(2);
  await expect(channels.filter({ hasText: "Amazon" })).toHaveCount(1);
  await expect(channels.filter({ hasText: "Shopify" })).toHaveCount(1);
});

test("moving a customer to paying stamps the conversion and records the transition", async ({ page }) => {
  const companyName = uniqueName(PREFIX);

  await signIn(page);
  await createCustomer(page, { companyName, stage: "TRIAL_ACTIVE_500" });

  await moveStage(page, "CUSTOMER_ACTIVE_700", "Signed after the trial call");

  // The conversion date is derived from the stage move, not typed by anyone.
  const converted = page.locator("div", { hasText: /^Converted/ }).last();
  await expect(converted).not.toContainText("—");

  // …and the move itself is on the record, with its reason.
  await expect(page.getByText("Trial active →")).toBeVisible();
  await expect(page.getByText("Signed after the trial call")).toBeVisible();
});

test("churn closes the customer and reopening clears the closing date", async ({ page }) => {
  const companyName = uniqueName(PREFIX);

  await signIn(page);
  const detailUrl = await createCustomer(page, { companyName, stage: "CUSTOMER_ACTIVE_700" });

  // Notice first: the contract is cancellable with 30 days' notice, so the
  // customer is on the way out but not gone — and must not read as closed.
  await moveStage(page, "CANCELLATION_NOTICE_800");
  const contractEnds = page.locator("div", { hasText: /^Contract ends/ }).last();
  await expect(contractEnds).not.toContainText("—");

  await moveStage(page, "CHURNED_900");
  const churned = page.locator("div", { hasText: /^Churned/ }).last();
  await expect(churned).not.toContainText("—");

  // Winning a churned customer back must not leave them counted as closed.
  await page.goto(detailUrl);
  await expect(page.getByRole("heading", { name: companyName })).toBeVisible();
  await moveStage(page, "CONTACTED_200");
  await expect(page.getByText("Churned →")).toBeVisible();

  // closedAt has no cell on screen, but every "how many customers did we lose"
  // report keys off it, so assert it directly: reopening must clear it while
  // leaving the churn date as history.
  const reopened = await prisma.customer.findFirstOrThrow({ where: { companyName } });
  expect(reopened.closedAt).toBeNull();
  expect(reopened.churnedAt).not.toBeNull();
});
