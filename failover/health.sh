# Sourced by failover.sh and failback.sh.

# wait_for_health URL [ATTEMPTS] [HOST]: polls URL from inside winnonah-net
# every 2s. Returns 0 on the first success, 1 if it never answers (default
# timeout 60s). HOST, if given, is sent as the Host header, for apps that
# reject unknown hosts (Kimai only accepts its public hostname).
wait_for_health() {
  local url="$1" attempts="${2:-30}" host="${3:-}"
  local host_args=()
  [ -n "$host" ] && host_args=(-H "Host: $host")
  for _ in $(seq 1 "$attempts"); do
    if docker run --rm --network winnonah-net curlimages/curl:latest \
         -sf "${host_args[@]}" "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}
