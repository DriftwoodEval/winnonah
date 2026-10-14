import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import appointment_reminders
import greeter_proxy


def _fake_http(post_data=None, get_data=None):
    http = MagicMock()
    post_response = MagicMock()
    post_response.json.return_value = {"data": post_data or {}}
    http.post = AsyncMock(return_value=post_response)
    get_response = MagicMock()
    get_response.json.return_value = {"data": get_data or []}
    http.get = AsyncMock(return_value=get_response)
    return http


class TestReminderSendSms:
    def test_sends_from_the_reminder_number_and_marks_the_thread_done(self):
        http = _fake_http(post_data={"id": "msg1"})
        with (
            patch.object(appointment_reminders, "get_http_client", return_value=http),
            patch.object(appointment_reminders, "OPENPHONE_NUMBER_ID", "PN1"),
        ):
            message_id = asyncio.run(
                appointment_reminders.send_sms("+18435551234", "See you soon")
            )

        assert message_id == "msg1"
        http.post.assert_awaited_once_with(
            "/messages",
            json={
                "content": "See you soon",
                "from": "PN1",
                "to": ["+18435551234"],
                "setInboxStatus": "done",
            },
        )


class TestShouldHandleReply:
    def test_queries_messages_for_the_normalized_number_since_the_reminder(self):
        http = _fake_http()
        sent_at = datetime(2026, 1, 15, 14, 0)
        with (
            patch.object(appointment_reminders, "get_http_client", return_value=http),
            patch.object(appointment_reminders, "OPENPHONE_NUMBER_ID", "PN1"),
        ):
            result = asyncio.run(
                appointment_reminders.should_handle_reply(
                    "msg1", sent_at, "8435551234", MagicMock()
                )
            )

        assert result is True
        params = dict(http.get.await_args.kwargs["params"])
        assert params["phoneNumberId"] == "PN1"
        assert params["participants"] == "+18435551234"
        assert params["createdAfter"] == sent_at.replace(tzinfo=UTC).isoformat()

    def test_a_malformed_number_skips_the_lookup_and_allows_handling(self):
        http = _fake_http()
        with patch.object(appointment_reminders, "get_http_client", return_value=http):
            result = asyncio.run(
                appointment_reminders.should_handle_reply(
                    "msg1", datetime(2026, 1, 15, 14, 0), "12345", MagicMock()
                )
            )

        assert result is True
        http.get.assert_not_awaited()

    def test_an_incoming_reply_since_the_reminder_blocks_handling(self):
        http = _fake_http(get_data=[{"id": "msg2", "direction": "incoming"}])
        with patch.object(appointment_reminders, "get_http_client", return_value=http):
            result = asyncio.run(
                appointment_reminders.should_handle_reply(
                    "msg1", datetime(2026, 1, 15, 14, 0), "8435551234", MagicMock()
                )
            )

        assert result is False


class TestGreeterSendSms:
    def test_sends_from_the_greeter_number(self):
        http = _fake_http()
        with (
            patch.object(greeter_proxy, "get_http_client", return_value=http),
            patch.object(greeter_proxy, "OPENPHONE_GREETER_NUMBER_ID", "PNG"),
        ):
            asyncio.run(greeter_proxy.send_sms("+18435551234", "Hello"))

        http.post.assert_awaited_once_with(
            "/messages",
            json={"content": "Hello", "from": "PNG", "to": ["+18435551234"]},
        )
