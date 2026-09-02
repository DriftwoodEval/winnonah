import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from pywaze.route_calculator import CalcRoutesResponse

from office_drive_times import (
    count_stale_pairs,
    get_stale_pairs,
    resolve_pair,
    save_drive_time,
)


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, query, params=None):
        normalized = " ".join(query.split())
        self.conn.executed.append((normalized, params))

    def fetchall(self):
        return self.conn.rows

    def fetchone(self):
        return {"n": self.conn.count}


class FakeConnection:
    def __init__(self, rows=None, count=0):
        self.rows = rows or []
        self.count = count
        self.executed = []
        self.commits = 0

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1


@pytest.mark.parametrize(
    ("waze_result", "waze_error", "expected_duration", "expected_distance"),
    [
        (
            CalcRoutesResponse(
                duration=42.4, distance=32.1868, name="", street_names=[]
            ),
            None,
            42.4,
            20.0,
        ),
        (None, Exception("Waze is down"), None, None),
    ],
)
def test_resolve_pair(waze_result, waze_error, expected_duration, expected_distance):
    pair = {
        "clientId": 1,
        "clientLatitude": "33.0",
        "clientLongitude": "-81.0",
        "officeKey": "columbia",
        "officeLatitude": "34.0",
        "officeLongitude": "-80.9",
    }
    mock_get_drive_time = AsyncMock(side_effect=waze_error, return_value=waze_result)

    async def run():
        with (
            patch("office_drive_times.get_drive_time", mock_get_drive_time),
            patch("office_drive_times.REQUEST_STAGGER_SECONDS", 0),
        ):
            return await resolve_pair(asyncio.Semaphore(1), pair)

    result_pair, duration_minutes, distance_miles = asyncio.run(run())

    assert result_pair == pair
    assert duration_minutes == expected_duration
    assert distance_miles == expected_distance
    mock_get_drive_time.assert_awaited_once_with("33.0, -81.0", "34.0, -80.9")


def test_save_drive_time_upserts():
    conn = FakeConnection()

    save_drive_time(
        conn,
        client_id=5,
        office_key="columbia",
        duration_minutes=30.0,
        distance_miles=18.5,
    )

    assert conn.commits == 1
    query, params = conn.executed[0]
    assert "INSERT INTO emr_office_drive_time" in query
    assert "ON DUPLICATE KEY UPDATE" in query
    assert params[0] == 5
    assert params[1] == "columbia"
    assert params[2] == 30.0
    assert params[3] == 18.5


def test_get_stale_pairs_queries_missing_and_stale_rows():
    conn = FakeConnection(rows=[{"clientId": 1, "officeKey": "columbia"}])

    rows = get_stale_pairs(conn)

    assert rows == conn.rows
    query, params = conn.executed[0]
    assert "CROSS JOIN emr_office" in query
    assert "LEFT JOIN emr_office_drive_time" in query
    assert "c.status = 1" in query
    # failure_cutoff, success_cutoff, limit: failures are retried sooner,
    # so failure_cutoff (1 day ago) is more recent than success_cutoff (21 days ago)
    assert len(params) == 3
    assert params[0] > params[1]


def test_count_stale_pairs_uses_same_filters():
    conn = FakeConnection(count=17)

    assert count_stale_pairs(conn) == 17
    query, params = conn.executed[0]
    assert "SELECT COUNT(*)" in query
    assert "CROSS JOIN emr_office" in query
    assert len(params) == 2
