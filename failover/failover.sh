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
  # JSON-encoded via python3 rather than hand-built, since a hand-built
  # payload breaks on a message containing a double quote or newline (e.g.
  # a failing command reported by the ERR trap below).
  local payload
  payload="$(python3 -c 'import json, sys; print(json.dumps({"text": sys.argv[1]}))' "$1")"
  curl -s -X POST "${SLACK_WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "${payload}" > /dev/null || true
}

# Without this, a failure partway through (e.g. MySQL promotion) would exit
# before the flag is normally set, leaving standby-poll.sh free to retrigger
# a brand new run (and a new STONITH loop) on every cron tick, forever.
#
# The trap calls a function rather than inlining these steps, and passes
# $?/$LINENO/$BASH_COMMAND in as arguments, because referencing them from
# separate statements inside the trap body (rather than in one single
# expansion) makes bash report the wrong line for a command that spans
# multiple physical lines: $LINENO drifts to the end of that command, or
# further, instead of staying on the line where it started.
on_error() {
  local status="$1" line="$2" command="$3"
  log "FAILED (exit ${status}) at line ${line}: ${command}"
  slack "🚨 Failover script failed at line ${line} (exit ${status}): \`${command:0:500}\`. Standby may not be fully up - check standby-poll.log and this host manually."
}
trap 'on_error "$?" "${LINENO}" "${BASH_COMMAND}"' ERR

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

    # Stop and remove the containers, but never `docker compose down`: down also
    # tears down winnonah-net, which fails (and exits non-zero) whenever a
    # container is already half-detached from it, e.g. after a crash. That would
    # make STONITH retry forever and never send the success signal even though
    # primary is already safely down. `stop && rm -f` leaves the empty network
    # in place (failback's `up -d` reuses it) and exits 0 once the containers
    # are gone, which is all split-brain prevention actually needs.
    if ssh -o LogLevel=quiet \
           -o ConnectTimeout=5 \
           -o BatchMode=yes \
           -i "${STANDBY_SSH_KEY_PATH}" \
           "${STANDBY_SSH_USER}@${PRIMARY_TAILSCALE_IP}" \
           "cd ~/winnonah && docker compose stop && docker compose rm -f" >> "$STONITH_LOG" 2>&1; then

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
echo "${STONITH_PID}" > /tmp/stonith.pid
log "STONITH running in background (PID ${STONITH_PID}). Proceeding with failover."

# Set the flag now, not after promotion/services succeed, so a failure below
# stops cron from retriggering this on every tick.
touch "${FAILOVER_FLAG}"

# 2. Promote MySQL
log "Stopping replication and promoting MySQL..."
docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "STOP REPLICA; RESET REPLICA ALL;
      SET GLOBAL read_only=OFF; SET GLOBAL super_read_only=OFF;"

# Ensure replication user exists for when primary recovers and re-syncs from us
docker exec -i driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" << SQL
CREATE USER IF NOT EXISTS '${MYSQL_REPLICATION_USER}'@'%'
  IDENTIFIED WITH caching_sha2_password BY '${MYSQL_REPLICATION_PASSWORD}';
GRANT REPLICATION SLAVE ON *.* TO '${MYSQL_REPLICATION_USER}'@'%';
FLUSH PRIVILEGES;
SQL
slack "MySQL promoted to primary."
log "Step 2 done."

# 3. Start services
# Standby had no web slot running before failover (docker-compose.standby.yaml
# gates winnonah-a/winnonah-b behind the active_only profile), so there's no
# existing state to preserve - winnonah-a is always the right one to start.
log "Starting cloudflared, winnonah-a, winnonah-python..."
# Retries because `up -d` on a not-yet-existing network can hit a Docker
# Compose race ("network ... not found") where one container attaches before
# the network finishes being created - transient, succeeds on rerun.
up_ok=false
for attempt in 1 2 3; do
  if ${COMPOSE} --profile active_only up -d cloudflared winnonah-a winnonah-python; then
    up_ok=true
    break
  fi
  log "up -d failed (attempt ${attempt}/3), retrying in 3s..."
  sleep 3
done
# Let the 4th attempt run unguarded on total failure, so set -e's ERR trap
# fires normally (correct line/command in the Slack alert) instead of us
# reporting it manually here.
[ "${up_ok}" = true ] || ${COMPOSE} --profile active_only up -d cloudflared winnonah-a winnonah-python
log "Step 3 done."

# 3b. Confirm winnonah-a is actually serving before telling the world traffic is
# live. winnonah-a has no compose healthcheck, so `up -d` returning only means
# the container started, not that Next.js is up. Standby is the last line of
# defense, so a failed probe alerts loudly but does not abort: a half-up standby
# still beats no standby.
log "Waiting for winnonah-a to pass /api/health (timeout 60s)..."
health_ok=false
for _ in $(seq 1 30); do
  if docker run --rm --network winnonah-net curlimages/curl:latest \
       -sf "http://winnonah-a:3000/api/health" >/dev/null 2>&1; then
    health_ok=true
    break
  fi
  sleep 2
done
if [ "${health_ok}" = true ]; then
  log "winnonah-a healthy."
  slack "Services started and winnonah-a is serving. Traffic routing to standby within seconds."
else
  log "WARNING: winnonah-a did not pass /api/health within 60s."
  slack "⚠️ Failover: winnonah-a on standby did not pass /api/health within 60s. Site may still be down - check standby now."
fi

# 4. Ack to Worker
curl -sf -X POST \
  -H "X-Monitor-Secret: ${MONITOR_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"event":"failover_complete"}' \
  "https://failover-monitor.${CF_WORKER_SUBDOMAIN}.workers.dev/ack" \
  || log "Could not ack to worker, non-fatal."

# 5. Email notification (Slack already covered each step above)
docker exec winnonah-python uv run failover_notify.py failover \
  || log "Could not send failover email, non-fatal."

log "=== FAILOVER COMPLETE ==="
log "STONITH running in background (PID ${STONITH_PID}), retrying every ${STONITH_INTERVAL}s until confirmed. Check $STONITH_LOG for status."
slack "Failover complete. Standby is live at emr.driftwoodeval.com. Run failback.sh on primary when it recovers."
