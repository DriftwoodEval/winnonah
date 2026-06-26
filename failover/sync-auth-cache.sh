#!/usr/bin/env bash
# Sync Google auth token from primary to standby so the token stays fresh.
# Run via cron on PRIMARY, e.g.:
#   0 * * * * /bin/bash /home/ubuntu/app/failover/sync-auth-cache.sh >> /var/log/sync-auth-cache.log 2>&1

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"

rsync -az -e "ssh -i ${STANDBY_SSH_KEY_PATH} -o StrictHostKeyChecking=no" \
  "${SCRIPT_DIR}/../python/auth_cache/token.json" \
  "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}:~/app/python/auth_cache/token.json"
