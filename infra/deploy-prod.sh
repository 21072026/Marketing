#!/usr/bin/env bash
#
# Deploy the SaleVali Marketing CRM to a server.
#
# Runs ON THE SERVER (from a self-hosted runner, or by hand over SSH). The image
# is normally built on a GitHub-hosted runner and pulled here, so this box never
# compiles anything.
#
# WHAT IT DOES
#   1. sync the working copy to origin/main (unless --no-pull)
#   2. obtain the image: PULL a prebuilt one from ghcr (--pull-image, the normal
#      path) or build it locally from source, stamping GIT_SHA
#   3. back up the database (infra/backup-db.sh), refuse a data-destroying schema
#      diff (infra/schema-guard.sh), then `prisma db push --accept-data-loss`
#   4. swap the container and health-check it against /api/health?db=1
#   5. record the deployed commit so the next run can enforce forward-only
#
# SECRETS never live in the repo. They are read from an env file on the server:
# DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, SMTP_*, HEALTH_TOKEN. Default path
# /etc/salevali-crm/prod.env (override with ENV_FILE=...). Create it once, chmod 600.
#
# USAGE
#   sudo ENV_FILE=/etc/salevali-crm/prod.env ./infra/deploy-prod.sh
#
# FLAGS
#   --no-pull     deploy the current checkout as-is (skip git sync)
#   --skip-build  reuse the existing $IMAGE image, as-is (fast restart)
#   --pull-image  `docker pull $IMAGE` instead of building (implies --skip-build).
#                 For a private registry set GHCR_USER + GHCR_TOKEN.
#
# ENV OVERRIDES FOR THE DATA GATES (use knowingly)
#   FORCE_NO_BACKUP=1    deploy without taking a backup first
#   ALLOW_DESTRUCTIVE=1  apply a schema change that drops data (requires a backup)
#   FORWARD_ONLY=1       refuse to deploy a commit older than the live one
#   FORCE=1              override FORWARD_ONLY for a deliberate rollback
#   BACKUP_DIR=...       where dumps go (default /var/backups/salevali-crm)
#
# ENV
#   CONTAINER   container name (default salevali-crm)
#   PORT        published port (default 3300)
#   NETWORK     host | bridge (default host)
#   DEPLOY_SHA  the commit the image was built from; defaults to HEAD
#
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/salevali-crm/prod.env}"
CONTAINER="${CONTAINER:-salevali-crm}"
PORT="${PORT:-3300}"
IMAGE="${IMAGE:-salevali-crm:local}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${BRANCH:-main}"

NO_PULL=0
SKIP_BUILD=0
PULL_IMAGE=0
for arg in "$@"; do
  case "$arg" in
    --no-pull) NO_PULL=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --pull-image) PULL_IMAGE=1; SKIP_BUILD=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

# A refused or skipped deploy must not be indistinguishable from a successful
# one, so warnings surface in the Actions UI rather than only in the job log.
warn() {
  log "WARNING: $*"
  printf '::warning::%s\n' "$*"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '### ⚠️ %s\n' "$*" >> "$GITHUB_STEP_SUMMARY"
  return 0
}

cd "$REPO_DIR"

# ── 0. Preconditions ────────────────────────────────────────────────────────
command -v docker >/dev/null || { echo "ERROR: docker not found on PATH" >&2; exit 1; }
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: env file not found: $ENV_FILE" >&2
  echo "Create it (chmod 600) with the deployment secrets — see infra/README.md." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
: "${DATABASE_URL:?DATABASE_URL missing in $ENV_FILE}"
: "${NEXTAUTH_SECRET:?NEXTAUTH_SECRET missing in $ENV_FILE}"
: "${NEXTAUTH_URL:?NEXTAUTH_URL missing in $ENV_FILE}"

# ── 1. Sync source ───────────────────────────────────────────────────────────
if [ "$NO_PULL" -eq 0 ]; then
  log "Syncing $BRANCH from origin"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi
