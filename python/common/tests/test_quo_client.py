from datetime import UTC, date, datetime
from unittest.mock import MagicMock

import pytest
import requests
from driftwood_common.quo import InvalidPhoneNumberError
from driftwood_common.quo_client import (
    NotEnoughCreditsError,
    QuoClient,
    is_transient_error,
    should_continue_polling,
)
from driftwood_common.timezone import now_business
from ratelimit import RateLimitException


@pytest.fixture(autouse=True)
def no_retry_backoff(monkeypatch):
    """Skip tenacity backoff sleeps so retry paths run instantly."""
    monkeypatch.setattr("tenacity.nap.time.sleep", lambda _: None)


def make_client(**overrides) -> tuple[QuoClient, MagicMock]:
    """A client whose HTTP session is a mock, so no request is made."""
    options = {"main_number": "+15551230000", "phone_number_id": "PN1"}
    options.update(overrides)
    client = QuoClient("key", **options)
    session = MagicMock()
    client.session = session
    return client, session


class TestShouldContinuePolling:
    @pytest.mark.parametrize(
        ("status", "expected"),
        [
            ("queued", True),
            ("sent", True),
            ("delivered", False),
            ("undelivered", False),
            ("unknown", False),
        ],
    )
    def test_should_continue_polling(self, status, expected):
        assert should_continue_polling(status) == expected


class TestIsTransientError:
    @pytest.mark.parametrize("status_code", [400, 401, 403, 404, 422])
    def test_non_transient_http_errors_are_not_retried(self, status_code):
        response = requests.Response()
        response.status_code = status_code
        error = requests.HTTPError(response=response)
        assert is_transient_error(error) is False

    @pytest.mark.parametrize("status_code", [408, 429, 500, 502, 503])
    def test_transient_http_errors_are_retried(self, status_code):
        response = requests.Response()
        response.status_code = status_code
        error = requests.HTTPError(response=response)
        assert is_transient_error(error) is True

    def test_http_error_without_response_is_not_retried(self):
        assert is_transient_error(requests.HTTPError()) is False

    def test_connection_error_is_retried(self):
        assert is_transient_error(requests.ConnectionError()) is True

    def test_rate_limit_exception_is_retried(self):
        assert is_transient_error(RateLimitException("slow down", 1)) is True

    def test_unrelated_exception_is_not_retried(self):
        assert is_transient_error(ValueError("nope")) is False


class TestConstruction:
    def test_needs_a_sending_line(self):
        with pytest.raises(ValueError, match="main_number or a phone_number_id"):
            QuoClient("key")

    def test_sets_the_api_key_header(self):
        client = QuoClient("secret", phone_number_id="PN1")
        assert client.session.headers["Authorization"] == "secret"

    def test_fetches_the_phone_number_id_once_even_when_it_is_missing(self):
        client, session = make_client(phone_number_id=None)
        session.get.return_value.json.return_value = {"data": []}

        assert client._get_phone_number_id() is None  # noqa: SLF001
        assert client._get_phone_number_id() is None  # noqa: SLF001
        assert session.get.call_count == 1

    def test_finds_the_phone_number_id_for_the_main_number(self):
        client, session = make_client(phone_number_id=None)
        session.get.return_value.json.return_value = {
            "data": [
                {"number": "+19990000000", "id": "PN_OTHER"},
                {"number": "+15551230000", "id": "PN_MAIN"},
            ]
        }
        assert client._get_phone_number_id() == "PN_MAIN"  # noqa: SLF001


