#!/usr/bin/env bash
set -e

echo "Starting cron schedule using: $CRON_SCHEDULE"
echo "$CRON_SCHEDULE /app/cron-winnonah-python.sh" > /tmp/crontab
supercronic -passthrough-logs /tmp/crontab
