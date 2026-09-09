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

# 0. Kill standby's STONITH loop first. It retries stopping and removing
# primary's containers every 15s until it succeeds, with no awareness that
# failback is starting, so if primary becomes reachable while STONITH is still
# running it will tear down the services we're about to bring up.
log "Stopping standby's STONITH loop..."
ssh -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" \
  'if [ -f /tmp/stonith.pid ]; then kill "$(cat /tmp/stonith.pid)" 2>/dev/null; rm -f /tmp/stonith.pid; fi' \
  || log "Could not reach standby to stop STONITH, continuing."

# 1. Start primary driftwood-db, redis, and the monitoring stack
# Like caddy, these have no profile and are normally always-on, but STONITH
# (failover.sh) stops and removes every primary container, so bring them back
# up here.
log "Starting primary driftwood-db, redis, loki, promtail, and grafana..."
if ! ${PRIMARY_COMPOSE} up -d --wait driftwood-db redis loki promtail grafana; then
  log "Primary MySQL did not become healthy. Fix it first."
  slack "Failback aborted. Primary MySQL not healthy."
  exit 1
fi
log "Primary MySQL OK."

# 2. Dump standby (the source of truth right now) and load it onto primary,
# replacing primary's data wholesale instead of catching primary up via live
# GTID replication. Seconds_Behind_Source is not a trustworthy "caught up"
# signal right after START REPLICA: it can read 0 before the IO thread has
# even connected to the source, and the old wait loop's first check ran with
# no prior sleep, so it could pass instantly, before anything had actually
# replicated, and traffic got cut back to a primary still holding its stale
# pre-failover data. A dump-and-restore has no such false-positive.
#
# The same dump is also kept as a timestamped backup on standby itself
# (~/winnonah/backups/failback), since it's about to be overwritten by
# mysql-replication-init.sh re-seeding standby as primary's replica in
# step 6, and standby is otherwise the only copy of its own pre-failback
# state.
log "Dumping standby database (${STANDBY_TAILSCALE_IP})..."
# MYSQL_ROOT_PASSWORD is passed explicitly since the remote shell won't have
# it, then read back inside the heredoc's own bash -s process (see the same
# pattern and reasoning in mysql-replication-init.sh).
ssh -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" \
  "MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD} bash -s" > /tmp/standby_dump.sql << 'REMOTE'
set -euo pipefail
BACKUP_DIR="$HOME/winnonah/backups/failback"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/standby_$(date +%Y%m%d_%H%M%S).sql"

docker exec driftwood-db mysqldump \
  -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  --all-databases \
  --single-transaction \
  --source-data=2 \
  --flush-logs \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=ON \
  | tee "$BACKUP_FILE"

# Keep only the 5 most recent failback backups.
ls -1t "$BACKUP_DIR"/standby_*.sql | tail -n +6 | xargs -r rm -f
REMOTE
log "Dump complete: $(du -sh /tmp/standby_dump.sql | cut -f1)"
slack "Standby dumped and backed up on standby. Restoring onto primary..."

log "Restoring primary from standby's dump..."
docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "STOP REPLICA; RESET REPLICA ALL; RESET BINARY LOGS AND GTIDS;
      SET GLOBAL read_only=OFF; SET GLOBAL super_read_only=OFF;"

docker exec -i driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  < /tmp/standby_dump.sql
log "Primary restored from standby."
slack "Primary restored from standby's data."

# 3. Stop standby cloudflared and its active web slot
# Deploy.sh can leave either winnonah-a or winnonah-b running on standby
# (a rolling deploy may have happened while standby was serving), so find
# whichever one is actually up rather than assuming winnonah-a.
STANDBY_SLOT=$(ssh -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" \
  'for s in winnonah-a winnonah-b; do
     [ "$(docker inspect -f "{{.State.Running}}" "$s" 2>/dev/null)" = "true" ] && echo "$s" && break
   done')
STANDBY_SLOT="${STANDBY_SLOT:-winnonah-a}"

log "Stopping standby services (web slot: ${STANDBY_SLOT})..."
ssh -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" \
  "${STANDBY_COMPOSE} --profile active_only stop cloudflared ${STANDBY_SLOT} winnonah-python"
slack "Standby tunnel stopped. Starting primary tunnel..."

# 4. Start primary caddy, cloudflared, and winnonah-a
# caddy has no profile so it's normally always-on, but STONITH (failover.sh)
# stops and removes it along with everything else, so start it back up
# explicitly here. Primary was fully torn down, so there's no existing web slot
# to preserve - winnonah-a is always the right one to start.
log "Starting primary caddy, cloudflared, and winnonah-a..."
${PRIMARY_COMPOSE} up -d caddy cloudflared winnonah-a
sleep 10

# 5. Start primary python jobs
log "Starting primary python jobs..."
${PRIMARY_COMPOSE} up -d winnonah-python
slack "Python jobs active on primary."

# 6. Re-establish primary -> standby replication
log "Disconnecting primary replica channel..."
docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "STOP REPLICA; RESET REPLICA ALL;"

log "Re-seeding standby as replica..."
bash "$DIR/mysql-replication-init.sh"
slack "Replication restored: primary -> standby."

# 7. Clear flags and ack to Worker
log "Clearing failover flags..."
ssh -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" \
  "rm -f /tmp/failover_active"

curl -sf -X POST \
  -H "X-Monitor-Secret: ${MONITOR_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"event":"failback_complete"}' \
  "https://failover-monitor.${CF_WORKER_SUBDOMAIN}.workers.dev/ack" \
  || log "Could not ack to worker."

# 8. Re-enable watchtower
log "Re-enabling watchtower..."
${PRIMARY_COMPOSE} up -d watchtower

# 9. Email notification (Slack already covered each step above)
docker exec winnonah-python uv run failover_notify.py failback \
  || log "Could not send failback email, non-fatal."

log "=== FAILBACK COMPLETE ==="
slack "Failback complete. Primary is live at emr.driftwoodeval.com. System normal."
