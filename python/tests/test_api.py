import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException
from pywaze.route_calculator import CalcRoutesResponse

from api.app import (
    _apply_confirmed_marker,
    _find_duplicates,
    _session_cache,
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


def _mock_request(headers: dict):
    request = MagicMock()
    request.headers = headers
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


def _session_response(status_code=200, body=None):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = body
    return response


def _session_body(**user_overrides):
    user = {
        "id": "u1",
        "email": "a@example.com",
        "name": "Alice",
        "permissions": {"clients:view": True},
        "archived": False,
    }
    user.update(user_overrides)
    return {"user": user, "session": {"id": "s1"}}


class TestGetCurrentUser:
    @pytest.fixture(autouse=True)
    def app_url(self, monkeypatch):
        monkeypatch.setenv("EMR_APP_URL", "https://app.example.com/")
        _session_cache.clear()

    def test_raises_401_when_no_cookie(self):
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(_mock_request({}))
        assert exc_info.value.status_code == 401

    def test_uses_the_production_app_when_no_url_is_configured(self, monkeypatch):
        monkeypatch.delenv("EMR_APP_URL")
        with patch(
            "api.app.httpx.get", return_value=_session_response(200, _session_body())
        ) as get:
            get_current_user(_mock_request({"cookie": "a=b"}))
        assert get.call_args.args[0] == (
            "https://emr.driftwoodeval.com/api/auth/get-session"
        )

    def test_raises_503_when_the_app_returns_malformed_json(self):
        response = _session_response(200, None)
        response.json.side_effect = ValueError("not json")
        with (
            patch("api.app.httpx.get", return_value=response),
            pytest.raises(HTTPException) as exc_info,
        ):
            get_current_user(_mock_request({"cookie": "a=b"}))
        assert exc_info.value.status_code == 503

    def test_forwards_the_cookie_to_the_app_session_endpoint(self):
        request = _mock_request({"cookie": "better-auth.session_token=tok.sig"})
        with patch(
            "api.app.httpx.get", return_value=_session_response(200, _session_body())
        ) as get:
            get_current_user(request)
        assert get.call_args.args[0] == "https://app.example.com/api/auth/get-session"
        assert get.call_args.kwargs["headers"] == {
            "Cookie": "better-auth.session_token=tok.sig"
        }

    def test_returns_identity_and_permissions_from_the_session(self):
        request = _mock_request({"cookie": "a=b"})
        with patch(
            "api.app.httpx.get", return_value=_session_response(200, _session_body())
        ):
            user = get_current_user(request)
        assert user == {
            "user_id": "u1",
            "email": "a@example.com",
            "name": "Alice",
            "permissions": {"clients:view": True},
            "role_id": None,
        }

    @pytest.mark.parametrize(("status_code", "body"), [(200, None), (401, None)])
    def test_raises_401_when_the_app_has_no_session(self, status_code, body):
        request = _mock_request({"cookie": "a=b"})
        with (
            patch(
                "api.app.httpx.get",
                return_value=_session_response(status_code, body),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            get_current_user(request)
        assert exc_info.value.status_code == 401

    @pytest.mark.parametrize("status_code", [403, 404, 429, 502])
    def test_raises_503_when_the_app_cannot_answer(self, status_code):
        """A rate limit or an unexpected answer says nothing about the session."""
        request = _mock_request({"cookie": "a=b"})
        with (
            patch(
                "api.app.httpx.get",
                return_value=_session_response(status_code, None),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            get_current_user(request)
        assert exc_info.value.status_code == 503

    def test_reuses_a_recent_lookup_for_the_same_cookie(self):
        with patch(
            "api.app.httpx.get", return_value=_session_response(200, _session_body())
        ) as get:
            first = get_current_user(_mock_request({"cookie": "a=b"}))
            second = get_current_user(_mock_request({"cookie": "a=b"}))
        assert first == second
        assert get.call_count == 1

    def test_does_not_share_a_lookup_between_cookies(self):
        with patch(
            "api.app.httpx.get", return_value=_session_response(200, _session_body())
        ) as get:
            get_current_user(_mock_request({"cookie": "a=b"}))
            get_current_user(_mock_request({"cookie": "a=c"}))
        assert get.call_count == 2

    def test_does_not_cache_a_failed_lookup(self):
        request = _mock_request({"cookie": "a=b"})
        with (
            patch("api.app.httpx.get", return_value=_session_response(401, None)),
            pytest.raises(HTTPException),
        ):
            get_current_user(request)
        with patch(
            "api.app.httpx.get", return_value=_session_response(200, _session_body())
        ):
            assert get_current_user(request)["user_id"] == "u1"

    def test_uses_the_production_app_when_the_url_is_blank(self, monkeypatch):
        monkeypatch.setenv("EMR_APP_URL", "")
        with patch(
            "api.app.httpx.get", return_value=_session_response(200, _session_body())
        ) as get:
            get_current_user(_mock_request({"cookie": "a=b"}))
        assert get.call_args.args[0] == (
            "https://emr.driftwoodeval.com/api/auth/get-session"
        )

    def test_raises_403_for_archived_account(self):
        request = _mock_request({"cookie": "a=b"})
        with (
            patch(
                "api.app.httpx.get",
                return_value=_session_response(200, _session_body(archived=True)),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            get_current_user(request)
        assert exc_info.value.status_code == 403

    def test_raises_503_when_the_app_errors(self):
        request = _mock_request({"cookie": "a=b"})
        with (
            patch("api.app.httpx.get", return_value=_session_response(502, None)),
            pytest.raises(HTTPException) as exc_info,
        ):
            get_current_user(request)
        assert exc_info.value.status_code == 503

    def test_raises_503_when_the_app_is_unreachable(self):
        request = _mock_request({"cookie": "a=b"})
        with (
            patch("api.app.httpx.get", side_effect=httpx.ConnectError("down")),
            pytest.raises(HTTPException) as exc_info,
        ):
            get_current_user(request)
        assert exc_info.value.status_code == 503


class TestGetWriterId:
    def test_maps_full_name_to_initials(self):
        config = {"config": {"piecework": {"name_map": {"AB": "Alice Baker"}}}}
        with patch("api.app.get_python_config", return_value=config):
            assert get_writer_id("Alice Baker") == "AB"

    def test_match_is_case_and_whitespace_insensitive(self):
        config = {"config": {"piecework": {"name_map": {"AB": "Alice Baker"}}}}
        with patch("api.app.get_python_config", return_value=config):
            assert get_writer_id("  ALICE baker  ") == "AB"

    def test_returns_original_name_when_no_match(self):
        config = {"config": {"piecework": {"name_map": {}}}}
        with patch("api.app.get_python_config", return_value=config):
            assert get_writer_id("Unknown Person") == "Unknown Person"

    def test_raises_500_when_config_missing(self):
        with (
            patch("api.app.get_python_config", return_value=None),
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
        with patch("api.app.get_db", return_value=conn):
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
        with patch("api.app.get_db", return_value=conn):
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
        with patch("api.app.get_db", return_value=conn):
            result = _find_duplicates(service)
        assert len(result) == 1
        assert len(result[0]["folders"]) == 2


class RoutingCursor:
    """Cursor whose fetch results depend on which query was last executed:
    the client lookup, the office list, or the cached-drive-times lookup."""

    def __init__(self, client_row, office_rows, cached_rows=None):
        self.client_row = client_row
        self.office_rows = office_rows
        self.cached_rows = cached_rows or []
        self.executed = []
        self._last = ""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, query, params=None):
        self._last = " ".join(query.split())
        self.executed.append((self._last, params))

    def fetchone(self):
        return self.client_row

    def fetchall(self):
        if self._last.startswith("SELECT officeKey"):
            return self.cached_rows
        if "prettyName" in self._last:
            return self.office_rows
        return []


_OFFICE_ROWS = [
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


async def _fake_get_drive_time(start, end):  # noqa: ARG001
    if "34.0" in end:
        return CalcRoutesResponse(
            duration=10.0, distance=16.0934, name="", street_names=[]
        )
    return CalcRoutesResponse(duration=90.0, distance=160.934, name="", street_names=[])


class TestOfficeDriveTimes:
    def test_persists_results_and_sorts_fastest_first(self):
        cursor = RoutingCursor({"latitude": "33.9", "longitude": "-81.0"}, _OFFICE_ROWS)
        conn = FakeConnection(cursor)

        with (
            patch("api.app.get_db", return_value=conn),
            patch("api.app.get_drive_time", side_effect=_fake_get_drive_time),
            patch("api.app.WAZE_REQUEST_STAGGER_SECONDS", 0),
        ):
            results = asyncio.run(office_drive_times(client_id=42, current_user={}))

        assert [r.key for r in results] == ["columbia", "charleston"]
        assert results[0].duration_minutes == 10.0
        assert results[0].distance_miles == 10.0

        insert_calls = [
            params
            for query, params in cursor.executed
            if query.startswith("INSERT INTO emr_office_drive_time")
        ]
        assert len(insert_calls) == 2
        assert {params[0] for params in insert_calls} == {42}
        assert {params[1] for params in insert_calls} == {"columbia", "charleston"}

    def test_serves_fresh_cache_without_calling_waze(self):
        recent = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=1)
        cached_rows = [
            {
                "officeKey": "columbia",
                "durationMinutes": 12.0,
                "distanceMiles": 7.0,
                "computedAt": recent,
            },
            {
                "officeKey": "charleston",
                "durationMinutes": 88.0,
                "distanceMiles": 95.0,
                "computedAt": recent,
            },
        ]
        cursor = RoutingCursor(
            {"latitude": "33.9", "longitude": "-81.0"}, _OFFICE_ROWS, cached_rows
        )
        conn = FakeConnection(cursor)
        waze = MagicMock()

        with (
            patch("api.app.get_db", return_value=conn),
            patch("api.app.get_drive_time", waze),
        ):
            results = asyncio.run(office_drive_times(client_id=42, current_user={}))

        waze.assert_not_called()
        assert [r.key for r in results] == ["columbia", "charleston"]
        assert results[0].duration_minutes == 12.0
        assert not any(
            query.startswith("INSERT INTO emr_office_drive_time")
            for query, _ in cursor.executed
        )

    def test_refetches_stale_cache(self):
        stale = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1)
        cached_rows = [
            {
                "officeKey": "columbia",
                "durationMinutes": 99.0,
                "distanceMiles": 99.0,
                "computedAt": stale,
            },
        ]
        cursor = RoutingCursor(
            {"latitude": "33.9", "longitude": "-81.0"}, _OFFICE_ROWS, cached_rows
        )
        conn = FakeConnection(cursor)

        with (
            patch("api.app.get_db", return_value=conn),
            patch("api.app.get_drive_time", side_effect=_fake_get_drive_time),
            patch("api.app.WAZE_REQUEST_STAGGER_SECONDS", 0),
        ):
            results = asyncio.run(office_drive_times(client_id=42, current_user={}))

        assert results[0].duration_minutes == 10.0
        insert_keys = {
            params[1]
            for query, params in cursor.executed
            if query.startswith("INSERT INTO emr_office_drive_time")
        }
        assert insert_keys == {"columbia", "charleston"}

    def test_falls_back_to_straight_line_distance_when_waze_fails(self):
        cursor = RoutingCursor({"latitude": "33.9", "longitude": "-81.0"}, _OFFICE_ROWS)
        conn = FakeConnection(cursor)

        with (
            patch("api.app.get_db", return_value=conn),
            patch("api.app.get_drive_time", side_effect=Exception("Unavailable")),
            patch("api.app.WAZE_REQUEST_STAGGER_SECONDS", 0),
        ):
            results = asyncio.run(office_drive_times(client_id=42, current_user={}))

        for r in results:
            assert r.duration_minutes is None
            assert r.distance_miles is None
            assert r.straight_line_miles is not None
            assert r.straight_line_miles > 0

    def test_raises_404_for_unknown_client(self):
        conn = FakeConnection(RoutingCursor(None, []))
        with (
            patch("api.app.get_db", return_value=conn),
            pytest.raises(HTTPException) as exc_info,
        ):
            asyncio.run(office_drive_times(client_id=999, current_user={}))
        assert exc_info.value.status_code == 404

    def test_raises_422_when_client_has_no_coordinates(self):
        conn = FakeConnection(RoutingCursor({"latitude": None, "longitude": None}, []))
        with (
            patch("api.app.get_db", return_value=conn),
            pytest.raises(HTTPException) as exc_info,
        ):
            asyncio.run(office_drive_times(client_id=42, current_user={}))
        assert exc_info.value.status_code == 422
