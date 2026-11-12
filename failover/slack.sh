# Sourced by failover.sh and failback.sh. Needs SLACK_BOT_TOKEN and
# SLACK_CHANNEL_ID from .env.
#
# A run keeps one Slack message and edits it as steps finish: `slack` appends a
# line to it, posting the message first if there isn't one yet. failover.sh
# inherits SLACK_TS/SLACK_TEXT from standby-poll.sh, so it continues the message
# the Cloudflare Worker started when it first saw the primary unhealthy.
#
# Edits don't notify anyone, so `slack_alert` posts a separate message for
# things that need attention. It is also the one to use from background jobs,
# since they can't update this shell's SLACK_TEXT.

SLACK_TS="${SLACK_TS:-}"
SLACK_TEXT="${SLACK_TEXT:-}"

# slack_call TEXT [TS]: posts TEXT, or edits message TS when given. Prints the
# message ts. Python builds the JSON so quotes and newlines in TEXT (e.g. a
# failing command) can't break the payload. Never fails: Slack being down must
# not stop a failover.
slack_call() {
  SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN:-}" SLACK_CHANNEL_ID="${SLACK_CHANNEL_ID:-}" \
    python3 - "$1" "${2:-}" <<'PY' || true
import json, os, sys, urllib.request

text, ts = sys.argv[1], sys.argv[2]
body = {"channel": os.environ["SLACK_CHANNEL_ID"], "text": text}
if ts:
    body["ts"] = ts
method = "chat.update" if ts else "chat.postMessage"
request = urllib.request.Request(
    f"https://slack.com/api/{method}",
    json.dumps(body).encode(),
    {
        "Authorization": f"Bearer {os.environ['SLACK_BOT_TOKEN']}",
        "Content-Type": "application/json; charset=utf-8",
    },
)
try:
    print(json.load(urllib.request.urlopen(request, timeout=10)).get("ts", ""))
except Exception:
    pass
PY
}

slack() {
  SLACK_TEXT="${SLACK_TEXT:+$SLACK_TEXT$'\n'}$1"
  local ts
  ts="$(slack_call "$SLACK_TEXT" "$SLACK_TS")"
  SLACK_TS="${ts:-$SLACK_TS}"
}

slack_alert() {
  slack_call "$1" > /dev/null
}
