#!/usr/bin/env bash
set -e

echo "Starting FastAPI server..."
uv run uvicorn api:app --host 0.0.0.0 --port 8000 &

echo "Starting cron schedule using: $CRON_SCHEDULE and $NOTIFY_CRON_SCHEDULE"
echo "$CRON_SCHEDULE /app/cron-winnonah-python.sh" > /tmp/crontab
echo "$NOTIFY_CRON_SCHEDULE cd /app && uv run notify_reports.py" >> /tmp/crontab
supercronic -passthrough-logs /tmp/crontab
