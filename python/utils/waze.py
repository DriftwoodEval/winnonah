"""Shared helper for querying and persisting live by-car drive time via Waze.

Used both for the on-demand drive-times lookup in api.py (which doubles as a
manual per-client refresh) and for the office_drive_times.py batch job that
backfills emr_office_drive_time in the background.
"""

from pywaze import route_calculator

from utils.constants import TABLE_OFFICE_DRIVE_TIME
from utils.timezone import now_utc

KM_PER_MILE = 1.60934

# Waze's route endpoint is unofficial and has no published rate limit, so both
# callers cap concurrent requests and stagger them rather than trusting the
# server to queue politely.
WAZE_MAX_CONCURRENCY = 2
WAZE_REQUEST_STAGGER_SECONDS = 1.0


async def get_drive_time(start: str, end: str) -> route_calculator.CalcRoutesResponse:
    """Returns the fastest by-car route between two "lat, lon" points, via Waze."""
    async with route_calculator.WazeRouteCalculator(region="US") as waze:
        routes = await waze.calc_routes(start, end)
        return routes[0]


def get_cached_drive_times(conn, client_id: int) -> dict[str, dict]:
    """Every stored client-office drive time for one client, keyed by officeKey."""
    sql = f"""
        SELECT officeKey, durationMinutes, distanceMiles, computedAt
        FROM {TABLE_OFFICE_DRIVE_TIME}
        WHERE clientId = %s
    """
    with conn.cursor() as cursor:
        cursor.execute(sql, (client_id,))
        return {row["officeKey"]: row for row in cursor.fetchall()}


def save_drive_time(
    conn,
    client_id: int,
    office_key: str,
    duration_minutes: float | None,
    distance_miles: float | None,
) -> None:
    """Upserts a client-office drive time, including a failed (null) lookup."""
    sql = f"""
        INSERT INTO {TABLE_OFFICE_DRIVE_TIME}
          (clientId, officeKey, durationMinutes, distanceMiles, computedAt)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
          durationMinutes = VALUES(durationMinutes),
          distanceMiles = VALUES(distanceMiles),
          computedAt = VALUES(computedAt)
    """
    with conn.cursor() as cursor:
        cursor.execute(
            sql, (client_id, office_key, duration_minutes, distance_miles, now_utc())
        )
    conn.commit()
