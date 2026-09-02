import asyncio
from datetime import timedelta

from dotenv import load_dotenv
from loguru import logger

from utils.constants import TABLE_CLIENT, TABLE_OFFICE, TABLE_OFFICE_DRIVE_TIME
from utils.database import get_db
from utils.misc import json_log_format
from utils.timezone import now_utc
from utils.waze import KM_PER_MILE, get_drive_time, save_drive_time

logger.add(
    "logs/office-drive-times.log",
    format=json_log_format,
    rotation="50 MB",
    filter=lambda r: r["name"] == "office_drive_times",
)
load_dotenv()

# A successful drive time is reused for this long before being recomputed.
# Addresses and roads rarely change, so this just needs to be short enough
# that the "closest office" ranking stays accurate.
STALE_AFTER_DAYS = 21

# A failed lookup (bad coordinates, Waze error) is retried this much sooner
# than a successful one, so a transient failure doesn't sit stale for weeks.
FAILURE_RETRY_AFTER_DAYS = 1

# Caps how many client-office pairs one run processes. Small and frequent
# (see the cron schedule in the Dockerfile) beats big and rare: a bounded
# per-run trickle spread across the whole day is much gentler on Waze's
# unofficial, unrate-limited endpoint than a single nightly burst sized to
# clear the whole backlog, even at the same daily total.
MAX_PAIRS_PER_RUN = 40

# Waze has no published rate limit for this unofficial endpoint, so this
# keeps concurrent requests low and staggers them rather than trusting the
# server to queue politely.
CONCURRENCY = 2
REQUEST_STAGGER_SECONDS = 1.0


_STALE_WHERE = f"""
    FROM {TABLE_CLIENT} c
    CROSS JOIN {TABLE_OFFICE} o
    LEFT JOIN {TABLE_OFFICE_DRIVE_TIME} dt
      ON dt.clientId = c.id AND dt.officeKey = o.`key`
    WHERE c.status = 1
      AND c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
      AND (
        dt.computedAt IS NULL
        OR (dt.durationMinutes IS NULL AND dt.computedAt < %s)
        OR (dt.durationMinutes IS NOT NULL AND dt.computedAt < %s)
      )
"""


def _stale_cutoffs() -> tuple:
    return (
        now_utc() - timedelta(days=FAILURE_RETRY_AFTER_DAYS),
        now_utc() - timedelta(days=STALE_AFTER_DAYS),
    )


def get_stale_pairs(conn) -> list[dict]:
    """Client-office pairs due for a drive-time refresh, oldest/missing first."""
    sql = f"""
        SELECT
          c.id AS clientId,
          c.latitude AS clientLatitude,
          c.longitude AS clientLongitude,
          o.`key` AS officeKey,
          o.latitude AS officeLatitude,
          o.longitude AS officeLongitude
        {_STALE_WHERE}
        ORDER BY dt.computedAt IS NOT NULL, dt.computedAt
        LIMIT %s
    """
    with conn.cursor() as cursor:
        cursor.execute(sql, (*_stale_cutoffs(), MAX_PAIRS_PER_RUN))
        return cursor.fetchall()


def count_stale_pairs(conn) -> int:
    """Total client-office pairs currently due for a refresh, for backlog visibility."""
    sql = f"SELECT COUNT(*) AS n {_STALE_WHERE}"
    with conn.cursor() as cursor:
        cursor.execute(sql, _stale_cutoffs())
        row = cursor.fetchone()
        return row["n"] if row else 0


async def resolve_pair(
    semaphore: asyncio.Semaphore, pair: dict
) -> tuple[dict, float | None, float | None]:
    """Looks up one client-office drive time via Waze, throttled by `semaphore`."""
    start = f"{pair['clientLatitude']}, {pair['clientLongitude']}"
    end = f"{pair['officeLatitude']}, {pair['officeLongitude']}"
    async with semaphore:
        try:
            route = await get_drive_time(start, end)
            duration_minutes = round(route.duration, 1)
            distance_miles = round(route.distance / KM_PER_MILE, 1)
        except Exception as e:
            logger.warning(
                f"Waze route failed for client {pair['clientId']} -> "
                f"office {pair['officeKey']}: {e}"
            )
            duration_minutes = None
            distance_miles = None
        await asyncio.sleep(REQUEST_STAGGER_SECONDS)
        return pair, duration_minutes, distance_miles


async def refresh_drive_times() -> None:
    conn = get_db()
    try:
        pairs = get_stale_pairs(conn)
        if not pairs:
            logger.info("No client-office drive times due for refresh")
            return

        logger.info(f"Refreshing {len(pairs)} client-office drive time(s)")
        semaphore = asyncio.Semaphore(CONCURRENCY)
        results = await asyncio.gather(
            *[resolve_pair(semaphore, pair) for pair in pairs]
        )

        for pair, duration_minutes, distance_miles in results:
            save_drive_time(
                conn,
                pair["clientId"],
                pair["officeKey"],
                duration_minutes,
                distance_miles,
            )

        succeeded = sum(1 for _, duration_minutes, _ in results if duration_minutes)
        remaining = count_stale_pairs(conn)
        logger.info(
            f"Refreshed {succeeded}/{len(pairs)} client-office drive time(s), "
            f"{remaining} still due for refresh"
        )
    finally:
        conn.close()


def main():
    try:
        asyncio.run(refresh_drive_times())
    except Exception as e:
        logger.exception(f"Failed to refresh office drive times: {e}")


if __name__ == "__main__":
    main()
