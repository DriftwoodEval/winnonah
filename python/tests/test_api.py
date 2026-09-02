import asyncio
import json
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from pywaze.route_calculator import CalcRoutesResponse

from api import (
    _apply_confirmed_marker,
    _find_duplicates,
    col_num_to_letter,
    find_drive_folder,
    get_current_user,
    get_user_folder,
    get_writer_id,
    office_drive_times,
)


class TestColNumToLetter:
    @pytest.mark.parametrize(
        ("col_num", "expected"),
        [
            (0, "A"),
            (1, "B"),
            (25, "Z"),
            (26, "AA"),
            (27, "AB"),
            (51, "AZ"),
            (52, "BA"),
            (701, "ZZ"),
            (702, "AAA"),
        ],
    )
    def test_converts_zero_based_index_to_column_letter(self, col_num, expected):
        assert col_num_to_letter(col_num) == expected


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

    def close(self):
        self.closed = True

    def commit(self):
        self.commits += 1


def _mock_request(cookies: dict):
    request = MagicMock()
    request.cookies = cookies
    return request


class TestApplyConfirmedMarker:
    def test_adds_marker_when_confirming(self):
        assert _apply_confirmed_marker("Jane Doe DA", True) == "Jane Doe DA [CONFIRMED]"

    def test_removes_marker_when_unconfirming(self):
        assert (
            _apply_confirmed_marker("Jane Doe DA [CONFIRMED]", False) == "Jane Doe DA"
        )

    def test_no_change_when_already_confirmed(self):
        assert _apply_confirmed_marker("Jane Doe DA [CONFIRMED]", True) is None

    def test_no_change_when_already_unconfirmed(self):
        assert _apply_confirmed_marker("Jane Doe DA", False) is None

    def test_removes_marker_with_no_leading_space(self):
        assert _apply_confirmed_marker("[CONFIRMED]", False) == ""


class TestGetCurrentUser:
    def test_raises_401_when_no_session_cookie(self):
        request = _mock_request({})
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(request)
        assert exc_info.value.status_code == 401

    def test_checks_each_known_cookie_name_in_order(self):
        request = _mock_request({"next-auth.session-token": "tok"})
        row = {
            "id": "u1",
            "email": "a@example.com",
            "name": "Alice",
            "permissions": None,
            "archived": 0,
            "roleId": None,
            "role_permissions": None,
            "expires": datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
        }
        conn = FakeConnection(FakeCursor(fetchone_result=row))
        with patch("api.get_db", return_value=conn):
            user = get_current_user(request)
        assert user["email"] == "a@example.com"

    def test_raises_401_for_unknown_session_token(self):
        request = _mock_request({"authjs.session-token": "tok"})
        conn = FakeConnection(FakeCursor(fetchone_result=None))
        with (
            patch("api.get_db", return_value=conn),
            pytest.raises(HTTPException) as exc_info,
        ):
            get_current_user(request)
        assert exc_info.value.status_code == 401

    def test_raises_401_for_expired_session(self):
        request = _mock_request({"authjs.session-token": "tok"})
        row = {
            "id": "u1",
            "email": "a@example.com",
            "name": "Alice",
            "permissions": None,
            "archived": 0,
            "roleId": None,
            "role_permissions": None,
            "expires": datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1),
        }
        conn = FakeConnection(FakeCursor(fetchone_result=row))
        with (
            patch("api.get_db", return_value=conn),
            pytest.raises(HTTPException) as exc_info,
        ):
            get_current_user(request)
        assert exc_info.value.status_code == 401

    def test_raises_403_for_archived_account(self):
        request = _mock_request({"authjs.session-token": "tok"})
        row = {
            "id": "u1",
            "email": "a@example.com",
            "name": "Alice",
            "permissions": None,
            "archived": 1,
            "roleId": None,
            "role_permissions": None,
            "expires": datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
        }
        conn = FakeConnection(FakeCursor(fetchone_result=row))
        with (
            patch("api.get_db", return_value=conn),
            pytest.raises(HTTPException) as exc_info,
        ):
            get_current_user(request)
        assert exc_info.value.status_code == 403

    def test_merges_role_permissions_under_user_overrides(self):
        request = _mock_request({"authjs.session-token": "tok"})
        row = {
            "id": "u1",
            "email": "a@example.com",
            "name": "Alice",
            "permissions": json.dumps({"reports:notifications": True}),
            "archived": 0,
            "roleId": 5,
            "role_permissions": json.dumps(
                {"reports:notifications": False, "clients:view": True}
            ),
            "expires": datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
        }
        conn = FakeConnection(FakeCursor(fetchone_result=row))
        with patch("api.get_db", return_value=conn):
            user = get_current_user(request)
        assert user["permissions"] == {
            "reports:notifications": True,
            "clients:view": True,
        }

    def test_closes_connection_after_lookup(self):
        request = _mock_request({"authjs.session-token": "tok"})
        row = {
            "id": "u1",
            "email": "a@example.com",
            "name": "Alice",
            "permissions": None,
            "archived": 0,
            "roleId": None,
            "role_permissions": None,
            "expires": datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
        }
        conn = FakeConnection(FakeCursor(fetchone_result=row))
        with patch("api.get_db", return_value=conn):
            get_current_user(request)
        assert conn.closed

    def test_closes_connection_even_when_session_invalid(self):
        request = _mock_request({"authjs.session-token": "tok"})
        conn = FakeConnection(FakeCursor(fetchone_result=None))
        with (
            patch("api.get_db", return_value=conn),
            pytest.raises(HTTPException),
        ):
            get_current_user(request)
        assert conn.closed


