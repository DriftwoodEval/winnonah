#!/usr/bin/env bash
# runs on STANDBY when standby-poll.sh detects failover state


set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"
cd "${SCRIPT_DIR}/.."

FAILOVER_FLAG="/tmp/failover_active"

log()   { echo "[$(date '+%H:%M:%S')] FAILOVER: $*"; }
slack() {
  curl -s -X POST "${SLACK_WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"$1\"}" > /dev/null || true
}

if [ -f "${FAILOVER_FLAG}" ]; then
  log "Already active - skipping."
  exit 0
fi

log "=== FAILOVER STARTING ==="
slack "🔶 *Failover starting* on standby."

# ── 1. Promote MySQL ──────────────────────────────────────────────────────────
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
slack "🔶 MySQL promoted to primary."
log "Step 1 done."

# ── 2. Start app + python jobs ────────────────────────────────────────────────
log "Starting winnonah app and python jobs..."
docker compose -f docker-compose.yaml -f docker-compose.standby.yml \
  --env-file .env up -d winnonah winnonah-python
slack "🔶 App and Python jobs started."
log "Step 2 done."

# ── 3. Start cloudflared ──────────────────────────────────────────────────────
# Uses the same CF_TOKEN as primary. Cloudflare sees a healthy connector
# and routes traffic here. When primary recovers and its connector reconnects,
# Cloudflare will load-balance - failback.sh stops this container to fix that.
log "Starting cloudflared..."
docker compose -f docker-compose.yaml --env-file .env up -d cloudflared
slack "🔶 Cloudflare tunnel started — traffic routing to standby within seconds."
log "Step 3 done."

# ── 4. Set flag + ack to Worker ───────────────────────────────────────────────
touch "${FAILOVER_FLAG}"

curl -sf -X POST \
  -H "X-Monitor-Secret: ${MONITOR_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"event":"failover_complete"}' \
  "https://failover-monitor.${CF_WORKER_SUBDOMAIN}.workers.dev/ack" \
  || log "⚠️  Could not ack to worker - non-fatal."

log "=== FAILOVER COMPLETE ==="
slack "✅ *Failover complete.* Standby is live at emr.driftwoodeval.com. Run \`failback.sh\` on primary when it recovers."
