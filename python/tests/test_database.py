import asyncio
import datetime as dt
import json
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from utils.database import (
    _build_reactivation_note_block,
    _get_date_cache,
    _humanize_month_gap,
    _reactivation_review_note_text,
    _set_date_cache,
    filter_clients_with_changed_address,
    get_python_config,
    get_services_config,
    get_sync_report_date,
    insert_by_matching_criteria_incremental,
    provide_connection,
    set_referral_fax_date,
)


class FakeCursor:
    def __init__(self, fetchone_result=None, fetchall_result=None):
        self.fetchone_result = fetchone_result
        self.fetchall_result = fetchall_result or []
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, query, params=None):
        self.executed.append((" ".join(query.split()), params))

    def fetchone(self):
        return self.fetchone_result

    def fetchall(self):
        return self.fetchall_result


class FakeConnection:
    def __init__(self, cursor=None):
        self._cursor = cursor or FakeCursor()
        self.closed = False
        self.commits = 0

    def cursor(self):
        return self._cursor

    def commit(self):
        self.commits += 1

    def close(self):
        self.closed = True


class TestProvideConnection:
    def test_opens_new_connection_when_none_provided(self):
        conn = FakeConnection()

        @provide_connection
        def do_work(x, connection=None):
            return (x, connection)

        with patch("utils.database.get_db", return_value=conn):
            result = do_work(1)

        assert result == (1, conn)
        assert conn.closed

    def test_uses_provided_keyword_connection_without_opening_new_one(self):
        provided_conn = FakeConnection()

        @provide_connection
        def do_work(x, connection=None):
            return (x, connection)

        with patch("utils.database.get_db") as mock_get_db:
            result = do_work(1, connection=provided_conn)

        mock_get_db.assert_not_called()
        assert result == (1, provided_conn)
        assert not provided_conn.closed

    def test_uses_provided_positional_connection_without_opening_new_one(self):
        provided_conn = FakeConnection()

        @provide_connection
        def do_work(x, connection=None):
            return (x, connection)

        with patch("utils.database.get_db") as mock_get_db:
            result = do_work(1, provided_conn)

        mock_get_db.assert_not_called()
        assert result == (1, provided_conn)

    def test_closes_opened_connection_even_if_function_raises(self):
        conn = FakeConnection()

        @provide_connection
        def do_work(connection=None):  # noqa: ARG001
            raise ValueError("boom")

        with (
            patch("utils.database.get_db", return_value=conn),
            pytest.raises(ValueError, match="boom"),
        ):
            do_work()

        assert conn.closed

    def test_async_function_opens_new_connection_when_none_provided(self):
        conn = FakeConnection()

        @provide_connection
        async def do_work(x, connection=None):
            return (x, connection)

        with patch("utils.database.get_db", return_value=conn):
            result = asyncio.run(do_work(1))

        assert result == (1, conn)
        assert conn.closed

    def test_async_function_uses_provided_connection(self):
        provided_conn = FakeConnection()

        @provide_connection
        async def do_work(x, connection=None):
            return (x, connection)

        with patch("utils.database.get_db") as mock_get_db:
            result = asyncio.run(do_work(1, connection=provided_conn))

        mock_get_db.assert_not_called()
        assert result == (1, provided_conn)


class TestGetPythonConfig:
    def test_returns_parsed_json_string_data(self):
        cursor = FakeCursor(fetchone_result={"data": json.dumps({"foo": "bar"})})
        conn = FakeConnection(cursor)
        with patch("utils.database.get_db", return_value=conn):
            assert get_python_config(config_id=2) == {"foo": "bar"}

    def test_returns_dict_data_as_is(self):
        cursor = FakeCursor(fetchone_result={"data": {"foo": "bar"}})
        conn = FakeConnection(cursor)
        with patch("utils.database.get_db", return_value=conn):
            assert get_python_config(config_id=2) == {"foo": "bar"}

    def test_raises_when_no_row_found(self):
        cursor = FakeCursor(fetchone_result=None)
        conn = FakeConnection(cursor)
        with (
            patch("utils.database.get_db", return_value=conn),
            pytest.raises(RuntimeError, match="No python config found"),
        ):
            get_python_config(config_id=2)

    def test_raises_when_data_field_is_empty(self):
        cursor = FakeCursor(fetchone_result={"data": None})
        conn = FakeConnection(cursor)
        with (
            patch("utils.database.get_db", return_value=conn),
            pytest.raises(RuntimeError, match="No python config found"),
        ):
            get_python_config(config_id=2)

    def test_wraps_db_errors_in_runtime_error(self):
        cursor = MagicMock()
        cursor.__enter__.side_effect = Exception("db exploded")
        conn = MagicMock()
        conn.cursor.return_value = cursor
        conn.__enter__.return_value = conn
        with (
            patch("utils.database.get_db", return_value=conn),
            pytest.raises(RuntimeError, match="Error fetching python config"),
        ):
            get_python_config(config_id=2)


