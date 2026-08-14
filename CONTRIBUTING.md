# Contributing

## Local setup

```bash
cp .env.example .env     # fill in DATABASE_URL and NEXTAUTH_SECRET at minimum
npm run db:dev:up        # MySQL via docker compose
npm install
npx prisma db push
npm run seed             # first admin, from SEED_ADMIN_*
npm run dev
```

`npx playwright install chromium` once, if you intend to run the e2e suite.

## Before opening a PR

```bash
npm run lint
npx tsc --noEmit
npm run test:e2e:smoke
```

CI runs the same three plus a production build and the infra gate tests. The
`@smoke` subset is the PR gate; the full suite runs twice a day.

## Branch and commit

- Branch off `main`. Name it for the change, not the ticket.
- Commit messages: a short imperative subject, then *why* in the body. The diff
  already says what changed.
- One concern per PR. A schema change plus a UI redesign is two PRs.

## Schema changes

This project uses `prisma db push` and has **no migrations folder**. That has a
consequence worth repeating: **a rename reads as a rename in the diff and lands
as `DROP COLUMN` + `ADD COLUMN` in production.**

The deploy will stop on a data-destroying diff (`infra/schema-guard.sh`). If the
loss is intended, say so in the PR description so whoever runs the deploy knows
to set `ALLOW_DESTRUCTIVE=1` — which itself requires a fresh backup.

Additive changes need nothing special.

## Writing tests

New behaviour on a critical path needs an e2e spec. `docs/testing.md` covers how
to write one, and in particular the `waitForURL()` trap that will otherwise cost
you an afternoon.

Anything that writes `Customer.stage` must go through
`lifecycleTimestampsFor()` and record a `StageChange` — add the assertion for it.

## Code style

- TypeScript, no `any` in new code.
- Validation goes in `src/lib/schemas.ts` (zod), shared by API routes and server
  actions.
- Comments explain **why**. If a line's reasoning is obvious from reading it, it
  does not need a comment; if the reasoning was learned from a failure, write it
  down.
- Match the surrounding code's naming and idiom rather than importing a new
  style.
