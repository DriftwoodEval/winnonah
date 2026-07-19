#!/usr/bin/env bash
set -e

echo "Starting FastAPI server..."
uv run uvicorn api:app --host 0.0.0.0 --port 8000 &

echo "Starting cron schedule using: $CRON_SCHEDULE, $NOTIFY_CRON_SCHEDULE, $FAX_CRON_SCHEDULE, and $CATEGORIZATION_CRON_SCHEDULE"
echo "$CRON_SCHEDULE /app/cron-winnonah-python.sh" > /tmp/crontab
echo "$NOTIFY_CRON_SCHEDULE cd /app && uv run notify_reports.py" >> /tmp/crontab
echo "$FAX_CRON_SCHEDULE cd /app && uv run referral_fax_intake.py" >> /tmp/crontab
echo "$CATEGORIZATION_CRON_SCHEDULE cd /app && uv run fax_categorization.py" >> /tmp/crontab
supercronic -passthrough-logs /tmp/crontab
