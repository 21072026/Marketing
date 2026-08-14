import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";
import { createCustomer } from "./helpers/customers";
import { cleanupCustomers, uniqueName } from "./helpers/db";

const PREFIX = "E2E-List";

test.afterAll(async () => {
  await cleanupCustomers(PREFIX);
});

test("the customer list filters by stage, billing model, and sales channel", async ({ page }) => {
  const trialCompany = uniqueName(`${PREFIX}-Trial`);
  const payingCompany = uniqueName(`${PREFIX}-Paying`);

  await signIn(page);

  // A trial merchant on Amazon, billed per transaction…
  await createCustomer(page, {
    companyName: trialCompany,
    stage: "TRIAL_ACTIVE_500",
    pricingModel: "API_TRANSACTION_TIERED",
    channels: ["AMAZON"],
  });

  // …and a paying merchant on Shopify, on the flat invoice-only plan.
  await createCustomer(page, {
    companyName: payingCompany,
    stage: "CUSTOMER_ACTIVE_700",
    pricingModel: "INVOICE_ONLY_FIXED",
    channels: ["SHOPIFY"],
  });

  await page.goto("/dashboard/customers");
  await expect(page.getByRole("heading", { name: trialCompany })).toBeVisible();
  await expect(page.getByRole("heading", { name: payingCompany })).toBeVisible();

  await page.selectOption('select[name="stage"]', "TRIAL_ACTIVE_500");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: trialCompany })).toBeVisible();
  await expect(page.getByRole("heading", { name: payingCompany })).toHaveCount(0);

  await page.goto("/dashboard/customers");
  await page.selectOption('select[name="channel"]', "SHOPIFY");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: payingCompany })).toBeVisible();
  await expect(page.getByRole("heading", { name: trialCompany })).toHaveCount(0);

  await page.goto("/dashboard/customers");
  await page.selectOption('select[name="pricingModel"]', "INVOICE_ONLY_FIXED");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: payingCompany })).toBeVisible();
  await expect(page.getByRole("heading", { name: trialCompany })).toHaveCount(0);

  // Search covers the company itself, not just the stage chips.
  await page.goto("/dashboard/customers");
  await page.fill('input[name="q"]', trialCompany);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("heading", { name: trialCompany })).toBeVisible();
  await expect(page.getByRole("heading", { name: payingCompany })).toHaveCount(0);
});

test("the dashboard surfaces trials that are about to expire", async ({ page }) => {
  const companyName = uniqueName(`${PREFIX}-Expiring`);

  await signIn(page);
  // Backdate the window so the trial is inside the 7-day warning band. This is
  // the case the marketing team must never miss: SaleVali trials do not
  // auto-renew, so an unattended expiry is a lost customer.
  const endsIn3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await createCustomer(page, {
    companyName,
    stage: "TRIAL_ACTIVE_500",
    trialStartedAt: "2026-01-01",
    trialEndsAt: endsIn3Days,
  });

  await page.goto("/dashboard");
  const panel = page.locator("div", { hasText: /^Trials ending within 7 days/ }).last();
  await expect(panel.getByText(companyName)).toBeVisible();
});
