#!/usr/bin/env bash
set -e

echo "Starting FastAPI server..."
uv run uvicorn api:app --host 0.0.0.0 --port 8000 &

echo "Starting cron schedule using: $CRON_SCHEDULE, $NOTIFY_CRON_SCHEDULE, $CATEGORIZATION_CRON_SCHEDULE, $BABYNET_REPORT_CRON_SCHEDULE, and $OFFICE_DRIVE_TIMES_CRON_SCHEDULE"
echo "$CRON_SCHEDULE /app/cron-winnonah-python.sh" > /tmp/crontab
echo "$NOTIFY_CRON_SCHEDULE cd /app && uv run notify_reports.py" >> /tmp/crontab
echo "$CATEGORIZATION_CRON_SCHEDULE cd /app && uv run fax_categorization.py" >> /tmp/crontab
echo "$BABYNET_REPORT_CRON_SCHEDULE cd /app && uv run babynet_report.py" >> /tmp/crontab
echo "$OFFICE_DRIVE_TIMES_CRON_SCHEDULE cd /app && uv run office_drive_times.py" >> /tmp/crontab
supercronic -passthrough-logs /tmp/crontab
