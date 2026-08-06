#!/usr/bin/env bash
# Manual fallback for the "Build and Push Docker Images" GitHub Actions
# workflow, for use when GitHub Actions itself is down. Builds and pushes
# both images to ghcr.io the same way the workflow does, then triggers
# Watchtower directly instead of waiting on the workflow's deploy job.
#
# Requires: docker logged into ghcr.io and Tailscale connected so Watchtower's
# HTTP API (bound to the primary's Tailscale IP only) is reachable.
#
# Usage: scripts/manual-deploy.sh [node|python|all] (default: all)

set -euo pipefail
cd "$(dirname "$0")/.."

REGISTRY="ghcr.io/driftwoodeval"
WATCHTOWER_HOST="opti"
TARGET="${1:-all}"

SHORT_SHA="$(git rev-parse --short HEAD)"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

build_push_node() {
	echo "==> Building node image ($REGISTRY/winnonah:latest, $REGISTRY/winnonah:$SHORT_SHA)"
	docker build \
		--build-arg NEXT_PUBLIC_COMMIT_HASH="$SHORT_SHA" \
		--build-arg NEXT_PUBLIC_GIT_BRANCH="$GIT_BRANCH" \
		--build-arg NEXT_PUBLIC_BUILD_DATE="$BUILD_DATE" \
		-t "$REGISTRY/winnonah:latest" \
		-t "$REGISTRY/winnonah:$SHORT_SHA" \
		.
	docker push "$REGISTRY/winnonah:latest"
	docker push "$REGISTRY/winnonah:$SHORT_SHA"
}

build_push_python() {
	echo "==> Building python image ($REGISTRY/winnonah-python:latest, $REGISTRY/winnonah-python:$SHORT_SHA)"
	docker build \
		-f python/Dockerfile \
		-t "$REGISTRY/winnonah-python:latest" \
		-t "$REGISTRY/winnonah-python:$SHORT_SHA" \
		python
	docker push "$REGISTRY/winnonah-python:latest"
	docker push "$REGISTRY/winnonah-python:$SHORT_SHA"
}

trigger_watchtower() {
	if [[ -z "${WATCHTOWER_HTTP_API_TOKEN:-}" ]]; then
		echo "==> Loading WATCHTOWER_HTTP_API_TOKEN from .env"
		set -a
		# shellcheck disable=SC1091
		source .env
		set +a
	fi

	echo "==> Triggering Watchtower update on $WATCHTOWER_HOST"
	curl -sf -X POST \
		-H "Authorization: Bearer $WATCHTOWER_HTTP_API_TOKEN" \
		"http://$WATCHTOWER_HOST:8080/v1/update"
	echo "==> Watchtower update triggered"
}

case "$TARGET" in
node)
	build_push_node
	;;
python)
	build_push_python
	;;
all)
	build_push_node
	build_push_python
	;;
*)
	echo "Usage: $0 [node|python|all]" >&2
	exit 1
	;;
esac

trigger_watchtower
