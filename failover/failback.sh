#!/usr/bin/env bash
# failback.sh - run manually on PRIMARY after it has recovered

set -euo pipefail

DIR="$(dirname "$0")"
ROOT="$(realpath "$DIR/..")"

source "$ROOT/.env"

PRIMARY_COMPOSE="docker compose -f $ROOT/docker-compose.yaml -f $ROOT/docker-compose.primary.yaml --env-file $ROOT/.env"
STANDBY_COMPOSE="docker compose -f ~/winnonah/docker-compose.yaml -f ~/winnonah/docker-compose.standby.yaml --env-file ~/winnonah/.env"

log()   { echo "[$(date '+%H:%M:%S')] FAILBACK: $*"; }
slack() {
  curl -s -X POST "${SLACK_WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"$1\"}" > /dev/null || true
}

log "=== FAILBACK STARTING ==="
slack "Failback initiated. Syncing primary from standby before swapping traffic."

# 1. Check primary MySQL
if ! docker exec driftwood-db mysqladmin ping -uroot -p"${MYSQL_ROOT_PASSWORD}" -h localhost \
    > /dev/null 2>&1; then
  log "Primary MySQL not healthy. Fix it first."
  slack "Failback aborted. Primary MySQL not healthy."
  exit 1
fi
log "Primary MySQL OK."

# 2. Point primary at standby to catch up
log "Syncing primary from standby (${STANDBY_TAILSCALE_IP})..."
docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" << SQL
STOP REPLICA;
RESET REPLICA ALL;
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='${STANDBY_TAILSCALE_IP}',
  SOURCE_PORT=3306,
  SOURCE_USER='${MYSQL_REPLICATION_USER}',
  SOURCE_PASSWORD='${MYSQL_REPLICATION_PASSWORD}',
  SOURCE_AUTO_POSITION=1,
  GET_SOURCE_PUBLIC_KEY=1;
START REPLICA;
SQL
slack "Primary replicating from standby. Waiting to catch up..."

# 3. Wait for lag = 0
log "Waiting for primary to catch up..."
for i in $(seq 1 60); do
  lag=$(docker exec driftwood-db mysql --vertical -uroot -p"${MYSQL_ROOT_PASSWORD}" \
    -e "SHOW REPLICA STATUS" 2>/dev/null \
    | grep "Seconds_Behind_Source" | awk '{print $2}')
  log "  Lag: ${lag:-unknown}s"
  [ "${lag}" = "0" ] && break
  sleep 5
done
log "Primary caught up."

# 4. Stop standby cloudflared and winnonah
log "Stopping standby services..."
ssh -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" \
  "${STANDBY_COMPOSE} --profile active_only stop cloudflared winnonah winnonah-python"
slack "Standby tunnel stopped. Starting primary tunnel..."

# 5. Start primary cloudflared and winnonah
log "Starting primary cloudflared and winnonah..."
${PRIMARY_COMPOSE} up -d cloudflared winnonah
sleep 10

# 6. Start primary python jobs
log "Starting primary python jobs..."
${PRIMARY_COMPOSE} up -d winnonah-python
slack "Python jobs active on primary."

# 7. Re-establish primary -> standby replication
log "Disconnecting primary replica channel..."
docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "STOP REPLICA; RESET REPLICA ALL;"

log "Re-seeding standby as replica..."
bash "$DIR/mysql-replication-init.sh"
slack "Replication restored: primary -> standby."

# 8. Clear flags and ack to Worker
log "Clearing failover flags..."
ssh -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" \
  "rm -f /tmp/failover_active"

curl -sf -X POST \
  -H "X-Monitor-Secret: ${MONITOR_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"event":"failback_complete"}' \
  "https://failover-monitor.${CF_WORKER_SUBDOMAIN}.workers.dev/ack" \
  || log "Could not ack to worker."

# 9. Re-enable watchtower
log "Re-enabling watchtower..."
${PRIMARY_COMPOSE} up -d watchtower

log "=== FAILBACK COMPLETE ==="
slack "Failback complete. Primary is live at emr.driftwoodeval.com. System normal."
