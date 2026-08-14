## Summary

<!-- What does this change and why? -->

Closes #

## Changes

-

## Verification

- [ ] `npm run lint` + `npx tsc --noEmit` clean
- [ ] `npm run test:e2e` passing (or CI green)
- [ ] Tested the change manually / added an e2e test

## Schema

- [ ] No Prisma schema change, **or** the change is additive
- [ ] If it drops or renames a column: the destructive-schema guard will stop the
      production deploy — say here why the data loss is intended (see
      `infra/schema-guard.sh`)
