import asyncio
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
import requests

import appointment_reminders
import greeter_proxy


def _quo(send_result=None, messages=None):
    quo = MagicMock()
    quo.send_text.return_value = send_result
    quo.get_messages.return_value = messages or []
    return quo


class TestReminderSendSms:
    def test_sends_and_marks_the_thread_done(self):
        quo = _quo(send_result={"id": "msg1"})
        with patch.object(appointment_reminders, "get_quo_client", return_value=quo):
            message_id = asyncio.run(
                appointment_reminders.send_sms("+18435551234", "See you soon")
            )

        assert message_id == "msg1"
        quo.send_text.assert_called_once_with(
            "See you soon", "+18435551234", mark_done=True
        )

    def test_returns_none_when_quo_returns_no_data(self):
        quo = _quo(send_result=None)
        with patch.object(appointment_reminders, "get_quo_client", return_value=quo):
            assert asyncio.run(appointment_reminders.send_sms("+1843", "Hi")) is None

    def test_reraises_http_errors(self):
        quo = _quo()
        response = requests.Response()
        response.status_code = 400
        quo.send_text.side_effect = requests.HTTPError(response=response)
        with (
            patch.object(appointment_reminders, "get_quo_client", return_value=quo),
            pytest.raises(requests.HTTPError),
        ):
            asyncio.run(appointment_reminders.send_sms("+18435551234", "Hi"))


class TestShouldHandleReply:
    @staticmethod
    def _handle(quo, phone="8435551234"):
        with patch.object(appointment_reminders, "get_quo_client", return_value=quo):
            return asyncio.run(
                appointment_reminders.should_handle_reply(
                    "msg1", datetime(2026, 1, 15, 14, 0), phone, MagicMock()
                )
            )

    def test_looks_up_messages_since_the_reminder_in_utc(self):
        quo = _quo()
        assert self._handle(quo) is True
        quo.get_messages.assert_called_once_with(
            "8435551234", datetime(2026, 1, 15, 14, 0, tzinfo=UTC)
        )

    def test_no_messages_allows_handling(self):
        assert self._handle(_quo(messages=[])) is True

    def test_an_incoming_reply_since_the_reminder_blocks_handling(self):
        reply = {"id": "msg2", "direction": "incoming"}
        quo = _quo(messages=[(reply, datetime(2026, 1, 15, 15, tzinfo=UTC))])
        assert self._handle(quo) is False

    def test_the_reminder_itself_is_ignored(self):
        own = {"id": "msg1", "direction": "incoming"}
        quo = _quo(messages=[(own, datetime(2026, 1, 15, 14, tzinfo=UTC))])
        assert self._handle(quo) is True


class TestGreeterSendSms:
    def test_sends_through_the_greeter_line(self):
        quo = _quo()
        with patch.object(greeter_proxy, "get_quo_client", return_value=quo):
            asyncio.run(greeter_proxy.send_sms("+18435551234", "Hello"))

        quo.send_text.assert_called_once_with("Hello", "+18435551234")

    def test_reraises_send_failures(self):
        quo = _quo()
        quo.send_text.side_effect = RuntimeError("boom")
        with (
            patch.object(greeter_proxy, "get_quo_client", return_value=quo),
            pytest.raises(RuntimeError, match="boom"),
        ):
            asyncio.run(greeter_proxy.send_sms("+18435551234", "Hello"))