class TestGetWriterId:
    def test_maps_full_name_to_initials(self):
        config = {"config": {"piecework": {"name_map": {"AB": "Alice Baker"}}}}
        with patch("api.get_python_config", return_value=config):
            assert get_writer_id("Alice Baker") == "AB"

    def test_match_is_case_and_whitespace_insensitive(self):
        config = {"config": {"piecework": {"name_map": {"AB": "Alice Baker"}}}}
        with patch("api.get_python_config", return_value=config):
            assert get_writer_id("  ALICE baker  ") == "AB"

    def test_returns_original_name_when_no_match(self):
        config = {"config": {"piecework": {"name_map": {}}}}
        with patch("api.get_python_config", return_value=config):
            assert get_writer_id("Unknown Person") == "Unknown Person"

    def test_raises_500_when_config_missing(self):
        with (
            patch("api.get_python_config", return_value=None),
            pytest.raises(HTTPException) as exc_info,
        ):
            get_writer_id("Alice Baker")
        assert exc_info.value.status_code == 500


class TestFindDriveFolder:
    def test_returns_first_matching_folder(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [{"id": "f1", "name": "Folder One"}]
        }
        result = find_drive_folder(service, "query", "not found")
        assert result == {"id": "f1", "name": "Folder One"}

    def test_raises_404_when_no_results(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": []
        }
        with pytest.raises(HTTPException) as exc_info:
            find_drive_folder(service, "query", "custom not found message")
        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "custom not found message"


class TestGetUserFolder:
    def test_raises_400_when_user_name_missing(self):
        service = MagicMock()
        with pytest.raises(HTTPException) as exc_info:
            get_user_folder(service, "", "parent-1")
        assert exc_info.value.status_code == 400

    def test_escapes_single_quotes_in_query(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [{"id": "f1", "name": "O'Brien"}]
        }
        get_user_folder(service, "O'Brien", "parent-1")
        query = service.files.return_value.list.call_args.kwargs["q"]
        assert "O\\'Brien" in query

    def test_returns_matching_folder(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [{"id": "f1", "name": "Alice"}]
        }
        assert get_user_folder(service, "Alice", "parent-1") == {
            "id": "f1",
            "name": "Alice",
        }


