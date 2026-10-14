"""Helpers for talking to the Quo (OpenPhone) messaging API.

These are pure functions with no HTTP library: they normalize phone numbers,
build request payloads and query strings, and parse responses. Each project
sends the requests with its own transport.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

API_BASE = "https://api.quo.com/v1/"

MessageDirection = Literal["incoming", "outgoing"]


class InvalidPhoneNumberError(ValueError):
    """A phone number that cannot be turned into a US E.164 number."""

    def __init__(self, message: str = "Invalid phone number format.") -> None:
        super().__init__(message)


def to_e164(raw_phone: str) -> str:
    """Normalize a US phone number to E.164 (`+1XXXXXXXXXX`).

    Accepts any formatting (spaces, dashes, parentheses, an existing `+`).
    Raises InvalidPhoneNumberError for numbers that are not 10 digits, or 11
    digits starting with 1. A 10-digit number cannot start with 1, since no US
    area code does.
    """
    digits = "".join(filter(str.isdigit, raw_phone))

    if len(digits) == 10:
        if digits.startswith("1"):
            raise InvalidPhoneNumberError(f"10-digit number starts with 1: {raw_phone}")
        return "+1" + digits
    if len(digits) == 11:
        if not digits.startswith("1"):
            raise InvalidPhoneNumberError(
                f"11-digit number does not start with 1: {raw_phone}"
            )
        return "+" + digits
    raise InvalidPhoneNumberError(
        f"Phone number has invalid length ({len(digits)}): {raw_phone}"
    )


def build_send_payload(
    message: str,
    from_number: str,
    to_number: str,
    *,
    user_id: str | None = None,
    mark_done: bool = False,
) -> dict:
    """Build the JSON body for sending a text. `to_number` must already be E.164.

    `user_id` attributes the message to a Quo user. `mark_done` also marks the
    conversation as done in the Quo inbox.
    """
    payload: dict = {
        "content": message,
        "from": from_number,
        "to": [to_number],
    }
    if user_id is not None:
        payload["userId"] = user_id
    if mark_done:
        payload["setInboxStatus"] = "done"
    return payload


def build_messages_query(
    phone_number_id: str,
    participant: str,
    *,
    direction: MessageDirection | None = None,
    since: datetime | None = None,
    max_results: int = 25,
) -> list[tuple[str, str]]:
    """Build the query parameters for listing messages with one participant.

    `participant` must be E.164. `since` must be timezone-aware. Without a
    `direction`, messages in both directions are returned.
    """
    params = [
        ("phoneNumberId", phone_number_id),
        ("participants", participant),
        ("maxResults", str(max_results)),
    ]
    if direction is not None:
        params.append(("direction", direction))
    if since is not None:
        params.append(("createdAfter", since.isoformat()))
    return params


def parse_messages(
    data: list[dict], since: datetime | None = None
) -> list[tuple[dict, datetime]]:
    """Pair each message in a list response with its timezone-aware created time.

    Messages with no created time are skipped. When `since` is given, messages
    created before it are dropped too, as a fallback for an API that ignores
    `createdAfter`.
    """
    messages = []
    for message in data:
        created_at = message.get("createdAt") or message.get("createdAtMs")
        if created_at is None:
            continue
        if isinstance(created_at, int | float):
            created = datetime.fromtimestamp(created_at / 1000, tz=UTC)
        else:
            created = datetime.fromisoformat(str(created_at))
        if since is None or created >= since:
            messages.append((message, created))
    return messages


def fill_placeholders(template: str, substitutions: dict[str, str]) -> str:
    """Replace each `$PLACEHOLDER` in a template with its value.

    Placeholders without a value are left in place.
    """
    message = template
    for placeholder, value in substitutions.items():
        message = message.replace(placeholder, value)
    return message