class TestGetServicesConfig:
    def test_returns_services_key_from_config(self):
        cursor = FakeCursor(
            fetchone_result={"data": json.dumps({"services": {"foo": "bar"}})}
        )
        conn = FakeConnection(cursor)
        with patch("utils.database.get_db", return_value=conn):
            assert get_services_config() == {"foo": "bar"}

    def test_returns_empty_dict_when_no_services_key(self):
        cursor = FakeCursor(fetchone_result={"data": json.dumps({})})
        conn = FakeConnection(cursor)
        with patch("utils.database.get_db", return_value=conn):
            assert get_services_config() == {}


class TestDateCache:
    def test_get_date_cache_parses_stored_date(self):
        cursor = FakeCursor(
            fetchone_result={"data": json.dumps({"date": "2026-03-05"})}
        )
        conn = FakeConnection(cursor)
        with patch("utils.database.get_db", return_value=conn):
            result = _get_date_cache(3)
        assert result is not None
        assert result.isoformat() == "2026-03-05"

    def test_get_date_cache_returns_none_when_no_date_key(self):
        cursor = FakeCursor(fetchone_result={"data": json.dumps({})})
        conn = FakeConnection(cursor)
        with patch("utils.database.get_db", return_value=conn):
            assert _get_date_cache(3) is None

    def test_get_date_cache_returns_none_for_unparseable_date(self):
        cursor = FakeCursor(
            fetchone_result={"data": json.dumps({"date": "not-a-date"})}
        )
        conn = FakeConnection(cursor)
        with patch("utils.database.get_db", return_value=conn):
            assert _get_date_cache(3) is None

    def test_set_date_cache_writes_isoformat_date(self):
        cursor = FakeCursor()
        conn = FakeConnection(cursor)
        with patch("utils.database.get_db", return_value=conn):
            _set_date_cache(3, dt.date(2026, 3, 5))
        assert cursor.executed
        _query, params = cursor.executed[0]
        assert params[0] == 3
        assert json.loads(params[1]) == {"date": "2026-03-05"}
        assert conn.commits == 1

    def test_set_date_cache_swallows_db_errors(self):
        conn = MagicMock()
        conn.cursor.side_effect = Exception("db exploded")
        conn.__enter__.return_value = conn
        with patch("utils.database.get_db", return_value=conn):
            _set_date_cache(3, dt.date(2026, 3, 5))  # should not raise

    def test_get_sync_report_date_uses_correct_config_id(self):
        cursor = FakeCursor(
            fetchone_result={"data": json.dumps({"date": "2026-01-01"})}
        )
        conn = FakeConnection(cursor)
        with patch("utils.database.get_db", return_value=conn):
            get_sync_report_date()
        _query, params = cursor.executed[0]
        assert params == (4,)

    def test_set_referral_fax_date_uses_correct_config_id(self):
        cursor = FakeCursor()
        conn = FakeConnection(cursor)
        with patch("utils.database.get_db", return_value=conn):
            set_referral_fax_date(dt.date(2026, 1, 1))
        _query, params = cursor.executed[0]
        assert params[0] == 3


class TestBuildReactivationNoteBlock:
    def test_includes_reactivation_date_in_heading_text(self):
        blocks = _build_reactivation_note_block("03/05/2026")
        heading_text = blocks[0]["content"][0]["text"]
        assert "03/05/2026" in heading_text

    def test_returns_heading_rule_and_paragraph(self):
        blocks = _build_reactivation_note_block("03/05/2026")
        assert [b["type"] for b in blocks] == ["heading", "horizontalRule", "paragraph"]


class TestHumanizeMonthGap:
    def test_years_and_months(self):
        assert (
            _humanize_month_gap(dt.datetime(2024, 1, 10), dt.datetime(2025, 4, 10))
            == "1 year, 3 months"
        )

    def test_months_only(self):
        assert (
            _humanize_month_gap(dt.datetime(2025, 1, 1), dt.datetime(2025, 4, 1))
            == "3 months"
        )

    def test_days_when_under_a_month(self):
        assert (
            _humanize_month_gap(dt.datetime(2025, 1, 1), dt.datetime(2025, 1, 6))
            == "5 days"
        )


