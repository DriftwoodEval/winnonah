#!/usr/bin/env bash
set -e

echo "Starting FastAPI server..."
uv run uvicorn api.app:app --host 0.0.0.0 --port 8000 &

echo "Starting cron schedule using: $CRON_SCHEDULE, $NOTIFY_CRON_SCHEDULE, $CATEGORIZATION_CRON_SCHEDULE, $BABYNET_REPORT_CRON_SCHEDULE, $OFFICE_DRIVE_TIMES_CRON_SCHEDULE, $REFERRAL_STATUS_FAX_CRON_SCHEDULE, and $EXCLUSION_CHECK_CRON_SCHEDULE"
echo "$CRON_SCHEDULE /app/cron-winnonah-python.sh" > /tmp/crontab
echo "$NOTIFY_CRON_SCHEDULE cd /app && uv run python -m cron.notify_reports" >> /tmp/crontab
echo "$CATEGORIZATION_CRON_SCHEDULE cd /app && uv run python -m cron.fax_categorization" >> /tmp/crontab
echo "$BABYNET_REPORT_CRON_SCHEDULE cd /app && uv run python -m cron.babynet_report" >> /tmp/crontab
echo "$OFFICE_DRIVE_TIMES_CRON_SCHEDULE cd /app && uv run python -m cron.office_drive_times" >> /tmp/crontab
echo "$REFERRAL_STATUS_FAX_CRON_SCHEDULE cd /app && uv run python -m cron.referral_status_faxes" >> /tmp/crontab
echo "$EXCLUSION_CHECK_CRON_SCHEDULE cd /app && uv run python -m cron.exclusion_check" >> /tmp/crontab
supercronic -passthrough-logs /tmp/crontab
