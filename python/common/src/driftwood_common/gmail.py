"""Gmail operations on an authenticated Gmail API service.

Every function takes the `service` (from `build_google_service("gmail", "v1",
creds)`) so each project keeps its own authentication. Functions raise the
Google API's errors; callers decide how to handle them.
"""

from __future__ import annotations

import base64
import mimetypes
from collections.abc import Sequence
from email.message import EmailMessage
from pathlib import Path

from loguru import logger

# A file on disk, or the file's bytes with the name to attach it under.
Attachment = str | Path | tuple[bytes, str]


def build_email(
    message_text: str,
    subject: str,
    to_addr: str,
    from_addr: str,
    *,
    cc_addr: str | None = None,
    html: str | None = None,
    attachments: Sequence[Attachment] | None = None,
) -> EmailMessage:
    """Build an email with an optional HTML alternative, CC, and attachments.

    `to_addr` and `cc_addr` can be comma-separated lists. Raises
    FileNotFoundError for an attachment path that does not exist.
    """
    message = EmailMessage()
    message.set_content(message_text)
    message["Subject"] = subject
    message["To"] = to_addr
    message["From"] = from_addr
    if cc_addr:
        message["Cc"] = cc_addr

    if html:
        message.add_alternative(html, subtype="html")

    for item in attachments or []:
        if isinstance(item, tuple):
            file_data, filename = item
        else:
            item_path = Path(item)
            if not item_path.exists():
                raise FileNotFoundError(f"Attachment not found: {item}")
            filename = item_path.name
            file_data = item_path.read_bytes()

        content_type, encoding = mimetypes.guess_type(filename)
        if content_type is None or encoding is not None:
            content_type = "application/octet-stream"
        maintype, subtype = content_type.split("/", 1)

        message.add_attachment(
            file_data, maintype=maintype, subtype=subtype, filename=filename
        )

    return message


def send_email(
    service,
    message_text: str,
    subject: str,
    to_addr: str,
    from_addr: str,
    *,
    cc_addr: str | None = None,
    html: str | None = None,
    attachments: Sequence[Attachment] | None = None,
) -> dict:
    """Send an email and return Gmail's response (the sent message's id)."""
    message = build_email(
        message_text,
        subject,
        to_addr,
        from_addr,
        cc_addr=cc_addr,
        html=html,
        attachments=attachments,
    )
    encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
    sent = service.users().messages().send(userId="me", body={"raw": encoded_message})
    response = sent.execute()
    logger.info(f"Sent email to {to_addr}: {subject}")
    return response


def list_message_stubs(
    service,
    query: str | None = None,
    label_ids: Sequence[str] | None = None,
    max_results: int = 50,
) -> list[dict]:
    """List Gmail message id stubs matching a search query.

    The query uses Gmail search syntax, for example "from:x@y.com is:unread".
    Paginates until `max_results` is reached. Returns the raw {"id", "threadId"}
    stubs; use `get_message` to fetch a message's content.
    """
    messages: list[dict] = []
    page_token = None
    while len(messages) < max_results:
        response = (
            service.users()
            .messages()
            .list(
                userId="me",
                q=query,
                labelIds=label_ids,
                pageToken=page_token,
                maxResults=min(max_results - len(messages), 500),
            )
            .execute()
        )
        messages.extend(response.get("messages", []))
        page_token = response.get("nextPageToken")
        if page_token is None:
            break
    return messages[:max_results]


def extract_body(payload: dict) -> tuple[str | None, str | None]:
    """Walk a message payload's MIME parts, returning (text_plain, text_html)."""
    text_plain = None
    text_html = None

    def decode(data: str) -> str:
        return base64.urlsafe_b64decode(data.encode()).decode("utf-8", errors="replace")

    def walk(part: dict) -> None:
        nonlocal text_plain, text_html
        mime_type = part.get("mimeType", "")
        body_data = part.get("body", {}).get("data")
        if mime_type == "text/plain" and body_data and text_plain is None:
            text_plain = decode(body_data)
        elif mime_type == "text/html" and body_data and text_html is None:
            text_html = decode(body_data)
        for subpart in part.get("parts", []):
            walk(subpart)

    walk(payload)
    return text_plain, text_html


def get_message(service, message_id: str) -> dict:
    """Fetch and parse a single message by id.

    Returns a dict with id, thread_id, subject, from, to, date, snippet,
    body_text, and body_html.
    """
    message = (
        service.users()
        .messages()
        .get(userId="me", id=message_id, format="full")
        .execute()
    )

    payload = message.get("payload", {})
    headers = {h["name"].lower(): h["value"] for h in payload.get("headers", [])}
    body_text, body_html = extract_body(payload)

    return {
        "id": message["id"],
        "thread_id": message.get("threadId"),
        "subject": headers.get("subject"),
        "from": headers.get("from"),
        "to": headers.get("to"),
        "date": headers.get("date"),
        "snippet": message.get("snippet"),
        "body_text": body_text,
        "body_html": body_html,
    }


def mark_read(service, message_id: str) -> None:
    """Remove the UNREAD label from a message."""
    service.users().messages().modify(
        userId="me", id=message_id, body={"removeLabelIds": ["UNREAD"]}
    ).execute()
