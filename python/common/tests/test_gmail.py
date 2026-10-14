import base64
from email import message_from_bytes
from email.message import Message
from unittest.mock import MagicMock

import pytest
from driftwood_common import gmail


def encode(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode()


def parse_sent(service: MagicMock) -> Message:
    """The email handed to the Gmail send call, parsed back from its raw form."""
    body = service.users().messages().send.call_args.kwargs["body"]
    return message_from_bytes(base64.urlsafe_b64decode(body["raw"]))


class TestBuildEmail:
    def test_sets_headers_and_plain_text(self):
        message = gmail.build_email(
            "Body text", "Subject", "to@example.com", "from@example.com"
        )
        assert message["Subject"] == "Subject"
        assert message["To"] == "to@example.com"
        assert message["From"] == "from@example.com"
        assert message["Cc"] is None
        assert message.get_content().strip() == "Body text"

    def test_adds_cc_and_an_html_alternative(self):
        message = gmail.build_email(
            "Plain",
            "Subject",
            "a@example.com, b@example.com",
            "from@example.com",
            cc_addr="cc@example.com",
            html="<p>Rich</p>",
        )
        assert message["To"] == "a@example.com, b@example.com"
        assert message["Cc"] == "cc@example.com"
        types = [part.get_content_type() for part in message.iter_parts()]
        assert types == ["text/plain", "text/html"]

    def test_attaches_bytes_and_files_with_guessed_types(self, tmp_path):
        report = tmp_path / "report.pdf"
        report.write_bytes(b"%PDF file")
        message = gmail.build_email(
            "Body",
            "Subject",
            "to@example.com",
            "from@example.com",
            attachments=[(b"%PDF bytes", "fax.pdf"), report, str(report)],
        )
        attachments = list(message.iter_attachments())
        assert [a.get_filename() for a in attachments] == [
            "fax.pdf",
            "report.pdf",
            "report.pdf",
        ]
        assert {a.get_content_type() for a in attachments} == {"application/pdf"}
        assert attachments[0].get_content() == b"%PDF bytes"
        assert attachments[1].get_content() == b"%PDF file"

    def test_unknown_file_types_are_sent_as_binary(self):
        message = gmail.build_email(
            "Body",
            "Subject",
            "to@example.com",
            "from@example.com",
            attachments=[(b"data", "notes.unknownext")],
        )
        (attachment,) = message.iter_attachments()
        assert attachment.get_content_type() == "application/octet-stream"

    def test_a_missing_attachment_path_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError, match="Attachment not found"):
            gmail.build_email(
                "Body",
                "Subject",
                "to@example.com",
                "from@example.com",
                attachments=[tmp_path / "missing.pdf"],
            )


class TestSendEmail:
    def test_sends_the_raw_message_and_returns_the_response(self):
        service = MagicMock()
        send_call = service.users().messages().send
        send_call.return_value.execute.return_value = {"id": "sent1"}

        response = gmail.send_email(
            service, "Body", "Subject", "to@example.com", "from@example.com"
        )

        assert response == {"id": "sent1"}
        assert send_call.call_args.kwargs["userId"] == "me"
        assert parse_sent(service)["Subject"] == "Subject"

    def test_api_errors_are_raised_to_the_caller(self):
        service = MagicMock()
        service.users().messages().send().execute.side_effect = RuntimeError("quota")
        with pytest.raises(RuntimeError, match="quota"):
            gmail.send_email(
                service, "Body", "Subject", "to@example.com", "from@example.com"
            )


class TestListMessageStubs:
    @staticmethod
    def _service(pages):
        service = MagicMock()
        service.users().messages().list().execute.side_effect = pages
        service.users().messages().list.reset_mock()
        return service

    def test_follows_page_tokens_until_there_are_no_more(self):
        service = self._service(
            [
                {"messages": [{"id": "1"}, {"id": "2"}], "nextPageToken": "next"},
                {"messages": [{"id": "3"}]},
            ]
        )
        stubs = gmail.list_message_stubs(service, query="is:unread")
        assert [m["id"] for m in stubs] == ["1", "2", "3"]
        calls = service.users().messages().list.call_args_list
        assert [c.kwargs["pageToken"] for c in calls] == [None, "next"]
        assert calls[0].kwargs["q"] == "is:unread"

    def test_stops_at_max_results_and_trims_the_page(self):
        service = self._service(
            [
                {
                    "messages": [{"id": "1"}, {"id": "2"}, {"id": "3"}],
                    "nextPageToken": "n",
                }
            ]
        )
        stubs = gmail.list_message_stubs(service, max_results=2)
        assert [m["id"] for m in stubs] == ["1", "2"]
        calls = service.users().messages().list.call_args_list
        assert len(calls) == 1
        assert calls[0].kwargs["maxResults"] == 2

    def test_no_matches_returns_an_empty_list(self):
        assert gmail.list_message_stubs(self._service([{}])) == []


class TestExtractBody:
    def test_reads_plain_and_html_from_nested_parts(self):
        payload = {
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "multipart/alternative",
                    "parts": [
                        {"mimeType": "text/plain", "body": {"data": encode("Hello")}},
                        {
                            "mimeType": "text/html",
                            "body": {"data": encode("<b>Hi</b>")},
                        },
                    ],
                },
                {"mimeType": "application/pdf", "body": {}},
            ],
        }
        assert gmail.extract_body(payload) == ("Hello", "<b>Hi</b>")

    def test_keeps_the_first_part_of_each_type(self):
        payload = {
            "mimeType": "multipart/mixed",
            "parts": [
                {"mimeType": "text/plain", "body": {"data": encode("first")}},
                {"mimeType": "text/plain", "body": {"data": encode("second")}},
            ],
        }
        assert gmail.extract_body(payload) == ("first", None)

    def test_a_message_with_no_body_returns_nothing(self):
        assert gmail.extract_body({"mimeType": "text/plain", "body": {}}) == (
            None,
            None,
        )


class TestGetMessage:
    def test_returns_headers_snippet_and_bodies(self):
        service = MagicMock()
        service.users().messages().get().execute.return_value = {
            "id": "m1",
            "threadId": "t1",
            "snippet": "Hello th...",
            "payload": {
                "mimeType": "text/plain",
                "headers": [
                    {"name": "Subject", "value": "Greetings"},
                    {"name": "FROM", "value": "a@example.com"},
                    {"name": "To", "value": "b@example.com"},
                    {"name": "Date", "value": "Mon, 1 Jan 2026 10:00:00 -0500"},
                ],
                "body": {"data": encode("Hello there")},
            },
        }

        result = gmail.get_message(service, "m1")

        assert result == {
            "id": "m1",
            "thread_id": "t1",
            "subject": "Greetings",
            "from": "a@example.com",
            "to": "b@example.com",
            "date": "Mon, 1 Jan 2026 10:00:00 -0500",
            "snippet": "Hello th...",
            "body_text": "Hello there",
            "body_html": None,
        }
        get_call = service.users().messages().get
        assert get_call.call_args.kwargs == {
            "userId": "me",
            "id": "m1",
            "format": "full",
        }


class TestMarkRead:
    def test_removes_the_unread_label(self):
        service = MagicMock()
        gmail.mark_read(service, "m1")
        modify = service.users().messages().modify
        assert modify.call_args.kwargs == {
            "userId": "me",
            "id": "m1",
            "body": {"removeLabelIds": ["UNREAD"]},
        }
        modify.return_value.execute.assert_called_once()
