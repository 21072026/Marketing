# Infrastructure

How the SaleVali Marketing CRM gets from a merge to a running container, and the
gates that stop a deploy from destroying data.

## Environments

| Environment | URL | Workflow | Container | Port | DB |
| --- | --- | --- | --- | --- | --- |
| **Test** (tracks `main`) | https://marketing.ersah.in | `deploy-test.yml` — auto on every merge | `salevali-crm-marketing` | 3300 | shared **test** DB |
| **Per-PR** | https://marketing-pr\<N\>.ersah.in | `pr-preview.yml` — auto per PR, torn down on close | `salevali-crm-marketing-pr<N>` | 3500 + N%100 | shared **test** DB |
| **Production** | *server & domain TBD* | `deploy-prod.yml` — dispatch-only until the live server exists | `salevali-crm` | 3300 (its own box) | live DB |

Everything on ersah.in reads `/etc/salevali-crm/test.env` and only ever touches
the **test database**. Live data will get its own server, domain and env file;
until then `deploy-prod.yml` stays manual-only.

Port choices on the ersah.in box are deliberate: the Internship CRM holds
3200–3202 and 3400–3499, and MariaDB sits on 3306 — so marketing takes the
single fixed 3300 plus the 3500–3599 block for PR slots.

Test sign-in: `admin@ersah.in` / the team-known test password, recreated on
every deploy by `prisma/seed-demo.mjs` together with ~17 demo merchants
(idempotent, guarded by `ALLOW_DEMO_SEED=1` so it can never run against a
database whose env file does not opt in).

## Shape of a deploy

```
push to main
   │
   ├─ CI (lint · typecheck · infra tests · build)        GitHub-hosted
   ├─ E2E smoke gate (MySQL service, Playwright)         GitHub-hosted
   │
   ├─ deploy-test.yml                                    → marketing.ersah.in
   │    ├─ build   : docker build → ghcr.io              GitHub-hosted
   │    └─ deploy  : pull + db push + seed + swap +      self-hosted (ersah.in)
   │                 Plesk subdomain route + health
   │
   └─ deploy-prod.yml (future live server, manual)
        ├─ gate    : is prod already on this commit?     self-hosted
        ├─ build   : docker build → ghcr.io              GitHub-hosted
        └─ deploy  : pull + backup + schema guard +      self-hosted
                     db push + container swap + health
```

**Nothing compiles on the server.** The image is the only artifact that crosses
over; the server pulls it, swaps its container, and health-checks the result.

## Scripts

| Script | What it does |
| --- | --- |
| `deploy-prod.sh` | The gated server-side deploy for the future live server: pull, back up, guard, `prisma db push`, swap the container, health-check, record the deployed sha. |
| `server/subdomain-deploy.sh` | The test-side deploy: pull, `db push` (no gates — the test DB is disposable), seed admin + demo data, swap the container, create/refresh the Plesk subdomain + wildcard cert + reverse proxy. Used by both `deploy-test.yml` and `pr-preview.yml`. |
| `server/subdomain-teardown.sh` | Removes a PR environment (container, image, Plesk subdomain) when its PR closes. |
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

### Test server (ersah.in — the box the Internship CRM already runs on)

1. **Self-hosted runner** registered for THIS repo (runners are per-repo; the
   Internship runner does not serve Marketing), installed as a service. Its
   user must be able to run `docker` **and the `plesk` CLI** (the deploy
   creates subdomains and injects the reverse proxy).
2. **Wildcard DNS + cert**: `*.ersah.in` already points at the box and the
   wildcard cert is maintained for the Internship CRM — nothing new needed.
3. **Env file** at `/etc/salevali-crm/test.env`, `chmod 600`:

   ```env
   DATABASE_URL=mysql://crm-test:...@127.0.0.1:3306/salevali_crm_test
   NEXTAUTH_SECRET=...
   SMTP_HOST=...           # optional on test
   SMTP_PORT=587
   SMTP_USER=...
   SMTP_PASS=...
   SMTP_FROM=SaleVali CRM Test <noreply@ersah.in>
   HEALTH_TOKEN=...
   SEED_ADMIN_EMAIL=admin@ersah.in
   SEED_ADMIN_PASSWORD=<the team-known test password>
   SEED_ADMIN_NAME=Test Admin
   ALLOW_DEMO_SEED=1       # opts this DB into the demo dataset — test only!
   ```

   `NEXTAUTH_URL` is **not** read from this file — each environment derives it
   from its own subdomain, which is what makes one env file serve them all.

### Live server (future — domain and box still to be decided)

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

3. **Ports**: prod `3300` on its own box, host networking. Put the reverse
   proxy in front of it.
4. **Backups**: `/var/backups/salevali-crm`, created `0700` by the script. The
   dumps contain customer contact data — never copy one into the repo, a preview
   environment, or a ticket.

## Running a deploy by hand

```bash
# on the server, from a checkout of the repo
sudo ENV_FILE=/etc/salevali-crm/prod.env ./infra/deploy-prod.sh

# test env by hand (normally deploy-test.yml does this)
sudo SUBLABEL=marketing PORT=3300 IMAGE=ghcr.io/21072026/marketing:test-<sha> \
     BASE_DOMAIN=ersah.in ENV_FILE=/etc/salevali-crm/test.env \
     ./infra/server/subdomain-deploy.sh
```
