# Changelog

Notable changes, newest first. Dates are the merge date to `main`.

## 0.2.0 — unreleased

### Domain

- **Restructured the CRM around SaleVali's customers.** `Lead` is gone;
  `Customer` — the online merchant — is the central record. The marketing team
  are the operators (`User`), not the records.
- `LifecycleStage` follows the real funnel: contact → demo → 30-day trial →
  paying subscription → cancellation notice → churn.
- `PricingModel` + `monthlyTransactions` encode the public pricing (flat €9.90
  invoice-only, or tiered per transaction), so revenue per account is derived
  rather than guessed.
- `CustomerIntegration` records the marketplaces, shops and carriers a merchant
  runs; `StageChange` keeps an audit trail of every transition.
- Trial, conversion, notice and churn dates are derived in one place
  (`src/lib/lifecycle.ts`) and shared by the API routes and the server actions.

### Product

- Interactions and tasks can now be created and completed — they were displayed
  but not writable.
- The dashboard reports paying customers, active trials, recurring revenue and
  **trials expiring within 7 days** (SaleVali trials never auto-renew).
- Customer list filters by stage, billing model and sales channel.

### Infrastructure

- Playwright end-to-end suite (18 specs) with a `@smoke` PR gate and a sharded
  full run twice a day.
- CI: lint, typecheck, `prisma validate`, production build, and regression tests
  for the deploy gates.
- Deploy pipeline: image built on a GitHub-hosted runner and pushed to ghcr, the
  server only pulls and swaps. Drift gate, forward-only guard, health check.
- Data gates before every schema sync: a database backup (required on prod) and
  a destructive-schema guard that stops a deploy that would drop data.
- `/api/health` with the git sha the deploy gate reads; detailed fields gated on
  `HEALTH_TOKEN`.
- Security headers (CSP, HSTS, …), CodeQL, `npm audit` gate, Dependabot.

## 0.1.0

- Initial scaffold: Next.js 15 + Prisma + NextAuth, lead/campaign pipeline,
  invitation-based onboarding, Dockerfile and dev compose file.
