# Infrastructure

How the SaleVali Marketing CRM gets from a merge to a running container, and the
gates that stop a deploy from destroying data.

## Shape of a deploy

```
push to main
   │
   ├─ CI (lint · typecheck · infra tests · build)        GitHub-hosted
   ├─ E2E smoke gate (MySQL service, Playwright)         GitHub-hosted
   │
   └─ deploy-prod.yml
        ├─ gate    : is prod already on this commit?     self-hosted (on the server)
        ├─ build   : docker build → ghcr.io              GitHub-hosted
        └─ deploy  : pull + backup + schema guard +      self-hosted (on the server)
                     db push + container swap + health
```

**Nothing compiles on the server.** The image is the only artifact that crosses
over; the server pulls it, swaps its container, and health-checks the result.

`preview` is the same pipeline with the gates dialled down — see
`deploy-preview.yml`. It tracks `main` and exists to be experimented on.

## Scripts

| Script | What it does |
| --- | --- |
| `deploy-prod.sh` | The whole server-side deploy: pull, back up, guard, `prisma db push`, swap the container, health-check, record the deployed sha. Drives prod *and* preview — the caller only changes `CONTAINER`, `PORT`, `NETWORK` and `ENV_FILE`. |
| `backup-db.sh` | `mysqldump → gzip → $BACKUP_DIR/<env>-<stamp>.sql.gz`, then validates the dump and prunes old ones. |
| `schema-guard.sh` | Asks Prisma what SQL the pending push would run and refuses the deploy if it destroys data. |
| `test/*.test.sh` | Regression tests for the two gates above. They run in CI, because otherwise their only exercise would be on the server, mid-deploy. |

## Why the gates exist

This project syncs with `prisma db push --accept-data-loss` and has no
`migrations/` folder. A PR that renames a field reads as a rename in the diff and
lands as `DROP COLUMN` + `ADD COLUMN` in production. The accumulated interaction
log, stage history and customer records are the product; there is no way back
from dropping them.

So, before every schema sync:

1. **`backup-db.sh`** takes a dump. On prod a failed dump *stops* the deploy; on
   preview it warns and continues.
2. **`schema-guard.sh`** inspects the pending SQL. On prod a data-destroying
   statement *stops* the deploy; on preview it warns (`--warn-only`).

Overrides are deliberate and audited in the run log:

```bash
FORCE_NO_BACKUP=1    # deploy without a backup
ALLOW_DESTRUCTIVE=1  # apply a destructive change — refused unless a backup was taken
FORCE=1              # roll back to an older commit (overrides FORWARD_ONLY)
```

## Forward-only

Two uncoordinated deployers write the production container: the push-triggered
run and the 6-hourly drift check. With `FORWARD_ONLY=1`, `deploy-prod.sh` refuses
to deploy a commit that is an ancestor of the one currently live, so a queued
stale build cannot overwrite a newer release. If it cannot *prove* the move is
forward (shallow clone, unknown commit) it fails **closed**.

The live commit is read from `/api/health`, not from a state file — the file is
only written by this script, so any other deploy path would leave it stale.

## Server prerequisites (one-time)

1. **Self-hosted runner** registered for this repo, installed as a service. The
   runner's user must be able to run `docker` and read the env file.
2. **Env file** at `/etc/salevali-crm/prod.env`, `chmod 600`:

   ```env
   DATABASE_URL=mysql://crm:...@127.0.0.1:3306/salevali_crm
   NEXTAUTH_URL=https://crm.example.de
   NEXTAUTH_SECRET=...
   SMTP_HOST=...
   SMTP_PORT=587
   SMTP_USER=...
   SMTP_PASS=...
   SMTP_FROM=SaleVali CRM <noreply@example.de>
   SEED_ADMIN_EMAIL=...
   SEED_ADMIN_PASSWORD=...
   SEED_ADMIN_NAME=SaleVali Marketing Admin
   HEALTH_TOKEN=...
   ```

   `HEALTH_TOKEN` closes the detailed fields of `/api/health` to anonymous
   callers. Leave it unset and the endpoint stays fully public — which is the
   default so the deploy gate is never blinded before anyone configures it.

3. **Ports**: prod `3300`, preview `3301` (host networking on prod, bridge on
   preview). Put the reverse proxy in front of those.
4. **Backups**: `/var/backups/salevali-crm`, created `0700` by the script. The
   dumps contain customer contact data — never copy one into the repo, a preview
   environment, or a ticket.

## Running a deploy by hand

```bash
# on the server, from a checkout of the repo
sudo ENV_FILE=/etc/salevali-crm/prod.env ./infra/deploy-prod.sh

# preview
sudo CONTAINER=salevali-crm-preview PORT=3301 NETWORK=bridge \
     ENV_FILE=/etc/salevali-crm/preview.env ./infra/deploy-prod.sh
```
