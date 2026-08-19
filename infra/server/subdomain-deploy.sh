#!/usr/bin/env bash
#
# Server-side: bring up (or update) one test environment as a Plesk subdomain.
#
# Used for BOTH shapes of the test setup, which differ only in their name:
#   marketing.${BASE_DOMAIN}        — the main test env, tracks `main`
#   marketing-pr<N>.${BASE_DOMAIN}  — one env per open PR
#
# Adapted from the Internship CRM's topic-deploy.sh, which worked this exact
# machine out: Plesk-native routing (a raw `listen 443` block in conf.d loses
# the address-group match to Plesk's specific-IP vhosts and falls through to
# the default vhost), a shared test DB, and the *.${BASE_DOMAIN} wildcard cert.
#
# ⚠️ Every environment this script deploys shares ONE TEST DATABASE
# (/etc/salevali-crm/test.env). A schema `db push` from any PR affects all of
# them — coordinate concurrent schema changes. Live data will get its own
# server, env file and the gated deploy-prod.sh path; never point this script
# at a production DATABASE_URL.
#
# Required env (set by the workflow):
#   SUBLABEL     subdomain label, e.g. "marketing" or "marketing-pr12"
#   PORT         host port to publish the container on
#   IMAGE        ghcr.io image ref built by build-image.yml
#   BASE_DOMAIN  e.g. ersah.in
#   ENV_FILE     e.g. /etc/salevali-crm/test.env (DATABASE_URL, NEXTAUTH_SECRET,
#                SMTP_*, HEALTH_TOKEN, ALLOW_DEMO_SEED). NEXTAUTH_URL from the
#                file is ignored — it is derived per-subdomain below.
#
# Optional:
#   CERT_DIR     (default /etc/nginx/ssl) — wildcard cert from acme.sh
#   SKIP_PULL=1  — image already present locally (manual deploy from a shell)
#   GHCR_USER / GHCR_TOKEN — registry credentials for the pull
#
set -euo pipefail

: "${SUBLABEL:?}" "${PORT:?}" "${IMAGE:?}" "${BASE_DOMAIN:?}" "${ENV_FILE:?}"
CERT_DIR="${CERT_DIR:-/etc/nginx/ssl}"

[ -f "$ENV_FILE" ] || { echo "ERROR: env file not found: $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
: "${DATABASE_URL:?DATABASE_URL missing in $ENV_FILE}"
: "${NEXTAUTH_SECRET:?NEXTAUTH_SECRET missing in $ENV_FILE}"

FQDN="${SUBLABEL}.${BASE_DOMAIN}"
URL="https://${FQDN}"
CONTAINER="salevali-crm-${SUBLABEL}"

echo "==> Deploying ${URL} (container ${CONTAINER}, port ${PORT})"

# ── Image: pull from GHCR unless it was built locally ────────────────────────
if [ "${SKIP_PULL:-0}" != "1" ]; then
  if [ -n "${GHCR_TOKEN:-}" ]; then
    printf '%s' "$GHCR_TOKEN" \
      | docker login ghcr.io -u "${GHCR_USER:-github-actions}" --password-stdin
  fi
  docker pull "$IMAGE"
else
  docker image inspect "$IMAGE" >/dev/null 2>&1 || {
    echo "ERROR: SKIP_PULL=1 but image '$IMAGE' is not present locally" >&2; exit 1; }
fi

# Containers reach the host's MySQL via the docker gateway alias.
CONTAINER_DB=$(echo "$DATABASE_URL" | sed 's|localhost|host.docker.internal|g; s|127\.0\.0\.1|host.docker.internal|g')

run_tool() {
  docker run --rm --add-host=host.docker.internal:host-gateway \
    -e DATABASE_URL="$CONTAINER_DB" "$@"
}

# Schema sync. No backup / destructive-schema gate on purpose: this database is
# the disposable test one, and the whole point of a PR env is to try schema
# changes. The gates live in deploy-prod.sh, which the future live server uses.
echo "==> prisma db push (shared test DB — affects every test env)"
run_tool "$IMAGE" npx prisma db push --accept-data-loss

# Seed the admin (from SEED_ADMIN_* in the env file) and the demo dataset.
# Both idempotent; seed-demo additionally refuses to run unless the env file
# sets ALLOW_DEMO_SEED=1, so this line is inert against any non-test DB.
if [ -n "${SEED_ADMIN_EMAIL:-}" ]; then
  run_tool \
    -e SEED_ADMIN_EMAIL="$SEED_ADMIN_EMAIL" \
    -e SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-}" \
    -e SEED_ADMIN_NAME="${SEED_ADMIN_NAME:-SaleVali Marketing Admin}" \
    "$IMAGE" node prisma/seed.mjs || true
fi
run_tool -e ALLOW_DEMO_SEED="${ALLOW_DEMO_SEED:-}" "$IMAGE" node prisma/seed-demo.mjs || true

