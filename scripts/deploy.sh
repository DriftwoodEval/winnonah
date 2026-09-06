#!/usr/bin/env bash
# Rolling (blue/green) deploy for the winnonah-a/winnonah-b web slots.
# Exactly one slot runs at a time; Caddy (see caddy/Caddyfile) proxies to
# both and fails over to the other on a health check failure. This script
# pulls the new image into the idle slot, waits for it to pass /api/health,
# then stops the previously active slot, so Caddy always has a healthy
# backend to route to and a routine deploy never shows the maintenance page.
#
# Run this ON the host (primary or standby), from the repo checkout that
# holds the live docker-compose*.yaml and .env. Only the web slots are
# handled here; winnonah-python and everything else still updates via
# Watchtower's normal poll/HTTP-API trigger.
#
# Usage: scripts/deploy.sh [primary|standby] (default: primary)

set -euo pipefail
cd "$(dirname "$0")/.."

ROLE="${1:-primary}"
NETWORK="winnonah-net"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-2}"

case "$ROLE" in
primary | standby)
	COMPOSE="docker compose -f docker-compose.yaml -f docker-compose.$ROLE.yaml"
	;;
*)
	echo "Usage: $0 [primary|standby]" >&2
	exit 1
	;;
esac

is_running() {
	[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || echo false)" = "true" ]
}

wait_healthy() {
	local slot="$1"
	local elapsed=0
	until docker run --rm --network "$NETWORK" curlimages/curl:latest \
		-sf "http://$slot:3000/api/health" >/dev/null 2>&1; do
		elapsed=$((elapsed + HEALTH_INTERVAL))
		if [ "$elapsed" -ge "$HEALTH_TIMEOUT" ]; then
			return 1
		fi
		sleep "$HEALTH_INTERVAL"
	done
}

if is_running winnonah-a; then
	ACTIVE=winnonah-a
	IDLE=winnonah-b
elif is_running winnonah-b; then
	ACTIVE=winnonah-b
	IDLE=winnonah-a
else
	echo "==> Neither slot is running, starting winnonah-a fresh"
	ACTIVE=""
	IDLE=winnonah-a
fi

echo "==> Active slot: ${ACTIVE:-none}. Deploying to idle slot: $IDLE"

$COMPOSE pull "$IDLE"
$COMPOSE up -d --no-deps "$IDLE"

echo "==> Waiting for $IDLE to pass /api/health (timeout ${HEALTH_TIMEOUT}s)"
if ! wait_healthy "$IDLE"; then
	echo "ERROR: $IDLE did not become healthy in time. Rolling back." >&2
	$COMPOSE stop "$IDLE"
	exit 1
fi

echo "==> $IDLE is healthy"

if [ -n "$ACTIVE" ]; then
	echo "==> Stopping previous slot: $ACTIVE"
	$COMPOSE stop "$ACTIVE"
fi

echo "==> Deploy complete. Active slot is now $IDLE."
