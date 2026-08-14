import { expect, type Page } from "@playwright/test";

type NewCustomer = {
  companyName: string;
  stage?: string;
  source?: string;
  pricingModel?: string;
  monthlyTransactions?: string;
  city?: string;
  trialStartedAt?: string;
  trialEndsAt?: string;
  channels?: string[];
};

/**
 * Fill the "Add customer" form, submit it, and return the detail page URL —
 * only once that page has actually mounted.
 *
 * WHY THE SETTLE WAIT EXISTS: the create action ends in `redirect()`, and
 * `page.waitForURL()` resolves the moment the URL changes, which is *before*
 * React has rendered the detail page. Anything typed into the detail form in
 * that window is silently thrown away when the component finally mounts and
 * React applies `defaultValue` to the stage `<select>`.
 *
 * That is not hypothetical: it is what made every stage-move assertion in this
 * suite fail while `inputValue()` still reported the value the test had just
 * chosen. The form submitted the *old* stage, the app dutifully recorded a
 * no-op transition, and the failure read as "the stage move does not work"
 * rather than "the test was too early".
 *
 * Waiting for the *company-name heading* is what makes it deterministic. Waiting
 * for the stage `<select>` would not: the "Add customer" page has a
 * `select[name="stage"]` of its own, it is still on screen during the
 * transition, and that is precisely the element the early interaction lands on.
 * The heading carries the company name, so it can only belong to the detail
 * page — once it is visible, `defaultValue` has been applied and later
 * interactions stick.
 */
export async function createCustomer(page: Page, customer: NewCustomer) {
  await page.goto("/dashboard/customers/new");
  await page.fill('input[name="companyName"]', customer.companyName);

  if (customer.city) {
    await page.fill('input[name="city"]', customer.city);
  }

  if (customer.stage) {
    await page.selectOption('select[name="stage"]', customer.stage);
  }

  if (customer.source) {
    await page.selectOption('select[name="source"]', customer.source);
  }

  if (customer.pricingModel) {
    await page.selectOption('select[name="pricingModel"]', customer.pricingModel);
  }

  if (customer.monthlyTransactions) {
    await page.fill('input[name="monthlyTransactions"]', customer.monthlyTransactions);
  }

  if (customer.trialStartedAt) {
    await page.fill('input[name="trialStartedAt"]', customer.trialStartedAt);
  }

  if (customer.trialEndsAt) {
    await page.fill('input[name="trialEndsAt"]', customer.trialEndsAt);
  }

  for (const channel of customer.channels ?? []) {
    await page.check(`input[value="${channel}"]`);
  }

  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard\/customers\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: customer.companyName })).toBeVisible();

  return page.url();
}

/**
 * Move a customer to another lifecycle stage from its detail page.
 *
 * The caller must already be on a *settled* detail page — either straight from
 * `createCustomer`, or after asserting the company-name heading following its
 * own `page.goto()`. See the note above for what happens otherwise.
 */
export async function moveStage(page: Page, stage: string, note?: string) {
  await page.selectOption('select[name="stage"]', stage);

  if (note) {
    await page.fill('textarea[name="note"]', note);
  }

  await page.getByRole("button", { name: "Save stage" }).click();
}

/// The stage badge next to the company name, as opposed to the identically
/// labelled `<option>`s in the move-stage select.
export function stageBadge(page: Page) {
  return page.locator("h1").locator("xpath=following-sibling::span").first();
}