# DEPLOY_SHA lets the caller name the commit the image was built from, which is
# what the forward-only guard must reason about. With a local build that is
# always HEAD; with --pull-image the workflow passes the sha it built, so a
# shared runner workspace cannot disagree with the image.
GIT_SHA="${DEPLOY_SHA:-$(git rev-parse HEAD)}"
log "Deploying ${GIT_SHA:0:7} — $(node -p "require('./package.json').version" 2>/dev/null || echo '?')"

# ── 1b. Forward-only guard ───────────────────────────────────────────────────
# Production must only ever move FORWARD. Two uncoordinated deployers write the
# same container (the push-triggered run and the 6-hourly drift check), and a
# stale build could otherwise overwrite a newer release with an older commit.
STATE_FILE="${DEPLOY_STATE_FILE:-$(dirname "$ENV_FILE")/.${CONTAINER}.deployed-sha}"

HEALTH_HDR=""
[ -n "${HEALTH_TOKEN:-}" ] && HEALTH_HDR="X-Health-Token: ${HEALTH_TOKEN}"
health_curl() { # health_curl <url>
  if [ -n "$HEALTH_HDR" ]; then curl -fsS --max-time 10 -H "$HEALTH_HDR" "$1"; else curl -fsS --max-time 10 "$1"; fi
}

# Prefer what the container actually reports over the state file: the file is
# only written by this script, so a deploy from any other path leaves it stale.
LIVE_SHA="$(health_curl "http://127.0.0.1:$PORT/api/health" 2>/dev/null \
            | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)"
if [ "${FORWARD_ONLY:-0}" = "1" ] && [ "${FORCE:-0}" != "1" ]; then
  LAST_SHA="$LIVE_SHA"
  if [ -z "$LAST_SHA" ] && [ -f "$STATE_FILE" ]; then
    LAST_SHA="$(cat "$STATE_FILE" 2>/dev/null || true)"
  fi
  if [ -n "$LAST_SHA" ] && [ "${LAST_SHA:0:7}" != "${GIT_SHA:0:7}" ] && [ "$LAST_SHA" != dev ]; then
    # The ancestry questions below need real history. On a shallow clone
    # `cat-file`/`merge-base` fail, which would make the guard fail OPEN —
    # silently allowing exactly the regression it exists to prevent.
    if ! git cat-file -e "${LAST_SHA}^{commit}" 2>/dev/null; then
      git fetch --quiet --unshallow origin 2>/dev/null \
        || git fetch --quiet --deepen=500 origin 2>/dev/null || true
    fi
    if ! git cat-file -e "${LAST_SHA}^{commit}" 2>/dev/null; then
      # Fail CLOSED: we cannot prove this is a forward move, so refuse loudly
      # rather than deploy and hope.
      warn "$CONTAINER: cannot resolve the live commit ${LAST_SHA:0:7} in this clone, so a forward-only check is impossible. Refusing to deploy ${GIT_SHA:0:7} (set FORCE=1 to override)."
      exit 1
    fi
    if git merge-base --is-ancestor "$GIT_SHA" "$LAST_SHA" 2>/dev/null; then
      warn "$CONTAINER: refusing to regress — ${GIT_SHA:0:7} is OLDER than the live commit ${LAST_SHA:0:7} (set FORCE=1 to roll back deliberately)."
      exit 0
    fi
    if ! git merge-base --is-ancestor "$LAST_SHA" "$GIT_SHA" 2>/dev/null; then
      # Neither ancestor nor descendant: the live container is on a commit that
      # is not on this branch at all. Deploying forward is correct here; just
      # make it visible instead of letting it deadlock.
      warn "$CONTAINER: live commit ${LAST_SHA:0:7} is not an ancestor of ${GIT_SHA:0:7} — the env was off-branch. Deploying forward."
    fi
  fi
fi

# ── 2. Obtain the image ──────────────────────────────────────────────────────
if [ "$PULL_IMAGE" -eq 1 ]; then
  log "Pulling $IMAGE"
  if [ -n "${GHCR_TOKEN:-}" ]; then
    printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-github-actions}" --password-stdin
  fi
  docker pull "$IMAGE"
elif [ "$SKIP_BUILD" -eq 0 ]; then
  log "Building $IMAGE (GIT_SHA=$GIT_SHA)"
  docker build --build-arg GIT_SHA="$GIT_SHA" -t "$IMAGE" .
