#!/usr/bin/env bash
#
# Server-side: tear one test environment down when its PR is merged or closed.
# Idempotent — safe to run for an environment that was never deployed.
#
# The test DB is shared, so there is no per-environment database to drop —
# only the container, its image, and the Plesk subdomain go.
#
# Required env:  SUBLABEL BASE_DOMAIN
#
set -euo pipefail

: "${SUBLABEL:?}" "${BASE_DOMAIN:?}"

CONTAINER="salevali-crm-${SUBLABEL}"
FQDN="${SUBLABEL}.${BASE_DOMAIN}"

echo "==> Tearing down ${FQDN}"

IMG=$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)
docker stop "$CONTAINER" 2>/dev/null || true
docker rm   "$CONTAINER" 2>/dev/null || true
[ -n "$IMG" ] && docker rmi "$IMG" 2>/dev/null || true

if command -v plesk >/dev/null && plesk bin subdomain --info "$FQDN" >/dev/null 2>&1; then
  echo "==> Removing Plesk subdomain ${FQDN}"
  plesk bin subdomain --remove "$SUBLABEL" -domain "$BASE_DOMAIN" || true
else
  echo "==> No Plesk subdomain ${FQDN} (already gone)"
fi

docker image prune -af >/dev/null 2>&1 || true
echo "==> ${FQDN} torn down"
