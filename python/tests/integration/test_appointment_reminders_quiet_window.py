"""Integration tests that hit the real local database.

Skipped by default; run explicitly with `mise run test:python:integration`
(or `uv run pytest --run-integration -m integration`).

is_within_quiet_window just fetches a settings row and delegates the actual
window math to adjust_for_quiet_window (see TestAdjustForQuietWindow in
test_appointment_reminders.py for that logic). These tests only cover the
DB round-trip and delegation, not the window math itself. This snapshots
whatever row is already in TABLE_APPOINTMENT_REMINDER_SETTINGS, overwrites
it with test values, and restores the original afterwards, so it's safe to
run against a shared local dev database.
"""

from datetime import datetime, timedelta

import pytest

from appointment_reminders import is_within_quiet_window
from utils.constants import TABLE_APPOINTMENT_REMINDER_SETTINGS
from utils.database import get_db

ALLOWED_DB_HOSTS = {"localhost", "127.0.0.1", "driftwood-db"}


def _assert_local_db():
    connection = get_db()
    try:
        host = connection.host
    finally:
        connection.close()
    assert host in ALLOWED_DB_HOSTS, (
        f"Refusing to run integration tests against non-local database host "
        f"{host!r}. Expected one of {ALLOWED_DB_HOSTS}."
    )


def _time_str(dt: datetime) -> str:
    return dt.strftime("%H:%M:%S")


@pytest.fixture
def quiet_window_settings():
    """Snapshots the existing settings row (if any) and restores it after
    the test, yielding a setter that overwrites the row for the duration."""
    _assert_local_db()

    connection = get_db()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT id, quietWindowStart, quietWindowEnd "
                f"FROM {TABLE_APPOINTMENT_REMINDER_SETTINGS} LIMIT 1"
            )
            original = cursor.fetchone()
    finally:
        connection.close()

    def _set(start: str, end: str):
        connection = get_db()
        try:
            with connection.cursor() as cursor:
                if original:
                    cursor.execute(
                        f"UPDATE {TABLE_APPOINTMENT_REMINDER_SETTINGS} "
                        "SET quietWindowStart = %s, quietWindowEnd = %s WHERE id = %s",
                        (start, end, original["id"]),
                    )
                else:
                    cursor.execute(
                        f"INSERT INTO {TABLE_APPOINTMENT_REMINDER_SETTINGS} "
                        "(quietWindowStart, quietWindowEnd) VALUES (%s, %s)",
                        (start, end),
                    )
            connection.commit()
        finally:
            connection.close()

    yield _set

    connection = get_db()
    try:
        with connection.cursor() as cursor:
            if original:
                cursor.execute(
                    f"UPDATE {TABLE_APPOINTMENT_REMINDER_SETTINGS} "
                    "SET quietWindowStart = %s, quietWindowEnd = %s WHERE id = %s",
                    (
                        original["quietWindowStart"],
                        original["quietWindowEnd"],
                        original["id"],
                    ),
                )
            else:
                cursor.execute(f"DELETE FROM {TABLE_APPOINTMENT_REMINDER_SETTINGS}")
        connection.commit()
    finally:
        connection.close()


@pytest.mark.integration
class TestIsWithinQuietWindow:
    def test_returns_false_when_no_settings_row(self, quiet_window_settings):  # noqa: ARG002
        # Only depended on for its snapshot/restore teardown; this test
        # deletes the row directly rather than using the fixture's setter.
        connection = get_db()
        try:
            with connection.cursor() as cursor:
                cursor.execute(f"DELETE FROM {TABLE_APPOINTMENT_REMINDER_SETTINGS}")
            connection.commit()
        finally:
            connection.close()

        assert is_within_quiet_window() is False

    def test_fetches_settings_and_delegates_the_window_check(
        self, quiet_window_settings
    ):
        # Not testing the window math (covered by TestAdjustForQuietWindow) -
        # just that a DB row makes it through to a real answer.
        now = datetime.now()
        quiet_window_settings(
            _time_str(now - timedelta(minutes=5)), _time_str(now + timedelta(minutes=5))
        )
        assert is_within_quiet_window() is True
