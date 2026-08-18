import type { Page } from "@playwright/test";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

/**
 * Sign in through the UI and wait until the post-login redirect has actually
 * settled.
 *
 * WHY THIS EXISTS: `page.waitForURL()` resolves the moment the URL matches,
 * which can be *before* the sign-in page's push to /dashboard has finished
 * committing. A deep-link `page.goto()` issued in that window is aborted by
 * Playwright with "Navigation to X is interrupted by another navigation to
 * /dashboard". Waiting for the sidebar's sign-out button — part of the shared
 * dashboard shell, so present on every authenticated page — is a deterministic
 * "the dashboard has actually mounted" signal that does not depend on
 * background requests ever going quiet.
 */
export async function signIn(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto("/login");
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 20_000 });
  await page.getByRole("button", { name: /sign out/i }).waitFor({ state: "visible", timeout: 20_000 });
}