class TestReactivationReviewNoteText:
    def test_includes_both_dates_and_distance(self):
        text = _reactivation_review_note_text("2026-08-28", "2026-02-28", "6 months")
        assert "Reactivated on 2026-08-28" in text
        assert "deactivated on 2026-02-28" in text
        assert "(6 months apart)" in text

    def test_unknown_deactivation_date(self):
        text = _reactivation_review_note_text("2026-08-28", None, None)
        assert "deactivation date unknown" in text


class TestFilterClientsWithChangedAddress:
    def test_filters_out_clients_with_no_address(self):
        clients = pd.DataFrame(
            {"CLIENT_ID": ["1", "2"], "ADDRESS": ["123 Main St", None]}
        )
        cursor = FakeCursor(fetchall_result=[])
        conn = FakeConnection(cursor)
        result = filter_clients_with_changed_address(clients, conn)
        assert list(result["CLIENT_ID"]) == ["1"]

    def test_filters_out_clients_with_blank_address(self):
        clients = pd.DataFrame(
            {"CLIENT_ID": ["1", "2"], "ADDRESS": ["123 Main St", "  "]}
        )
        cursor = FakeCursor(fetchall_result=[])
        conn = FakeConnection(cursor)
        result = filter_clients_with_changed_address(clients, conn)
        assert list(result["CLIENT_ID"]) == ["1"]

    def test_returns_empty_when_no_clients_have_addresses(self):
        clients = pd.DataFrame({"CLIENT_ID": ["1"], "ADDRESS": [None]})
        cursor = FakeCursor(fetchall_result=[])
        conn = FakeConnection(cursor)
        result = filter_clients_with_changed_address(clients, conn)
        assert result.empty

    def test_all_clients_kept_when_no_existing_db_records(self):
        clients = pd.DataFrame({"CLIENT_ID": ["1"], "ADDRESS": ["123 Main St"]})
        cursor = FakeCursor(fetchall_result=[])
        conn = FakeConnection(cursor)
        result = filter_clients_with_changed_address(clients, conn)
        assert list(result["CLIENT_ID"]) == ["1"]

    def test_keeps_only_clients_with_changed_address(self):
        clients = pd.DataFrame(
            {
                "CLIENT_ID": ["1", "2"],
                "ADDRESS": ["123 Main St", "456 Oak Ave"],
            }
        )
        cursor = FakeCursor(
            fetchall_result=[
                {"id": "1", "address": "123 Main St"},
                {"id": "2", "address": "999 Old Rd"},
            ]
        )
        conn = FakeConnection(cursor)
        result = filter_clients_with_changed_address(clients, conn)
        assert list(result["CLIENT_ID"]) == ["2"]

    def test_address_comparison_is_case_and_whitespace_insensitive(self):
        clients = pd.DataFrame({"CLIENT_ID": ["1"], "ADDRESS": [" 123 MAIN ST "]})
        cursor = FakeCursor(fetchall_result=[{"id": "1", "address": "123 main st"}])
        conn = FakeConnection(cursor)
        result = filter_clients_with_changed_address(clients, conn)
        assert result.empty


class TestIncrementalMatchingRestrictToNpis:
    """insert_by_matching_criteria_incremental with restrict_to_npis (single-evaluator rematch)."""

    def _run(self, restrict):
        clients = pd.DataFrame({"CLIENT_ID": ["c1"]})
        # Client currently linked to A and B; matching now says only A is eligible.
        existing = {"c1": {"A", "B"}}
        deletes: list[tuple] = []
        inserts: list[tuple] = []

        with (
            patch(
                "utils.database._get_existing_client_eval_links", return_value=existing
            ),
            patch("utils.database.get_insurance_mappings", return_value={}),
            patch(
                "utils.relationships.match_by_school_district",
                return_value=["A", "C"],
            ),
            patch("utils.relationships.match_by_insurance", return_value=["A", "C"]),
            patch(
                "utils.database._delete_client_eval_links",
                side_effect=lambda cid, npis, **_: deletes.append((cid, set(npis))),
            ),
            patch(
                "utils.database._insert_client_eval_links",
                side_effect=lambda cid, npis, **_: inserts.append((cid, set(npis))),
            ),
        ):
            insert_by_matching_criteria_incremental(
                clients, {}, connection=MagicMock(), restrict_to_npis=restrict
            )
        return deletes, inserts

    def test_restricted_rematch_touches_only_target_evaluator(self):
        deletes, inserts = self._run(restrict={"C"})
        # B is no longer eligible but is not the target, so it stays.
        assert deletes == []
        # C is newly eligible and is the target, so it is added.
        assert inserts == [("c1", {"C"})]

    def test_unrestricted_run_reconciles_everything(self):
        deletes, inserts = self._run(restrict=None)
        assert deletes == [("c1", {"B"})]
        assert inserts == [("c1", {"C"})]
