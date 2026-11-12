from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from googleapiclient.errors import HttpError

from utils import google
from utils.google import delete_calendar_event, update_gcal_event_title


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


class TestGoogleAuthenticate:
    def test_uses_the_sidecar_scopes_and_files_and_reuses_cached_credentials(self):
        google._creds_holder()[0] = None  # noqa: SLF001
        first, second = MagicMock(), MagicMock()
        try:
            with patch.object(
                google, "authenticate", side_effect=[first, second]
            ) as authenticate:
                assert google.google_authenticate() is first
                assert google.google_authenticate() is second
        finally:
            google._creds_holder()[0] = None  # noqa: SLF001

        calls = authenticate.call_args_list
        assert calls[0].args == (
            google.SCOPES,
            "./auth_cache/credentials.json",
            "auth_cache/token.json",
        )
        assert calls[0].kwargs == {"creds": None}
        assert calls[1].kwargs == {"creds": first}


class TestCalendarAudit:
    @patch("utils.google.utils.database.record_gcal_event_change")
    @patch("utils.google.build_google_service")
    @patch("utils.google.google_authenticate")
    def test_delete_logs_title_and_reason(self, _auth, build, record):
        events = build.return_value.events.return_value
        events.get.return_value.execute.return_value = {
            "summary": "Planned: Office",
            "start": {"date": "2026-11-12"},
        }

        delete_calendar_event(
            "eval@example.com", "evt1", reason="planned_office_cleared"
        )

        action, client_id, detail, actor = record.call_args.args
        assert action == "python.gcal.event_deleted"
        assert client_id is None
        assert detail["title"] == "Planned: Office"
        assert detail["start"] == "2026-11-12"
        assert detail["reason"] == "planned_office_cleared"
        assert detail["alreadyDeleted"] is False
        assert actor is None

    @patch("utils.google.utils.database.record_gcal_event_change")
    @patch("utils.google._patch_gcal_event")
    def test_title_update_logs_old_and_new(self, patch_event, record):
        def fake_patch(_event_id, _calendar_id, patch_fn):
            patch_fn({"summary": "plchldr Jane"})
            return True

        patch_event.side_effect = fake_patch

        update_gcal_event_title(
            "evt1",
            "DA Jane",
            client_id=7,
            reason="placeholder_promoted",
            actor=("user-1", "staff@example.com"),
        )

        action, client_id, detail, actor = record.call_args.args
        assert action == "python.gcal.event_title_updated"
        assert client_id == 7
        assert detail["oldTitle"] == "plchldr Jane"
        assert detail["newTitle"] == "DA Jane"
        assert actor == ("user-1", "staff@example.com")

    @patch("utils.google.utils.database.record_gcal_event_change")
    @patch("utils.google._patch_gcal_event", return_value=False)
    def test_failed_title_update_logs_nothing(self, _patch, record):
        update_gcal_event_title("evt1", "DA Jane")

        record.assert_not_called()

    @patch("utils.google.utils.database.record_gcal_event_change")
    @patch("utils.google._patch_gcal_event", return_value=True)
    def test_description_append_logs_text_and_reason(self, _patch, record):
        google.append_gcal_event_description(
            "evt1",
            "Client replied: yes",
            client_id=7,
            reason="client_reply",
            appointment_id="appt1",
        )

        action, client_id, detail, _actor = record.call_args.args
        assert action == "python.gcal.event_description_updated"
        assert client_id == 7
        assert detail["change"] == "appended"
        assert detail["appendedText"] == "Client replied: yes"
        assert detail["reason"] == "client_reply"
        assert detail["appointmentId"] == "appt1"

    @patch("utils.google.utils.database.record_gcal_event_change")
    @patch("utils.google._patch_gcal_event", return_value=False)
    def test_failed_description_append_logs_nothing(self, _patch, record):
        google.append_gcal_event_description("evt1", "text")

        record.assert_not_called()

    @patch("utils.google.utils.database.record_gcal_event_change")
    @patch("utils.google.build_google_service")
    @patch("utils.google.google_authenticate")
    def test_placeholder_create_logs_event_id_and_reason(self, _auth, build, record):
        build.return_value.events.return_value.insert.return_value.execute.return_value = {
            "id": "new-evt"
        }

        google.create_placeholder_event(
            "eval@example.com",
            "plchldr Jane",
            datetime(2026, 11, 12, 9),
            datetime(2026, 11, 12, 10),
            "desc",
            client_id=7,
            reason="placeholder_created",
            appointment_id="plchldr-1",
        )

        action, client_id, detail, _actor = record.call_args.args
        assert action == "python.gcal.event_created"
        assert client_id == 7
        assert detail["calendarEventId"] == "new-evt"
        assert detail["reason"] == "placeholder_created"
        assert detail["appointmentId"] == "plchldr-1"