fi

# Networking: prod runs on host networking with the DB at localhost. A preview
# whose DB user is granted from the docker gateway rather than localhost needs
# bridge networking and a published port instead.
NETWORK="${NETWORK:-host}"
if [ "$NETWORK" = host ]; then
  APP_NET_ARGS=(--network=host)
  APP_PORT_ARGS=(-e PORT="$PORT")
  TOOL_NET_ARGS=(--network=host)
else
  APP_NET_ARGS=(--add-host=host.docker.internal:host-gateway -p "$PORT:3000")
  APP_PORT_ARGS=()
  TOOL_NET_ARGS=(--add-host=host.docker.internal:host-gateway)
fi

run_tool() { # run a one-off tool container against the DB
  docker run --rm "${TOOL_NET_ARGS[@]}" -e DATABASE_URL="$DATABASE_URL" "$IMAGE" "$@"
}

# ── 3. Backup, then schema sync ──────────────────────────────────────────────
# The push below runs with --accept-data-loss, so this is the last moment at
# which the current database still exists in full. Both steps are gates, not
# niceties. The gates scale with what is at stake:
#   prod    → back up (REQUIRED — a failed dump stops the deploy) and REFUSE a
#             data-destroying diff
#   preview → try to back up but only WARN on failure, and only WARN on a
#             destructive diff (schema experiments belong there)
case "$CONTAINER" in
  salevali-crm) ENV_LABEL=prod ;;
  salevali-crm-preview) ENV_LABEL=preview ;;
  *) ENV_LABEL="${CONTAINER#salevali-crm-}" ;;
esac

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_TAKEN=0
if [ "${FORCE_NO_BACKUP:-0}" = "1" ]; then
  log "!! FORCE_NO_BACKUP=1 — DEPLOYING WITHOUT A BACKUP (operator override)"
else
  log "Backing up the database before the schema sync"
  # Runs on the host (mysqldump), not in the image: the dump must survive even if
  # the new image is broken, and it must never live inside a container layer.
  # Under bridge networking $DATABASE_URL names the DB as host.docker.internal —
  # a name that only exists inside a container — so rewrite it to loopback here.
  BACKUP_DATABASE_URL="$DATABASE_URL"
  if [ "$NETWORK" != host ]; then
    BACKUP_DATABASE_URL="${DATABASE_URL//host.docker.internal/127.0.0.1}"
    log "Backup reaches the DB over loopback (the container's host alias is not resolvable here)"
  fi
  if DATABASE_URL="$BACKUP_DATABASE_URL" \
     BACKUP_DIR="${BACKUP_DIR:-/var/backups/salevali-crm}" \
       "$REPO_DIR/infra/backup-db.sh" --env "$ENV_LABEL" --stamp "$STAMP"; then
    BACKUP_TAKEN=1
  elif [ "$ENV_LABEL" = "prod" ]; then
    echo "Backup FAILED on prod — refusing to deploy. Fix the dump, or set FORCE_NO_BACKUP=1 as a deliberate one-off override." >&2
    exit 1
  else
    warn "Backup FAILED on $ENV_LABEL — deploying anyway without a fresh dump (advisory on this env)"
  fi
fi

log "Checking the pending schema change for data loss"
GUARD_ARGS=()
[ "$ENV_LABEL" = "prod" ] || GUARD_ARGS=(--warn-only)
RUN_TOOL="docker run --rm ${TOOL_NET_ARGS[*]} -e DATABASE_URL=$DATABASE_URL $IMAGE npx" \
  BACKUP_TAKEN="$BACKUP_TAKEN" \
  "$REPO_DIR/infra/schema-guard.sh" "${GUARD_ARGS[@]+"${GUARD_ARGS[@]}"}"

log "prisma db push"
run_tool npx prisma db push --accept-data-loss

