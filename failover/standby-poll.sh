#!/usr/bin/env bash
# standby-poll.sh - runs on STANDBY via cron every minute
# Reads state from Cloudflare Worker KV. Triggers failover.sh if state="failover".
#
# Crontab:
#   * * * * * /bin/bash [DIR]/standby-poll.sh >> /var/log/standby-poll.log 2>&1

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/../.env"

FAILOVER_FLAG="/tmp/failover_active"
WORKER_URL="https://failover-monitor.${CF_WORKER_SUBDOMAIN}.workers.dev/state"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] standby-poll: $*"; }

response=$(curl -sf --max-time 10 \
    -H "X-Monitor-Secret: ${MONITOR_SECRET}" \
    "${WORKER_URL}" 2>/dev/null) || {
  log "Could not reach worker — skipping."
  exit 0
}

state=$(echo "${response}" | python3 -c \
  "import sys,json; print(json.load(sys.stdin)['state'])" 2>/dev/null || echo "unknown")
log "Worker state: ${state}"

case "${state}" in
  "failover")
    if [ -f "${FAILOVER_FLAG}" ]; then
      log "Flag exists — already ran failover."
      exit 0
    fi
    log "⚡ Triggering failover..."
    bash "${SCRIPT_DIR}/failover.sh"
    ;;
  "normal"|"failover_active")
    ;;
  *)
    log "Unknown state '${state}' — no action."
    ;;
esac