class TestSendText:
    def test_posts_the_normalized_number_with_the_default_sender(self):
        client, session = make_client(default_user="US1")
        session.post.return_value.status_code = 200
        session.post.return_value.json.return_value = {"data": {"id": "msg1"}}

        result = client.send_text("Hello", "(843) 555-0100", mark_done=True)

        assert result == {"id": "msg1"}
        assert session.post.call_args.kwargs["json"] == {
            "content": "Hello",
            "from": "+15551230000",
            "to": ["+18435550100"],
            "userId": "US1",
            "setInboxStatus": "done",
        }
        assert session.post.call_args.kwargs["timeout"] > 0

    def test_sends_from_the_phone_number_id_when_there_is_no_main_number(self):
        client, session = make_client(main_number=None)
        session.post.return_value.status_code = 200
        session.post.return_value.json.return_value = {"data": {}}

        client.send_text("Hello", "8435550100")

        assert session.post.call_args.kwargs["json"]["from"] == "PN1"
        assert "userId" not in session.post.call_args.kwargs["json"]

    @pytest.mark.parametrize("number", ["1435550100", "28435550100", "555-0100", ""])
    def test_rejects_malformed_numbers_without_sending(self, number):
        client, session = make_client()
        with pytest.raises(InvalidPhoneNumberError):
            client.send_text("Hello", number)
        session.post.assert_not_called()

    def test_insufficient_credits_is_raised_without_retrying(self):
        client, session = make_client()
        session.post.return_value.status_code = 402
        with pytest.raises(NotEnoughCreditsError):
            client.send_text("Hello", "8435550100")
        assert session.post.call_count == 1


class TestGetMessages:
    @staticmethod
    def _msg(text, direction="outgoing"):
        return {
            "text": text,
            "direction": direction,
            "createdAt": datetime.now(UTC).isoformat(),
        }

    def test_malformed_number_returns_no_messages_without_a_request(self):
        client, session = make_client()
        assert client.has_client_replied("12345") is False
        session.get.assert_not_called()

    def test_queries_the_normalized_number_for_one_direction(self):
        client, session = make_client()
        session.get.return_value.json.return_value = {"data": []}

        client.has_client_replied("8435550100", since=date(2026, 1, 15))

        params = dict(session.get.call_args.kwargs["params"])
        assert params["participants"] == "+18435550100"
        assert params["direction"] == "incoming"
        assert params["createdAfter"] == "2026-01-15T05:00:00+00:00"

    def test_a_date_since_uses_the_configured_business_timezone(self):
        client, session = make_client(business_timezone="America/Los_Angeles")
        session.get.return_value.json.return_value = {"data": []}

        client.has_client_replied("8435550100", since=date(2026, 1, 15))

        params = dict(session.get.call_args.kwargs["params"])
        assert params["createdAfter"] == "2026-01-15T08:00:00+00:00"

    def test_a_datetime_since_is_used_as_given(self):
        client, session = make_client()
        session.get.return_value.json.return_value = {"data": []}
        since = datetime(2026, 1, 15, 14, 30, tzinfo=UTC)

        client.get_messages("8435550100", since=since)

        params = dict(session.get.call_args.kwargs["params"])
        assert params["createdAfter"] == "2026-01-15T14:30:00+00:00"
        assert "direction" not in params

    def test_a_failed_request_returns_no_messages(self):
        client, session = make_client()
        session.get.side_effect = requests.ConnectionError("down")
        assert client.get_messages("8435550100") == []

    def test_a_dropped_connection_is_retried_before_giving_up(self):
        client, session = make_client()
        ok = MagicMock()
        ok.json.return_value = {"data": []}
        session.get.side_effect = [requests.ConnectionError("reset"), ok]
        client.get_messages("8435550100")
        assert session.get.call_count == 2


class TestHasSentMessage:
    @staticmethod
    def _client(messages):
        client, session = make_client()
        session.get.return_value.json.return_value = {"data": messages}
        return client

    def test_matches_identical_text_ignoring_whitespace(self):
        client = self._client([TestGetMessages._msg("Hello  there,\nfriend")])  # noqa: SLF001
        assert client.has_sent_message(
            "8435550100", "Hello there, friend", now_business().date()
        )

    def test_different_text_does_not_match(self):
        client = self._client([TestGetMessages._msg("A different reminder")])  # noqa: SLF001
        assert not client.has_sent_message(
            "8435550100", "Hello there", now_business().date()
        )

    def test_matching_text_before_since_does_not_match(self):
        old = {"text": "Hello", "createdAt": "2000-01-01T00:00:00+00:00"}
        client = self._client([old])
        assert not client.has_sent_message("8435550100", "Hello", now_business().date())