# ── Swap the container ────────────────────────────────────────────────────────
docker stop "$CONTAINER" 2>/dev/null || true
docker rm   "$CONTAINER" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER" \
  -p "${PORT}:3000" \
  --add-host=host.docker.internal:host-gateway \
  --restart=unless-stopped \
  -e DATABASE_URL="$CONTAINER_DB" \
  -e NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  -e NEXTAUTH_URL="$URL" \
  -e NEXT_PUBLIC_APP_URL="$URL" \
  -e SMTP_HOST="${SMTP_HOST:-}" \
  -e SMTP_PORT="${SMTP_PORT:-}" \
  -e SMTP_USER="${SMTP_USER:-}" \
  -e SMTP_PASS="${SMTP_PASS:-}" \
  -e SMTP_FROM="${SMTP_FROM:-}" \
  -e HEALTH_TOKEN="${HEALTH_TOKEN:-}" \
  "$IMAGE"

sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || echo "ERR")
echo "==> Container health http://127.0.0.1:${PORT}/api/health -> ${code}"

# ── Routing: Plesk-native subdomain + wildcard cert ──────────────────────────
command -v plesk >/dev/null || { echo "ERROR: plesk CLI not found on PATH" >&2; exit 1; }

if plesk bin subdomain --info "$FQDN" >/dev/null 2>&1; then
  echo "==> Plesk subdomain ${FQDN} already exists"
else
  echo "==> Creating Plesk subdomain ${FQDN}"
  plesk bin subdomain --create "$SUBLABEL" -domain "$BASE_DOMAIN" -ssl true
fi

# Assign the existing *.${BASE_DOMAIN} wildcard cert (idempotent, non-fatal —
# Cloudflare terminates TLS at the edge anyway, this covers the origin hop).
WILDCARD_CERT_NAME="wildcard-${BASE_DOMAIN}"
if [ -f "${CERT_DIR}/${BASE_DOMAIN}.cer" ] && [ -f "${CERT_DIR}/${BASE_DOMAIN}.key" ]; then
  if ! plesk bin certificate --info "$WILDCARD_CERT_NAME" -domain "$BASE_DOMAIN" >/dev/null 2>&1; then
    echo "==> Importing wildcard cert into Plesk as '${WILDCARD_CERT_NAME}'"
    LEAF=$(mktemp); CHAIN=$(mktemp)
    awk 'BEGIN{n=0} /-BEGIN CERTIFICATE-/{n++} { if(n<=1) print > leaf; else print > chain }' \
      leaf="$LEAF" chain="$CHAIN" "${CERT_DIR}/${BASE_DOMAIN}.cer"
    if [ -s "$CHAIN" ]; then
      plesk bin certificate --create "$WILDCARD_CERT_NAME" -domain "$BASE_DOMAIN" \
        -cert-file "$LEAF" -key-file "${CERT_DIR}/${BASE_DOMAIN}.key" -cacert-file "$CHAIN" \
        || echo "WARN: wildcard cert import failed — keeping default cert"
    else
      plesk bin certificate --create "$WILDCARD_CERT_NAME" -domain "$BASE_DOMAIN" \
        -cert-file "${CERT_DIR}/${BASE_DOMAIN}.cer" -key-file "${CERT_DIR}/${BASE_DOMAIN}.key" \
        || echo "WARN: wildcard cert import failed — keeping default cert"
    fi
    rm -f "$LEAF" "$CHAIN"
  fi
  plesk bin subdomain --update "$SUBLABEL" -domain "$BASE_DOMAIN" -ssl true \
    -certificate-name "$WILDCARD_CERT_NAME" || echo "WARN: cert assignment failed — keeping default cert"
else
  echo "==> No wildcard cert at ${CERT_DIR}/${BASE_DOMAIN}.cer(.key); using default cert"
fi

# Inject the reverse proxy through Plesk's supported custom-nginx include and
# regenerate the vhost. Rewritten on every deploy — idempotent.
VHOST_CONF_DIR="/var/www/vhosts/system/${FQDN}/conf"
mkdir -p "$VHOST_CONF_DIR"
cat > "${VHOST_CONF_DIR}/vhost_nginx.conf" <<NGINX
# Managed by infra/server/subdomain-deploy.sh — '${SUBLABEL}'. Do not edit by hand.
location ~ ^/.* {
    proxy_pass http://0.0.0.0:${PORT};
    proxy_http_version 1.1;
    proxy_set_header Host              \$host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade           \$http_upgrade;
    proxy_set_header Connection        "upgrade";
}
NGINX

echo "==> Reconfiguring Plesk vhost for ${FQDN}"
plesk sbin httpdmng --reconfigure-domain "$FQDN"

sleep 2
rcode=$(curl -s -k -o /dev/null -w '%{http_code}' -H "Host: ${FQDN}" "https://127.0.0.1/api/health" 2>/dev/null || echo "ERR")
echo "==> Route check (Host: ${FQDN}) -> ${rcode}"

docker image prune -af >/dev/null 2>&1 || true
echo "==> ${URL} is live"
