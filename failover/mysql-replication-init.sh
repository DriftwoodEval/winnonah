#!/usr/bin/env bash
# mysql-replication-init.sh
#
# Run ONCE from the PRIMARY server after both MySQL containers are up.
# Snapshots primary and configures standby as a replica.
#
# Usage:  bash failover/mysql-replication-init.sh
# Requires: .env in parent directory, ssh access to standby

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/../.env"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "=== MySQL Replication Init ==="

# 1. Dump primary
log "Dumping primary database..."
docker exec driftwood-db mysqldump \
  -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  --all-databases \
  --single-transaction \
  --source-data=2 \
  --flush-logs \
  --routines \
  --triggers \
  > /tmp/primary_dump.sql

log "Dump complete: $(du -sh /tmp/primary_dump.sql | cut -f1)"

# 2. Copy to standby
log "Copying dump to standby (${STANDBY_TAILSCALE_IP})..."
scp -i "${STANDBY_SSH_KEY_PATH}" \
  /tmp/primary_dump.sql \
  "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}:/tmp/primary_dump.sql"

# 3. Configure standby
log "Configuring standby MySQL..."
ssh -i "${STANDBY_SSH_KEY_PATH}" \
  "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" bash << REMOTE
set -euo pipefail

docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "STOP REPLICA; SET GLOBAL read_only=OFF; SET GLOBAL super_read_only=OFF;"

docker exec -i driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  < /tmp/primary_dump.sql

docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" << SQL
STOP REPLICA;
RESET REPLICA ALL;
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='${PRIMARY_TAILSCALE_IP}',
  SOURCE_PORT=3306,
  SOURCE_USER='${MYSQL_REPLICATION_USER}',
  SOURCE_PASSWORD='${MYSQL_REPLICATION_PASSWORD}',
  SOURCE_AUTO_POSITION=1,
  SOURCE_CONNECT_RETRY=10,
  SOURCE_RETRY_COUNT=3600,
  GET_SOURCE_PUBLIC_KEY=1;
START REPLICA;
SQL

docker exec driftwood-db mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "SET GLOBAL read_only=ON; SET GLOBAL super_read_only=ON;"

echo "Replica configured."
REMOTE

# 4. Verify
log "Checking replication status..."
sleep 3
ssh -i "${STANDBY_SSH_KEY_PATH}" \
  "${STANDBY_SSH_USER}@${STANDBY_TAILSCALE_IP}" \
  "docker exec driftwood-db mysql -uroot -p'${MYSQL_ROOT_PASSWORD}' \
   -e 'SHOW REPLICA STATUS\G' 2>/dev/null" \
  | grep -E "Replica_IO_Running|Replica_SQL_Running|Seconds_Behind_Source|Last_Error"

log "=== Replication init complete! ==="
