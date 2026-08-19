# CLAUDE.md

Guidance for AI agents (Claude Code) working in this repository. Read this first.

## What this project is

**SaleVali Marketing CRM** — the internal tool the marketing team uses to grow
the customer base of [SaleVali](https://salevali.de), the cloud multichannel ERP
(Warenwirtschaft) that BCS-IT GmbH sells to online merchants.

**Who tracks whom.** The records this CRM tracks are **SaleVali's customers** —
online merchants selling on Amazon, eBay, OTTO, Shopify and the like. The
**marketing team are the operators**, not the records: a marketer is a `User`,
they own customers via `Customer.assignedTo`, log interactions and complete
tasks. If a change starts modelling marketers as tracked entities, it is going
the wrong way.

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Prisma 5** → **MySQL** (`db push`, **no migrations folder**)
- **NextAuth 4** (Credentials provider, JWT sessions, bcrypt)
- **Tailwind CSS**, **lucide-react**, **zod**
- **Nodemailer** (SMTP) for invitations
- Containerized (**Docker**), deployed via GitHub Actions over SSH

## Commands

```bash
npm run dev          # local dev server (http://localhost:3000)
npm run build        # production build
npm run lint         # next lint
npx tsc --noEmit     # typecheck
npx prisma generate  # regenerate client (also runs on postinstall)
npx prisma db push   # sync schema to DB (this project uses db push, NOT migrations)
npx prisma db seed   # create the first ADMIN from SEED_ADMIN_*
npm run seed:demo    # demo merchants + admin@ersah.in (needs ALLOW_DEMO_SEED=1)

npm run test:e2e         # full Playwright suite (starts the app itself)
npm run test:e2e:smoke   # the @smoke subset — what the PR gate runs
npm run test:e2e:headed  # full suite, visible browser

bash infra/test/backup-db.test.sh     # deploy-gate regression tests (also in CI)
bash infra/test/schema-guard.test.sh
```

After switching branches run `npx prisma generate`, or a stale client causes
schema-drift 500s.

## Domain model

`Customer` is the centre of everything. See `prisma/schema.prisma`; the parts
that carry meaning:

- **`LifecycleStage`** — the real SaleVali funnel:
  `PROSPECT_100` → `CONTACTED_200` → `DEMO_SCHEDULED_300` → `DEMO_COMPLETED_400`
  → `TRIAL_ACTIVE_500` → `TRIAL_EXPIRED_600` → `CUSTOMER_ACTIVE_700` →
  `CANCELLATION_NOTICE_800` → `CHURNED_900`, plus `LOST_950` and
  `DISQUALIFIED_990`.
- **`PricingModel` + `monthlyTransactions`** — the public pricing: flat €9.90/mo
  for invoice-only accounts, or tiered per transaction for API-connected ones
  (first 100 at €0.20, 101–1000 at €0.05, from 1001 at €0.033). Encoded in
  `src/lib/constants.ts`; revenue is derived in `src/lib/lifecycle.ts`.
- **`CustomerIntegration`** — the marketplaces, shops and carriers a merchant
  runs. One row per channel (unique on `[customerId, channel]`).
- **`StageChange`** — an audit row for every transition. Do not bypass it.
- `Contact`, `Interaction`, `Task` all hang off `Customer`; `Campaign` is
  acquisition attribution only.

### The lifecycle rules live in one place

`src/lib/lifecycle.ts` derives the dates a stage implies — trial window,
`convertedAt`, `cancellationNoticeAt`, `churnedAt`, `closedAt`. **Both** the API
routes and the server actions call it, so the timeline is the same whichever
screen made the change. If you add a write path for `stage`, route it through
`lifecycleTimestampsFor()` and write a `StageChange` — otherwise the funnel
reporting quietly goes wrong.

Rules worth keeping in mind: existing dates are never overwritten (entering a
trial twice keeps the original window), and reopening a closed customer clears
`closedAt` while leaving `churnedAt` as history.

## Directory map

```
src/
  app/
    api/                 # route handlers: customers, contacts, campaigns, tasks, users, health
    dashboard/           # authenticated pages (customers, contacts, campaigns, users)
    login/  register/
  components/            # CustomerCard, LifecycleStageBadge, Sidebar
  lib/                   # auth, prisma, mailer, constants, lifecycle, schemas, version
prisma/schema.prisma     # source of truth for the DB
e2e/                     # Playwright specs + helpers
infra/                   # deploy, backup, schema guard (+ their tests)
docs/BACKLOG.md          # the work we deliberately deferred, with reasoning
```

## Testing

See `docs/testing.md`. The one thing to internalise before writing a spec: never
interact with a page straight after `waitForURL()` — wait for a signal that can
only belong to the destination page. `e2e/helpers/customers.ts` explains why at
length, because getting it wrong produces failures that look like app bugs.

## Deployment

The image is **built on a GitHub-hosted runner** (`build-image.yml`, pushed to
ghcr.io); the deploy job then **SSHes into the server** and pipes
`infra/server/*.sh` to `bash -s`, so the box only pulls and swaps. **Nothing
compiles on the server** — keep it that way. See `infra/README.md`.

Environments: `deploy-test.yml` → https://marketing.ersah.in on every merge to
main, `pr-preview.yml` → https://marketing-pr<N>.ersah.in per PR (torn down on
close). Both share one **test database** and reseed the demo data. The future
live server uses `deploy-prod.yml` (manual until it exists), which also backs up
the database and runs the destructive-schema guard before the schema sync.

Two gates protect the data, and they are the reason a deploy can refuse to
proceed: a failed backup and a data-destroying schema diff both stop production
(preview only warns). Because this project uses `db push`, **a rename in a Prisma
diff is a `DROP COLUMN` + `ADD COLUMN` in production** — if you rename a field,
say so in the PR and expect the guard to stop the deploy until someone decides.

## Conventions

- Validation is zod schemas in `src/lib/schemas.ts`, used by API routes and
  server actions alike.
- API routes return `401` when unauthenticated — asserted by an e2e spec, so a
  new route that forgets the session check will fail the gate.
- Money is `Decimal` in Prisma and formatted through `formatCurrency()` (de-DE,
  EUR by default).
- Comments explain *why*, especially where the reasoning is non-obvious or was
  learned the hard way. Do not add comments that restate the code.
