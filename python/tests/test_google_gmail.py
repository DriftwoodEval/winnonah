from unittest.mock import MagicMock, patch

import pytest
from googleapiclient.errors import HttpError

from utils import google


def http_error() -> HttpError:
    return HttpError(resp=MagicMock(status=500, reason="boom"), content=b"{}")


class TestSendGmail:
    def test_sends_through_the_gmail_service_with_its_arguments(self):
        service = MagicMock()
        with (
            patch.object(google, "get_gmail_service", return_value=service),
            patch.object(google.gmail, "send_email", return_value={"id": "m1"}) as send,
        ):
            result = google.send_gmail(
                "Body",
                "Subject",
                "to@example.com",
                "from@example.com",
                cc_addr="cc@example.com",
                attachments=[(b"pdf", "a.pdf")],
            )

        assert result == {"id": "m1"}
        send.assert_called_once_with(
            service,
            "Body",
            "Subject",
            "to@example.com",
            "from@example.com",
            cc_addr="cc@example.com",
            html=None,
            attachments=[(b"pdf", "a.pdf")],
        )

    def test_an_api_error_is_logged_and_returns_none(self):
        with (
            patch.object(google, "get_gmail_service", return_value=MagicMock()),
            patch.object(google.gmail, "send_email", side_effect=http_error()),
        ):
            assert (
                google.send_gmail("Body", "S", "to@example.com", "f@example.com")
                is None
            )

    def test_a_missing_attachment_still_raises(self):
        with (
            patch.object(google, "get_gmail_service", return_value=MagicMock()),
            pytest.raises(FileNotFoundError),
        ):
            google.send_gmail(
                "Body",
                "S",
                "to@example.com",
                "f@example.com",
                attachments=["/nonexistent/file.pdf"],
            )


class TestListGmailMessages:
    def test_returns_the_stubs(self):
        with (
            patch.object(google, "get_gmail_service", return_value=MagicMock()),
            patch.object(
                google.gmail, "list_message_stubs", return_value=[{"id": "1"}]
            ),
        ):
            assert google.list_gmail_messages("is:unread") == [{"id": "1"}]

    def test_an_api_error_returns_an_empty_list(self):
        with (
            patch.object(google, "get_gmail_service", return_value=MagicMock()),
            patch.object(google.gmail, "list_message_stubs", side_effect=http_error()),
        ):
            assert google.list_gmail_messages("is:unread") == []
