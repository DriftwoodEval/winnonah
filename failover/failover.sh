#!/usr/bin/env bash
# failover.sh - runs on STANDBY when standby-poll.sh detects failover state

set -euo pipefail

DIR="$(dirname "$0")"
ROOT="$(realpath "$DIR/..")"

source "$ROOT/.env"

COMPOSE="docker compose -f $ROOT/docker-compose.yaml -f $ROOT/docker-compose.standby.yaml --env-file $ROOT/.env"
FAILOVER_FLAG="/tmp/failover_active"
STONITH_LOG="/tmp/stonith.log"
STONITH_INTERVAL=15 # retry every 15s

log()   { echo "[$(date '+%H:%M:%S')] FAILOVER: $*"; }
slack() {
  curl -s -X POST "${SLACK_WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"$1\"}" > /dev/null || true
}

if [ -f "${FAILOVER_FLAG}" ]; then
  log "Already active, skipping."
  exit 0
fi

log "=== FAILOVER STARTING ==="
slack "Failover starting on standby."

# 1. STONITH -   background loop, does not block failover
stonith_loop() {
  echo "[$(date '+%H:%M:%S')] STONITH: Starting indefinite attempts against primary (${PRIMARY_TAILSCALE_IP})" >> "$STONITH_LOG"

  local attempt=1

  while true; do
    echo "[$(date '+%H:%M:%S')] STONITH: Attempt #$attempt..." >> "$STONITH_LOG"

    if ssh -o LogLevel=quiet \
           -o ConnectTimeout=5 \
           -o BatchMode=yes \
           -i "${STANDBY_SSH_KEY_PATH}" \
           "${STANDBY_SSH_USER}@${PRIMARY_TAILSCALE_IP}" \
           "cd ~/winnonah && docker compose down" >> "$STONITH_LOG" 2>&1; then

      echo "[$(date '+%H:%M:%S')] STONITH: Success. Primary containers stopped." >> "$STONITH_LOG"
      slack "✅ STONITH Success: Primary containers confirmed stopped on ${PRIMARY_TAILSCALE_IP}. Split-brain risk averted."
      break
    fi

    # Send a Slack alert every 100 attempts so we know it's still fighting
    if [ $((attempt % 100)) -eq 0 ]; then
      slack "⚠️ STONITH Warning: Still unable to reach primary (${PRIMARY_TAILSCALE_IP}) after $attempt attempts. Continuing to retry..."
    fi

    echo "[$(date '+%H:%M:%S')] STONITH: SSH failed, retrying in ${STONITH_INTERVAL}s..." >> "$STONITH_LOG"
    sleep "$STONITH_INTERVAL"
    attempt=$((attempt + 1))
  done
}

# Launch STONITH in background - failover continues immediately
stonith_loop &
STONITH_PID=$!
log "STONITH running in background (PID ${STONITH_PID}). Proceeding with failover."

# 2. Promote MySQL
log "Stopping replication and promoting MySQL..."
docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "STOP REPLICA; RESET REPLICA ALL;
      SET GLOBAL read_only=OFF; SET GLOBAL super_read_only=OFF;"

# Ensure replication user exists for when primary recovers and re-syncs from us
docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" << SQL
CREATE USER IF NOT EXISTS '${MYSQL_REPLICATION_USER}'@'%'
  IDENTIFIED WITH caching_sha2_password BY '${MYSQL_REPLICATION_PASSWORD}';
GRANT REPLICATION SLAVE ON *.* TO '${MYSQL_REPLICATION_USER}'@'%';
FLUSH PRIVILEGES;
SQL
slack "MySQL promoted to primary."
log "Step 2 done."

# 3. Start services
log "Starting cloudflared, winnonah, winnonah-python..."
${COMPOSE} --profile active_only up -d cloudflared winnonah winnonah-python
slack "Services started. Traffic routing to standby within seconds."
log "Step 3 done."

# 4. Set flag and ack to Worker
touch "${FAILOVER_FLAG}"

curl -sf -X POST \
  -H "X-Monitor-Secret: ${MONITOR_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"event":"failover_complete"}' \
  "https://failover-monitor.${CF_WORKER_SUBDOMAIN}.workers.dev/ack" \
  || log "Could not ack to worker, non-fatal."

log "=== FAILOVER COMPLETE ==="
log "STONITH running in background (PID ${STONITH_PID}), retrying every ${STONITH_INTERVAL}s until confirmed. Check $STONITH_LOG for status."
slack "Failover complete. Standby is live at emr.driftwoodeval.com. Run failback.sh on primary when it recovers."
