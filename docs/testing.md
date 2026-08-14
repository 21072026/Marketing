# Testing

There is one kind of automated test in this repo: **Playwright end-to-end specs**
that drive a real browser against a real database. That is deliberate — the
things most likely to break here are lifecycle rules, form submissions and
authorization, none of which a unit test on a pure function would notice.

## Running them

```bash
npm run test:e2e          # whole suite (starts the app itself)
npm run test:e2e:smoke    # the @smoke subset only — what the PR gate runs
npm run test:e2e:headed   # whole suite, with a visible browser
npm run test:e2e -- e2e/customer-lifecycle.spec.ts   # one spec
```

Locally the config starts `next dev`; in CI (`CI=1`) it builds and runs
`next start`, which is what the gate exercises. Set `BASE_URL` to run against a
deployed environment instead — the local web server is then skipped:

```bash
BASE_URL=https://crm-preview.example.de npm run test:e2e
```

You need a database. `DATABASE_URL` from `.env` is used by both the app and the
specs (they talk to Prisma directly for setup and teardown), and the admin the
specs sign in as comes from `npx prisma db seed`.

After switching branches, run `npx prisma generate` so the client matches the
schema — a stale client causes schema-drift 500s.

## What is covered

| Spec | What it protects |
| --- | --- |
| `health.spec.ts` | `/api/health` stays cheap, and the detail fields stay closed to anonymous callers. The deploy gate reads `sha` from here. |
| `auth.spec.ts` | Sign-in, the `/dashboard` redirect, and that **every API route refuses an unauthenticated caller**. |
| `customer-lifecycle.spec.ts` | The 30-day trial window is derived, conversion and churn are dated, reopening clears `closedAt`, tiered pricing shows €71.60 for 1200 transactions. |
| `customers-list.spec.ts` | Stage / billing-model / channel filters and search; trials inside the 7-day band reach the dashboard. |
| `customer-followups.spec.ts` | Logging an interaction, adding and completing a task, linking a contact to a customer. |
| `customers-api.spec.ts` | The same lifecycle rules over REST, one integration row per channel, and that invalid input is rejected rather than half-written. |

## The `@smoke` tag

The PR gate runs `--grep @smoke` so it stays fast; the full suite runs twice a
day (`e2e-full.yml`) and on demand. When you add a spec for a *critical* path,
tag it:

```ts
test("…", { tag: "@smoke" }, async ({ page }) => { … });
```

Keep the smoke set small. A gate that takes fifteen minutes is a gate people
learn to merge around.

## Writing specs: the one trap

**Never interact with a page immediately after `waitForURL()`.**

`page.waitForURL()` resolves when the URL changes, which is *before* React has
rendered the new page. The old page is still in the DOM. Anything typed in that
window lands on the old page and is thrown away when the new one mounts — and
because the app then dutifully processes the *old* values, the failure reads as
"the feature is broken" rather than "the test was early".

This is not hypothetical: it made every stage-move assertion in this suite fail
while `inputValue()` still reported the value the test had just chosen. The
"Add customer" page and the customer detail page both have a
`select[name="stage"]`, so the early `selectOption` was setting the wrong one.

Use `e2e/helpers/customers.ts`, which waits for a signal that can only belong to
the destination page (the company-name heading), or wait for such a signal
yourself. Do not wait for an element that exists on both pages.

## Fixtures and cleanup

Specs create their own data with a unique prefix (`uniqueName("E2E-Lifecycle")`)
and delete it in `afterAll` via `e2e/helpers/db.ts`. That keeps the suite
runnable against a long-lived preview database, not just a throwaway CI one.
`workers: 1` for the same reason: list assertions of the form "this row is gone"
race against another worker's fixtures.

## Infra tests

`infra/test/*.test.sh` cover the deploy gates (dump validation, destructive-schema
pattern). They run in CI because their only other exercise would be on the
server, mid-deploy, when being wrong is expensive:

```bash
bash infra/test/backup-db.test.sh
bash infra/test/schema-guard.test.sh
```
