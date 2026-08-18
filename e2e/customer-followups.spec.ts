import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";
import { createCustomer } from "./helpers/customers";
import { cleanupContacts, cleanupCustomers, uniqueName } from "./helpers/db";

// Interactions, tasks and contacts are how the marketing team actually works the
// account. They were displayed but not creatable in the original scaffold, so
// these cover the write paths end to end.
const PREFIX = "E2E-Followup";
const CONTACT_PREFIX = "e2e-followup";

test.afterAll(async () => {
  await cleanupContacts(CONTACT_PREFIX);
  await cleanupCustomers(PREFIX);
});

test("a marketer can log an interaction and work a follow-up task", { tag: "@smoke" }, async ({ page }) => {
  const companyName = uniqueName(PREFIX);

  await signIn(page);
  await createCustomer(page, { companyName, stage: "CONTACTED_200" });

  // Log a call.
  await page.selectOption('select[name="type"]', "CALL");
  await page.fill('input[name="subject"]', "Intro call about Amazon sync");
  await page.fill('textarea[name="body"]', "Runs 3 marketplaces, unhappy with manual invoicing.");
  await page.getByRole("button", { name: "Log interaction" }).click();

  await expect(page.getByText("Intro call about Amazon sync")).toBeVisible();
  await expect(page.getByText("Runs 3 marketplaces, unhappy with manual invoicing.")).toBeVisible();
  await expect(page.getByText("1 logged")).toBeVisible();

  // Add a follow-up and complete it.
  await page.fill('input[name="title"]', "Send tiered pricing breakdown");
  await page.fill('textarea[name="description"]', "Compare against their current WaWi cost.");
  await page.getByRole("button", { name: "Add task" }).click();

  const task = page.locator("article", { hasText: "Send tiered pricing breakdown" });
  await expect(task).toBeVisible();
  await expect(task).toContainText("Open");

  await task.getByRole("button", { name: "Mark done" }).click();
  await expect(task).toContainText("Completed");
  await expect(task.getByRole("button", { name: "Reopen" })).toBeVisible();

  // Reopening is the same switch in reverse — a mis-click must be recoverable.
  await task.getByRole("button", { name: "Reopen" }).click();
  await expect(task).toContainText("Open");
});

test("a contact belongs to a customer and shows up on that customer's record", async ({ page }) => {
  const companyName = uniqueName(PREFIX);
  const contactEmail = `${CONTACT_PREFIX}-${Date.now()}@e2e.local`;

  await signIn(page);
  const customerUrl = await createCustomer(page, { companyName });

  await page.goto("/dashboard/contacts");
  await page.fill('input[name="firstName"]', "Ayse");
  await page.fill('input[name="lastName"]', "Yilmaz");
  await page.fill('input[name="email"]', contactEmail);
  await page.fill('input[name="title"]', "Managing Director");
  await page.selectOption('select[name="customerId"]', { label: companyName });
  await page.check('input[name="isPrimary"]');
  await page.getByRole("button", { name: "Save contact" }).click();

  const row = page.locator("tr", { hasText: contactEmail });
  await expect(row).toBeVisible();
  await expect(row).toContainText(companyName);
  await expect(row).toContainText("Primary");

  // The customer record is the place the team actually looks.
  await page.goto(customerUrl);
  await expect(page.getByText("Ayse Yilmaz")).toBeVisible();
  await expect(page.getByText("Managing Director")).toBeVisible();
});
