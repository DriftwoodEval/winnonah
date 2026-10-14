from datetime import UTC, datetime

import pytest
from driftwood_common.quo import (
    InvalidPhoneNumberError,
    build_messages_query,
    build_send_payload,
    fill_placeholders,
    parse_messages,
    to_e164,
)


class TestToE164:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("8435551234", "+18435551234"),
            ("(843) 555-1234", "+18435551234"),
            ("1-843-555-1234", "+18435551234"),
            ("+1 843 555 1234", "+18435551234"),
            ("+18435551234", "+18435551234"),
        ],
    )
    def test_normalizes_us_numbers(self, raw, expected):
        assert to_e164(raw) == expected

    @pytest.mark.parametrize(
        ("raw", "message"),
        [
            ("1435551234", "10-digit number starts with 1"),
            ("28435551234", "11-digit number does not start with 1"),
            ("555-1234", "invalid length"),
            ("", "invalid length"),
            ("184355512345", "invalid length"),
        ],
    )
    def test_rejects_malformed_numbers(self, raw, message):
        with pytest.raises(InvalidPhoneNumberError, match=message):
            to_e164(raw)

    def test_invalid_number_is_a_value_error(self):
        with pytest.raises(ValueError):
            to_e164("123")


class TestBuildSendPayload:
    def test_minimal_payload(self):
        assert build_send_payload("Hi", "+15551230000", "+18435551234") == {
            "content": "Hi",
            "from": "+15551230000",
            "to": ["+18435551234"],
        }

    def test_includes_user_and_inbox_status_when_given(self):
        payload = build_send_payload(
            "Hi", "PN123", "+18435551234", user_id="US1", mark_done=True
        )
        assert payload["userId"] == "US1"
        assert payload["setInboxStatus"] == "done"


class TestBuildMessagesQuery:
    def test_defaults_to_both_directions_without_a_since(self):
        params = build_messages_query("PN1", "+18435551234")
        assert params == [
            ("phoneNumberId", "PN1"),
            ("participants", "+18435551234"),
            ("maxResults", "25"),
        ]

    def test_adds_direction_and_since(self):
        since = datetime(2026, 1, 15, 5, tzinfo=UTC)
        params = build_messages_query(
            "PN1", "+18435551234", direction="incoming", since=since, max_results=10
        )
        assert ("direction", "incoming") in params
        assert ("createdAfter", "2026-01-15T05:00:00+00:00") in params
        assert ("maxResults", "10") in params


class TestParseMessages:
    def test_reads_iso_and_millisecond_timestamps(self):
        iso = {"id": "a", "createdAt": "2026-01-15T14:00:00+00:00"}
        millis = {"id": "b", "createdAtMs": 1768485600000}
        parsed = parse_messages([iso, millis])
        assert [m["id"] for m, _ in parsed] == ["a", "b"]
        assert all(created.tzinfo is not None for _, created in parsed)
        assert parsed[1][1] == datetime(2026, 1, 15, 14, tzinfo=UTC)

    def test_skips_messages_without_a_created_time(self):
        assert parse_messages([{"id": "a"}]) == []

    def test_drops_messages_before_since(self):
        since = datetime(2026, 1, 15, 12, tzinfo=UTC)
        before = {"id": "a", "createdAt": "2026-01-15T11:59:59+00:00"}
        after = {"id": "b", "createdAt": "2026-01-15T12:00:00+00:00"}
        parsed = parse_messages([before, after], since)
        assert [m["id"] for m, _ in parsed] == ["b"]


class TestPlaceholders:
    def test_fills_known_placeholders_and_leaves_unknown_ones(self):
        message = fill_placeholders(
            "Hi $NAME, see you at $TIME. $OTHER", {"$NAME": "Sam", "$TIME": "9:00 AM"}
        )
        assert message == "Hi Sam, see you at 9:00 AM. $OTHER"
