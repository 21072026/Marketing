import { expect, test } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD, signIn } from "./helpers/auth";

test("unauthenticated access to /dashboard redirects to the login page", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL((url) => url.pathname.includes("/login"), { timeout: 15_000 });
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("wrong credentials keep the user on the login page", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', "nobody@e2e.local");
  await page.fill('input[type="password"]', "wrong-password-123");
  await page.click('button[type="submit"]');

  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  expect(page.url()).toContain("/login");
});

test("an admin can sign in and reaches the dashboard", { tag: "@smoke" }, async ({ page }) => {
  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  await expect(page.getByRole("heading", { name: /SaleVali customer acquisition/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Customers" })).toBeVisible();
});

test("the API refuses unauthenticated callers", { tag: "@smoke" }, async ({ request }) => {
  // The middleware only guards /dashboard; every API route checks the session
  // itself. A regression here would expose the whole customer base to anyone.
  for (const path of ["/api/customers", "/api/contacts", "/api/campaigns", "/api/users"]) {
    const response = await request.get(path);
    expect(response.status(), `${path} must require a session`).toBe(401);
  }

  const created = await request.post("/api/customers", { data: { companyName: "Should not exist" } });
  expect(created.status()).toBe(401);
});