class TestFindDuplicates:
    def test_returns_empty_list_when_no_bracketed_folders(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [{"id": "f1", "name": "No brackets here"}]
        }
        assert _find_duplicates(service) == []

    def test_returns_empty_list_when_only_one_folder_per_client(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [{"id": "f1", "name": "John Smith [123]"}]
        }
        assert _find_duplicates(service) == []

    def test_finds_duplicate_folders_for_same_client_id(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [
                {"id": "f1", "name": "John Smith [123]", "webViewLink": "url1"},
                {"id": "f2", "name": "John S [123]", "webViewLink": "url2"},
            ]
        }
        conn = FakeConnection(
            FakeCursor(
                fetchall_result=[
                    {
                        "id": 123,
                        "hash": "abc",
                        "fullName": "John Smith",
                        "driveId": "f1",
                    }
                ]
            )
        )
        with patch("api.get_db", return_value=conn):
            result = _find_duplicates(service)
        assert len(result) == 1
        assert result[0]["clientId"] == "123"
        assert result[0]["clientFullName"] == "John Smith"
        folder_matches = {f["id"]: f["isDbMatch"] for f in result[0]["folders"]}
        assert folder_matches == {"f1": True, "f2": False}

    def test_skips_client_without_matching_db_hash(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [
                {"id": "f1", "name": "John Smith [123]", "webViewLink": "url1"},
                {"id": "f2", "name": "John S [123]", "webViewLink": "url2"},
            ]
        }
        conn = FakeConnection(FakeCursor(fetchall_result=[]))
        with patch("api.get_db", return_value=conn):
            result = _find_duplicates(service)
        assert result == []

    def test_follows_pagination_across_pages(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.side_effect = [
            {
                "files": [{"id": "f1", "name": "John Smith [123]"}],
                "nextPageToken": "page2",
            },
            {"files": [{"id": "f2", "name": "John S [123]"}]},
        ]
        conn = FakeConnection(
            FakeCursor(
                fetchall_result=[
                    {
                        "id": 123,
                        "hash": "abc",
                        "fullName": "John Smith",
                        "driveId": "f1",
                    }
                ]
            )
        )
        with patch("api.get_db", return_value=conn):
            result = _find_duplicates(service)
        assert len(result) == 1
        assert len(result[0]["folders"]) == 2


class TestOfficeDriveTimes:
    def test_persists_results_and_sorts_fastest_first(self):
        client_row = {"latitude": "33.9", "longitude": "-81.0"}
        office_rows = [
            {
                "key": "columbia",
                "prettyName": "Columbia",
                "latitude": "34.0",
                "longitude": "-80.9",
            },
            {
                "key": "charleston",
                "prettyName": "Charleston",
                "latitude": "32.8",
                "longitude": "-79.9",
            },
        ]
        cursor = FakeCursor(fetchone_result=client_row, fetchall_result=office_rows)
        conn = FakeConnection(cursor)

        async def fake_get_drive_time(start, end):  # noqa: ARG001
            if "34.0" in end:
                return CalcRoutesResponse(
                    duration=10.0, distance=16.0934, name="", street_names=[]
                )
            return CalcRoutesResponse(
                duration=90.0, distance=160.934, name="", street_names=[]
            )

        with (
            patch("api.get_db", return_value=conn),
            patch("api.get_drive_time", side_effect=fake_get_drive_time),
        ):
            results = asyncio.run(office_drive_times(client_id=42, current_user={}))

        assert [r.key for r in results] == ["columbia", "charleston"]
        assert results[0].duration_minutes == 10.0
        assert results[0].distance_miles == 10.0

        insert_calls = [
            (query, params)
            for query, params in cursor.executed
            if query.startswith("INSERT INTO emr_office_drive_time")
        ]
        assert len(insert_calls) == 2
        assert {params[0] for _, params in insert_calls} == {42}
        assert {params[1] for _, params in insert_calls} == {"columbia", "charleston"}

    def test_raises_404_for_unknown_client(self):
        conn = FakeConnection(FakeCursor(fetchone_result=None, fetchall_result=[]))
        with (
            patch("api.get_db", return_value=conn),
            pytest.raises(HTTPException) as exc_info,
        ):
            asyncio.run(office_drive_times(client_id=999, current_user={}))
        assert exc_info.value.status_code == 404

    def test_raises_422_when_client_has_no_coordinates(self):
        conn = FakeConnection(
            FakeCursor(
                fetchone_result={"latitude": None, "longitude": None},
                fetchall_result=[],
            )
        )
        with (
            patch("api.get_db", return_value=conn),
            pytest.raises(HTTPException) as exc_info,
        ):
            asyncio.run(office_drive_times(client_id=42, current_user={}))
        assert exc_info.value.status_code == 422
