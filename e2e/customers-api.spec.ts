import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";
import { cleanupCustomers, uniqueName } from "./helpers/db";

// The REST surface is what an import script or an automation would drive, so the
// lifecycle rules must hold there too — not only in the server actions behind
// the forms.
const PREFIX = "E2E-Api";

test.afterAll(async () => {
  await cleanupCustomers(PREFIX);
});

test("POST /api/customers derives the trial window and opens the audit trail", async ({ page }) => {
  await signIn(page);

  const created = await page.request.post("/api/customers", {
    data: {
      companyName: uniqueName(PREFIX),
      stage: "TRIAL_ACTIVE_500",
      pricingModel: "API_TRANSACTION_TIERED",
      monthlyTransactions: 1200,
    },
  });

  expect(created.status()).toBe(201);
  const customer = await created.json();

  expect(customer.trialStartedAt).toBeTruthy();
  expect(customer.trialEndsAt).toBeTruthy();

  const days = Math.round(
    (new Date(customer.trialEndsAt).getTime() - new Date(customer.trialStartedAt).getTime()) /
      (24 * 60 * 60 * 1000),
  );
  expect(days).toBe(30);
  expect(customer.closedAt).toBeNull();

  const detail = await (await page.request.get(`/api/customers/${customer.id}`)).json();
  expect(detail.stageHistory).toHaveLength(1);
  expect(detail.stageHistory[0].toStage).toBe("TRIAL_ACTIVE_500");
  expect(detail.stageHistory[0].fromStage).toBeNull();
});

test("POST /api/customers/:id/stage records the transition and its dates", async ({ page }) => {
  await signIn(page);

  const created = await page.request.post("/api/customers", {
    data: { companyName: uniqueName(PREFIX), stage: "TRIAL_ACTIVE_500" },
  });
  const customer = await created.json();

  const moved = await page.request.post(`/api/customers/${customer.id}/stage`, {
    data: { stage: "CUSTOMER_ACTIVE_700", note: "Converted from trial" },
  });
  expect(moved.status()).toBe(200);

  const detail = await (await page.request.get(`/api/customers/${customer.id}`)).json();
  expect(detail.stage).toBe("CUSTOMER_ACTIVE_700");
  expect(detail.convertedAt).toBeTruthy();
  // The original trial window survives the move — it is history, not state.
  expect(detail.trialStartedAt).toBeTruthy();

  const latest = detail.stageHistory[0];
  expect(latest.fromStage).toBe("TRIAL_ACTIVE_500");
  expect(latest.toStage).toBe("CUSTOMER_ACTIVE_700");
  expect(latest.note).toBe("Converted from trial");
});

test("a customer has at most one row per sales channel", async ({ page }) => {
  await signIn(page);

  const created = await page.request.post("/api/customers", {
    data: { companyName: uniqueName(PREFIX) },
  });
  const customer = await created.json();

  await page.request.put(`/api/customers/${customer.id}/integrations`, {
    data: { channel: "AMAZON", status: "INTERESTED" },
  });
  // Re-posting the same channel must update it, not duplicate it — otherwise the
  // channel segmentation double-counts every merchant.
  const second = await page.request.put(`/api/customers/${customer.id}/integrations`, {
    data: { channel: "AMAZON", status: "CONNECTED" },
  });
  expect(second.status()).toBe(200);

  const integrations = await (
    await page.request.get(`/api/customers/${customer.id}/integrations`)
  ).json();
  expect(integrations).toHaveLength(1);
  expect(integrations[0].status).toBe("CONNECTED");
});

test("invalid input is rejected rather than half-written", async ({ page }) => {
  await signIn(page);

  const tooShort = await page.request.post("/api/customers", { data: { companyName: "A" } });
  expect(tooShort.status()).toBe(400);

  const badStage = await page.request.post("/api/customers", {
    data: { companyName: uniqueName(PREFIX), stage: "NOT_A_STAGE" },
  });
  expect(badStage.status()).toBe(400);

  const missing = await page.request.get("/api/customers/does-not-exist");
  expect(missing.status()).toBe(404);
});