# ── 4. Idempotent seed ───────────────────────────────────────────────────────
# Creates or updates the first admin from SEED_ADMIN_*. Converges to a no-op, and
# is what makes a fresh environment usable without a manual INSERT.
if [ -n "${SEED_ADMIN_EMAIL:-}" ] && [ -n "${SEED_ADMIN_PASSWORD:-}" ]; then
  log "Seeding the admin account (idempotent)"
  docker run --rm "${TOOL_NET_ARGS[@]}" \
    -e DATABASE_URL="$DATABASE_URL" \
    -e SEED_ADMIN_EMAIL="$SEED_ADMIN_EMAIL" \
    -e SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" \
    -e SEED_ADMIN_NAME="${SEED_ADMIN_NAME:-SaleVali Marketing Admin}" \
    "$IMAGE" node prisma/seed.mjs || true
fi

# ── 5. Swap the container ────────────────────────────────────────────────────
log "Restarting $CONTAINER on :$PORT"
docker stop "$CONTAINER" 2>/dev/null || true
docker rm   "$CONTAINER" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER" \
  "${APP_NET_ARGS[@]}" \
  --restart=unless-stopped \
  "${APP_PORT_ARGS[@]}" \
  -e DATABASE_URL="$DATABASE_URL" \
  -e NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  -e NEXTAUTH_URL="$NEXTAUTH_URL" \
  -e SMTP_HOST="${SMTP_HOST:-}" \
  -e SMTP_PORT="${SMTP_PORT:-}" \
  -e SMTP_USER="${SMTP_USER:-}" \
  -e SMTP_PASS="${SMTP_PASS:-}" \
  -e SMTP_FROM="${SMTP_FROM:-}" \
  -e HEALTH_TOKEN="${HEALTH_TOKEN:-}" \
  "$IMAGE"

# ── 6. Health check + prune ──────────────────────────────────────────────────
# Probe /api/health?db=1 rather than the root page: the root answers 200 from a
# container with a broken DATABASE_URL, and it says nothing about WHICH build is
# running. Both matter, because the drift gate keys its "already current" decision
# off this same endpoint's `sha`.
log "Health check http://127.0.0.1:$PORT/api/health?db=1"
ok=0
health=''
for _ in $(seq 1 30); do
  health="$(health_curl "http://127.0.0.1:$PORT/api/health?db=1" 2>/dev/null || true)"
  if [ -n "$health" ]; then ok=1; break; fi
  sleep 2
done
if [ "$ok" -ne 1 ]; then
  echo "ERROR: app did not answer on :$PORT within 60s. Recent logs:" >&2
  docker logs --tail 40 "$CONTAINER" >&2 || true
  exit 1
fi

health_field() { printf '%s' "$health" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p"; }
SERVED_STATUS="$(health_field status)"
SERVED_SHA="$(health_field sha)"
SERVED_DB="$(health_field db)"

if [ "$SERVED_DB" = error ]; then
  echo "ERROR: $CONTAINER is up but cannot reach the database (health: $health)." >&2
  docker logs --tail 40 "$CONTAINER" >&2 || true
  exit 1
fi
if [ "$SERVED_STATUS" != ok ]; then
  echo "ERROR: $CONTAINER reported status '$SERVED_STATUS' (health: $health)." >&2
  exit 1
fi
# GIT_SHA is baked into the image at build time and truncated to 7 in
# src/lib/version.ts. 'dev' means the --build-arg was lost, which would also make
# the drift gate rebuild forever — treat it as a failure, not as drift.
if [ "$SERVED_SHA" != "${GIT_SHA:0:7}" ]; then
  echo "ERROR: $CONTAINER is serving sha '$SERVED_SHA' but ${GIT_SHA:0:7} was just deployed." >&2
  echo "       A stale image is live and the drift gate would treat it as current. Not recording this deploy." >&2
  docker logs --tail 40 "$CONTAINER" >&2 || true
  exit 1
fi
log "Health OK — serving ${SERVED_SHA}, db ${SERVED_DB:-skipped}"

# Record the commit now live in this container so the next deploy can enforce
# forward-only progress.
mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null || true
printf '%s\n' "$GIT_SHA" > "$STATE_FILE" 2>/dev/null || true

docker image prune -af >/dev/null 2>&1 || true
docker builder prune -af --filter until=72h >/dev/null 2>&1 || true
log "Done — $CONTAINER is up at :$PORT (${GIT_SHA:0:7})"
