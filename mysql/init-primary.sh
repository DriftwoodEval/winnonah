#!/bin/bash
# Runs once on first startup of driftwood-db on PRIMARY.
# Creates the replication user the standby will use.
# Docker passes MYSQL_ROOT_PASSWORD as an env var automatically.

mysql -u root -p"${MYSQL_ROOT_PASSWORD}" << SQL
CREATE USER IF NOT EXISTS '${MYSQL_REPLICATION_USER}'@'%'
  IDENTIFIED WITH caching_sha2_password BY '${MYSQL_REPLICATION_PASSWORD}';
GRANT REPLICATION SLAVE ON *.* TO '${MYSQL_REPLICATION_USER}'@'%';
FLUSH PRIVILEGES;
SQL
