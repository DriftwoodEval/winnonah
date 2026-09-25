#!/usr/bin/env bash
# Sync kimai's data and plugins dirs from primary to standby, so standby has
# current attachments/uploads ready if it has to take over.
# Run via cron on PRIMARY, e.g.:
#   */15 * * * * /bin/bash [DIR]/failover/sync-kimai-data.sh >> /var/log/sync-kimai-data.log 2>&1

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/../.env"

# During a failover, standby's kimai is live and its data dir is the source
# of truth. Primary's cron keeps firing (STONITH only stops containers, not
# the host's cron), so without this guard a push here would overwrite
# whatever standby has taken in since the failover, with --delete making it
# unrecoverable.
[ "$(docker inspect -f '{{.State.Running}}' kimai 2>/dev/null)" = "true" ] || exit 0

SSH_OPTS="ssh -i ${STANDBY_SSH_KEY_PATH} -o StrictHostKeyChecking=no"

rsync -az --delete -e "${SSH_OPTS}" \
  "${SCRIPT_DIR}/../kimai/data/" \
  "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}:~/winnonah/kimai/data/"

rsync -az --delete -e "${SSH_OPTS}" \
  "${SCRIPT_DIR}/../kimai/plugins/" \
  "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}:~/winnonah/kimai/plugins/"

rsync -az -e "${SSH_OPTS}" \
  "${SCRIPT_DIR}/../kimai/local.yaml" \
  "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}:~/winnonah/kimai/local.yaml"
