"""Integration tests that hit the real local database.

Skipped by default; run explicitly with `mise run test:python:integration`
(or `uv run pytest --run-integration -m integration`).

Uses "Testman Testson" (from utils.constants.TEST_NAMES), a name the rest of
the codebase already recognizes and excludes from production flows like
appointment reminders and insurance syncing, so it's safe to write real rows
for it without those rows leaking into anything client-facing.
"""

import pandas as pd
import pytest

from utils.constants import TABLE_CLIENT
from utils.database import get_db, put_clients_in_db

# Only ever run these against a local database, never whatever DATABASE_URL
# happens to point at (e.g. if someone's mid-way through `mise run sync-db`).
ALLOWED_DB_HOSTS = {"localhost", "127.0.0.1", "driftwood-db"}

TEST_CLIENT_ID = 999999901


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


@pytest.fixture(autouse=True)
def clean_test_client():
    """Ensures the fake test client row doesn't exist before or after the test."""
    _assert_local_db()

    def _delete():
        connection = get_db()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"DELETE FROM {TABLE_CLIENT} WHERE id = %s", (TEST_CLIENT_ID,)
                )
            connection.commit()
        finally:
            connection.close()

    _delete()
    yield
    _delete()


def _fetch_test_client() -> dict | None:
    connection = get_db()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT * FROM {TABLE_CLIENT} WHERE id = %s", (TEST_CLIENT_ID,)
            )
            return cursor.fetchone()
    finally:
        connection.close()


@pytest.mark.integration
class TestClientDatabaseRoundTrip:
    def test_put_clients_in_db_inserts_and_formats_fields(self):
        clients_df = pd.DataFrame(
            [
                {
                    "CLIENT_ID": TEST_CLIENT_ID,
                    "FIRSTNAME": "Testman",
                    "LASTNAME": "Testson",
                    "PREFERRED_NAME": None,
                    "ADDED_DATE": "2026-01-15",
                    "DOB": "01/02/2015",
                    "GENDER": "male",
                    "PHONE1": "18035551234",
                    "EMAIL": "testman@example.com",
                    "STATUS": "Active",
                    "ADDRESS": "123 Test St Columbia SC 29201",
                    "SCHOOL_DISTRICT": "Richland One",
                    "LATITUDE": 34.0,
                    "LONGITUDE": -81.0,
                    "ASD_ADHD": None,
                    "LANGUAGE": "English",
                    "FLAG": None,
                    "LOGIN_NAME": None,
                    "REFERRAL_SOURCE": None,
                }
            ]
        )

        put_clients_in_db(clients_df)
        row = _fetch_test_client()

        assert row is not None
        assert row["firstName"] == "Testman"
        assert row["lastName"] == "Testson"
        assert row["fullName"] == "Testman Testson"
        # format_gender title-cases the raw value.
        assert row["gender"] == "Male"
        # format_phone_number strips the leading country code.
        assert row["phoneNumber"] == "8035551234"
        assert str(row["dob"]) == "2015-01-02"
        assert bool(row["status"]) is True

    def test_put_clients_in_db_updates_on_conflict(self):
        base_row = {
            "CLIENT_ID": TEST_CLIENT_ID,
            "FIRSTNAME": "Testman",
            "LASTNAME": "Testson",
            "PREFERRED_NAME": None,
            "ADDED_DATE": "2026-01-15",
            "DOB": "01/02/2015",
            "GENDER": "male",
            "PHONE1": "8035551234",
            "EMAIL": "testman@example.com",
            "STATUS": "Active",
            "ADDRESS": None,
            "SCHOOL_DISTRICT": None,
            "LATITUDE": None,
            "LONGITUDE": None,
            "ASD_ADHD": None,
            "LANGUAGE": "English",
            "FLAG": None,
            "LOGIN_NAME": None,
            "REFERRAL_SOURCE": None,
        }
        put_clients_in_db(pd.DataFrame([base_row]))

        updated_row = {**base_row, "PHONE1": "8039998888", "STATUS": "Inactive"}
        put_clients_in_db(pd.DataFrame([updated_row]))

        row = _fetch_test_client()
        assert row is not None
        assert row["phoneNumber"] == "8039998888"
        assert bool(row["status"]) is False
