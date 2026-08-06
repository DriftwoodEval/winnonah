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

# 0. Kill standby's STONITH loop first. It retries "docker compose down" on
# primary every 15s until it succeeds, with no awareness that failback is
# starting, so if primary becomes reachable while STONITH is still running
# it will tear down the services we're about to bring up.
log "Stopping standby's STONITH loop..."
ssh -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" \
  'if [ -f /tmp/stonith.pid ]; then kill "$(cat /tmp/stonith.pid)" 2>/dev/null; rm -f /tmp/stonith.pid; fi' \
  || log "Could not reach standby to stop STONITH, continuing."

# 1. Start primary driftwood-db, redis, and the monitoring stack
# Like caddy, these have no profile and are normally always-on, but
# STONITH's blanket `docker compose down` on primary (failover.sh) removes
# them along with everything else, so bring them back up here.
log "Starting primary driftwood-db, redis, loki, promtail, and grafana..."
if ! ${PRIMARY_COMPOSE} up -d --wait driftwood-db redis loki promtail grafana; then
  log "Primary MySQL did not become healthy. Fix it first."
  slack "Failback aborted. Primary MySQL not healthy."
  exit 1
fi
log "Primary MySQL OK."

# 2. Point primary at standby to catch up
log "Syncing primary from standby (${STANDBY_TAILSCALE_IP})..."
docker exec -i driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" << SQL
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
    | grep "Seconds_Behind_Source" | awk '{print $2}' || true)
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

# 5. Start primary caddy, cloudflared, and winnonah
# caddy has no profile so it's normally always-on, but STONITH's blanket
# `docker compose down` on primary (failover.sh) removes it along with
# everything else, so it needs to be started back up explicitly here.
log "Starting primary caddy, cloudflared, and winnonah..."
${PRIMARY_COMPOSE} up -d caddy cloudflared winnonah
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
