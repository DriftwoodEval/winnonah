from unittest.mock import MagicMock, patch

import pytest

from utils.app_api import (
    get_exclusion_check_notify_users,
    get_queue_notify_users,
    get_users_with_permission,
)


@pytest.fixture(autouse=True)
def app_env(monkeypatch):
    monkeypatch.setenv("API_KEY", "secret")
    monkeypatch.setenv("EMR_APP_URL", "https://app.example.com/")


def _response(body):
    response = MagicMock()
    response.json.return_value = body
    return response


class TestGetUsersWithPermission:
    def test_sends_the_permission_and_api_key(self):
        with patch("utils.app_api.requests.get", return_value=_response([])) as get:
            get_users_with_permission("reports:notifications")
        assert get.call_args.args[0] == (
            "https://app.example.com/api/internal/users-with-permission"
        )
        assert get.call_args.kwargs["params"] == {"permission": "reports:notifications"}
        assert get.call_args.kwargs["headers"] == {"Authorization": "Bearer secret"}

    def test_narrows_to_one_email_when_given(self):
        with patch("utils.app_api.requests.get", return_value=_response([])) as get:
            get_users_with_permission("reports:notifications", email="a@example.com")
        assert get.call_args.kwargs["params"] == {
            "permission": "reports:notifications",
            "email": "a@example.com",
        }

    def test_returns_the_users_from_the_app(self):
        users = [{"email": "a@example.com", "name": "A"}]
        with patch("utils.app_api.requests.get", return_value=_response(users)):
            assert get_users_with_permission("reports:notifications") == users

    def test_sends_an_empty_email_so_it_matches_no_one(self):
        with patch("utils.app_api.requests.get", return_value=_response([])) as get:
            get_users_with_permission("reports:notifications", email="")
        assert get.call_args.kwargs["params"]["email"] == ""

    def test_uses_the_production_app_when_the_url_is_blank(self, monkeypatch):
        monkeypatch.setenv("EMR_APP_URL", "")
        with patch("utils.app_api.requests.get", return_value=_response([])) as get:
            get_users_with_permission("reports:notifications")
        assert get.call_args.args[0] == (
            "https://emr.driftwoodeval.com/api/internal/users-with-permission"
        )

    def test_defaults_to_the_production_app(self, monkeypatch):
        monkeypatch.delenv("EMR_APP_URL")
        with patch("utils.app_api.requests.get", return_value=_response([])) as get:
            get_users_with_permission("reports:notifications")
        assert get.call_args.args[0] == (
            "https://emr.driftwoodeval.com/api/internal/users-with-permission"
        )

    def test_raises_without_an_api_key(self, monkeypatch):
        monkeypatch.delenv("API_KEY")
        with pytest.raises(RuntimeError):
            get_users_with_permission("reports:notifications")

    def test_raises_when_the_app_rejects_the_request(self):
        response = _response(None)
        response.raise_for_status.side_effect = RuntimeError("401")
        with (
            patch("utils.app_api.requests.get", return_value=response),
            pytest.raises(RuntimeError),
        ):
            get_users_with_permission("reports:notifications")


class TestNotifyUsers:
    def test_queue_users_exclude_those_with_a_claimed_report(self):
        users = [
            {"email": "free@example.com", "claimedReportFolder": None},
            {"email": "released@example.com", "claimedReportFolder": []},
            {"email": "busy@example.com", "claimedReportFolder": [{"id": "f"}]},
        ]
        with patch("utils.app_api.requests.get", return_value=_response(users)):
            result = get_queue_notify_users()
        assert [u["email"] for u in result] == [
            "free@example.com",
            "released@example.com",
        ]

    def test_exclusion_check_users_are_everyone_the_app_returns(self):
        users = [{"email": "a@example.com"}, {"email": "b@example.com"}]
        with patch("utils.app_api.requests.get", return_value=_response(users)) as get:
            result = get_exclusion_check_notify_users()
        assert result == users
        assert get.call_args.kwargs["params"] == {
            "permission": "settings:exclusion-check:notifications"
        }
