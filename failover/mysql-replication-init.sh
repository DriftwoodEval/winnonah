#!/usr/bin/env bash
# mysql-replication-init.sh
#
# Run from the PRIMARY server to (re)initialize replication to standby.
# Safe to run multiple times -- resets standby state cleanly each time.
#
# Used for:
#   - Initial setup
#   - After failback, to re-establish primary -> standby replication
#
# Usage: bash failover/mysql-replication-init.sh

set -euo pipefail
source "$(dirname "$0")/../.env"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "=== MySQL Replication Init ==="

# 1. Dump primary
# --set-gtid-purged=OFF lets SOURCE_AUTO_POSITION handle GTID sync instead,
# avoiding the "partial dump" warning and GTID_PURGED conflict errors.
log "Dumping primary database..."
docker exec driftwood-db mysqldump \
  -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  --all-databases \
  --single-transaction \
  --source-data=2 \
  --flush-logs \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  > /tmp/primary_dump.sql

log "Dump complete: $(du -sh /tmp/primary_dump.sql | cut -f1)"

# 2. Copy dump to standby
log "Copying dump to standby (${STANDBY_TAILSCALE_IP})..."
scp -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" \
  /tmp/primary_dump.sql \
  "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}:/tmp/primary_dump.sql"

# 3. Write replication config SQL locally where variables expand cleanly
cat > /tmp/configure_replica.sql << SQL
STOP REPLICA;
RESET REPLICA ALL;
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='${PRIMARY_TAILSCALE_IP}',
  SOURCE_PORT=3306,
  SOURCE_USER='${MYSQL_REPLICATION_USER}',
  SOURCE_PASSWORD='${MYSQL_REPLICATION_PASSWORD}',
  SOURCE_AUTO_POSITION=1,
  GET_SOURCE_PUBLIC_KEY=1;
START REPLICA;
SQL

scp -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" \
  /tmp/configure_replica.sql \
  "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}:/tmp/configure_replica.sql"

# 4. On standby: load dump and configure replication
# MYSQL_ROOT_PASSWORD is passed explicitly since the remote shell won't have it
log "Configuring standby..."
ssh -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" \
  "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" \
  "MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD} bash -s" << 'REMOTE'
set -euo pipefail

docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "STOP REPLICA; SET GLOBAL read_only=OFF; SET GLOBAL super_read_only=OFF;" 2>/dev/null

docker exec -i driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  2>/dev/null < /tmp/primary_dump.sql

docker exec -i driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  2>/dev/null < /tmp/configure_replica.sql

docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "SET GLOBAL read_only=ON; SET GLOBAL super_read_only=ON;" 2>/dev/null

echo "Standby configured."
REMOTE

# 5. Verify replication
log "Checking replication status on standby..."
sleep 5
ssh -o LogLevel=quiet -i "${STANDBY_SSH_KEY_PATH}" \
  "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" \
  "docker exec driftwood-db mysql --vertical -uroot -p\"${MYSQL_ROOT_PASSWORD}\" \
   -e \"SHOW REPLICA STATUS\" 2>/dev/null \
   | grep -E 'Replica_IO_Running|Replica_SQL_Running|Seconds_Behind_Source|Last_IO_Error'"

log "=== Replication init complete ==="
