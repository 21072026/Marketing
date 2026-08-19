#!/usr/bin/env bash
#
# Pipe a server-side script from this repo to the deploy server over SSH.
#
#   infra/run-over-ssh.sh <script-path> [ENV_VAR ...]
#
# The named env vars are serialised into an `export` preamble and prepended to
# the script, and the whole thing goes to `bash -s` over stdin. Two properties
# matter here:
#   - the server needs NO checkout of this repo — the script travels with the
#     connection, so there is nothing on the box to keep in sync;
#   - secrets (GHCR_TOKEN) travel on stdin, never on a command line, so they do
#     not appear in `ps` on either machine. `printf %q` does the quoting, which
#     survives passwords and URLs that would break naive single-quoting.
#
# Required env: SSH_HOST, SSH_USER, SSH_KEY_FILE. Optional: SSH_PORT (22).
#
set -euo pipefail

SCRIPT="${1:?usage: run-over-ssh.sh <script-path> [ENV_VAR ...]}"
shift
: "${SSH_HOST:?}" "${SSH_USER:?}" "${SSH_KEY_FILE:?}"
[ -f "$SCRIPT" ] || { echo "ERROR: no such script: $SCRIPT" >&2; exit 1; }

{
  for var in "$@"; do
    printf 'export %s=%q\n' "$var" "${!var-}"
  done
  cat "$SCRIPT"
} | ssh -i "$SSH_KEY_FILE" \
        -p "${SSH_PORT:-22}" \
        -o StrictHostKeyChecking=no \
        -o BatchMode=yes \
        "${SSH_USER}@${SSH_HOST}" 'bash -s'
