# Sourced by failover.sh and failback.sh.

# wait_for_health URL [ATTEMPTS]: polls URL from inside winnonah-net every 2s.
# Returns 0 on the first success, 1 if it never answers (default timeout 60s).
wait_for_health() {
  local url="$1" attempts="${2:-30}"
  for _ in $(seq 1 "$attempts"); do
    if docker run --rm --network winnonah-net curlimages/curl:latest \
         -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}
