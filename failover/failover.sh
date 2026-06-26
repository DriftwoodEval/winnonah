#!/usr/bin/env bash
# failover.sh - runs on STANDBY when standby-poll.sh detects failover state

set -euo pipefail

DIR="$(dirname "$0")"
ROOT="$(realpath "$DIR/..")"

source "$ROOT/.env"

COMPOSE="docker compose -f $ROOT/docker-compose.yaml -f $ROOT/docker-compose.standby.yaml --env-file $ROOT/.env"
FAILOVER_FLAG="/tmp/failover_active"

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

# 1. Promote MySQL
log "Stopping replication and promoting MySQL..."
docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "STOP REPLICA; RESET REPLICA ALL;
      SET GLOBAL read_only=OFF; SET GLOBAL super_read_only=OFF;" 2>/dev/null

# Ensure replication user exists for when primary recovers and re-syncs from us
docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" << SQL 2>/dev/null
CREATE USER IF NOT EXISTS '${MYSQL_REPLICATION_USER}'@'%'
  IDENTIFIED WITH caching_sha2_password BY '${MYSQL_REPLICATION_PASSWORD}';
GRANT REPLICATION SLAVE ON *.* TO '${MYSQL_REPLICATION_USER}'@'%';
FLUSH PRIVILEGES;
SQL
slack "MySQL promoted to primary."
log "Step 1 done."

# 2. Start services
log "Starting cloudflared, winnonah, winnonah-python..."
${COMPOSE} --profile active_only up -d cloudflared winnonah winnonah-python
slack "Services started. Traffic routing to standby within seconds."
log "Step 2 done."

# 3. Set flag and aPck to Worker
touch "${FAILOVER_FLAG}"

curl -sf -X POST \
  -H "X-Monitor-Secret: ${MONITOR_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"event":"failover_complete"}' \
  "https://failover-monitor.${CF_WORKER_SUBDOMAIN}.workers.dev/ack" \
  || log "Could not ack to worker, non-fatal."

log "=== FAILOVER COMPLETE ==="
slack "Failover complete. Standby is live at emr.driftwoodeval.com. Run failback.sh on primary when it recovers."
