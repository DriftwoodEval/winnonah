from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from utils.appointments import (
    SyncReporter,
    _is_placeholder_title,
    batch_search_calendar_events,
    build_placeholder_description,
    build_placeholder_title,
    find_matching_placeholder,
    format_age_at,
    parse_location_and_type,
    real_title_for_placeholder_event,
    replace_placeholder_with_real_appointment,
    should_skip_appointment,
    strip_placeholder_marker,
)


class TestParseLocationAndType:
    def test_parses_eval_type(self):
        assert parse_location_and_type("[COL-E]") == ("COL", "EVAL", False)

    def test_parses_da_type(self):
        assert parse_location_and_type("[COL-D]") == ("COL", "DA", False)

    def test_parses_daeval_type_with_confirmed_tag(self):
        assert parse_location_and_type("[NYC-DE] [CONFIRMED]") == (
            "NYC",
            "DAEVAL",
            True,
        )

    def test_normalizes_columbia_to_col(self):
        assert parse_location_and_type("[COLUMBIA-E]") == ("COL", "EVAL", False)

    def test_virtual_tag_is_always_da(self):
        assert parse_location_and_type("[V]") == ("Virtual", "DA", False)

    def test_virtual_tag_with_confirmed(self):
        assert parse_location_and_type("[V] [CONFIRMED]") == (
            "Virtual",
            "DA",
            True,
        )

    def test_confirmed_check_is_case_insensitive(self):
        assert parse_location_and_type("[COL-E] [confirmed]")[2] is True

    def test_no_recognizable_tags_returns_all_none(self):
        assert parse_location_and_type("Team Meeting") == (None, None, False)

    def test_unknown_type_code_maps_to_none(self):
        assert parse_location_and_type("[COL-X]") == ("COL", None, False)


class TestBuildPlaceholderTitle:
    def test_builds_eval_title(self):
        assert (
            build_placeholder_title("Jane Doe", "EVAL", "COL")
            == "plchldr Jane Doe EVAL [COL-E]"
        )

    def test_builds_da_title(self):
        assert (
            build_placeholder_title("Jane Doe", "DA", "NYC")
            == "plchldr Jane Doe DA [NYC-D]"
        )

    def test_builds_daeval_title(self):
        assert (
            build_placeholder_title("Jane Doe", "DAEVAL", "COL")
            == "plchldr Jane Doe DAEVAL [COL-DE]"
        )

    def test_virtual_location_uses_v_tag(self):
        assert (
            build_placeholder_title("Jane Doe", "DA", "Virtual")
            == "plchldr Jane Doe DA [V]"
        )

    def test_round_trips_through_parse_location_and_type(self):
        title = build_placeholder_title("Jane Doe", "DAEVAL", "COL")
        assert parse_location_and_type(title) == ("COL", "DAEVAL", False)


def make_appointment(name: str) -> pd.Series:
    return pd.Series({"NAME": name})


class TestShouldSkipAppointment:
    def test_skips_known_test_client_name(self):
        assert should_skip_appointment(make_appointment("Testman Testson")) is True

    def test_skips_test_client_name_with_trailing_digits(self):
        assert (
            should_skip_appointment(make_appointment("Testman Testson (123)")) is True
        )

    def test_skips_reports_cpt_code(self):
        assert should_skip_appointment(make_appointment("John Smith 96130")) is True

    def test_does_not_skip_real_client_and_other_cpt_code(self):
        assert should_skip_appointment(make_appointment("John Smith 96132")) is False

    def test_name_match_is_case_insensitive(self):
        assert should_skip_appointment(make_appointment("TESTMAN TESTSON")) is True


def make_calendar_event(event_id: str, start_time: str, client_id: int) -> dict:
    return {
        "id": event_id,
        "summary": f"Event {event_id}",
        "start": {"dateTime": start_time},
        "description": f"Client ID: {client_id}",
    }


class TestBatchSearchCalendarEvents:
    def test_prefers_npi_calendar_and_flags_ambiguous_match(self):
        """Same client/time matches two calendars: the one matching the CSV's
        NPI wins, and the ambiguity is still flagged for the sync email."""
        appointments_df = pd.DataFrame(
            [
                {
                    "APPOINTMENT_ID": "123",
                    "CLIENT_ID": 42,
                    "NAME": "John Smith 90791",
                    "STARTTIME": "2026-01-15 10:00:00",
                    "NPI": 1111111111,
                }
            ]
        )

        events_by_calendar = {
            "wrong@example.com": [
                make_calendar_event("evt-wrong", "2026-01-15T10:05:00", 42)
            ],
            "right@example.com": [
                make_calendar_event("evt-right", "2026-01-15T10:00:00", 42)
            ],
        }

        def events_list(**kwargs):
            response = MagicMock()
            response.execute.return_value = {
                "items": events_by_calendar[kwargs["calendarId"]],
                "nextPageToken": None,
            }
            return response

        service = MagicMock()
        service.events.return_value.list.side_effect = events_list

        calendars = [
            {"id": "wrong@example.com", "summary": "Wrong Evaluator"},
            {"id": "right@example.com", "summary": "Right Evaluator"},
        ]
        npi_to_email = {1111111111: "right@example.com"}
        calendar_names = {
            "wrong@example.com": "Wrong Evaluator",
            "right@example.com": "Right Evaluator",
        }
        reporter = SyncReporter()

        results = batch_search_calendar_events(
            service,
            calendars,
            appointments_df,
            reporter,
            npi_to_email,
            calendar_names,
            client_name_variants={},
        )

        assert results[0]["calendar_id"] == "right@example.com"
        assert len(reporter.ambiguous_calendar_matches) == 1
        flagged = reporter.ambiguous_calendar_matches[0]
        assert flagged["chosen_evaluator_name"] == "Right Evaluator"
        assert flagged["matched_expected_evaluator"] is True
        assert flagged["other_evaluators"] == ["Wrong Evaluator"]

    def test_falls_back_to_first_match_when_npi_calendar_has_no_event(self):
        appointments_df = pd.DataFrame(
            [
                {
                    "APPOINTMENT_ID": "123",
                    "CLIENT_ID": 42,
                    "NAME": "John Smith 90791",
                    "STARTTIME": "2026-01-15 10:00:00",
                    "NPI": 9999999999,
                }
            ]
        )

        events_by_calendar = {
            "only@example.com": [
                make_calendar_event("evt-only", "2026-01-15T10:00:00", 42)
            ],
        }

        def events_list(**kwargs):
            response = MagicMock()
            response.execute.return_value = {
                "items": events_by_calendar[kwargs["calendarId"]],
                "nextPageToken": None,
            }
            return response

        service = MagicMock()
        service.events.return_value.list.side_effect = events_list

        calendars = [{"id": "only@example.com", "summary": "Only Evaluator"}]
        reporter = SyncReporter()

        results = batch_search_calendar_events(
            service,
            calendars,
            appointments_df,
            reporter,
            npi_to_email={},
            calendar_names={"only@example.com": "Only Evaluator"},
            client_name_variants={},
        )

        assert results[0]["calendar_id"] == "only@example.com"
        assert reporter.ambiguous_calendar_matches == []


def search_single_calendar(events: list[dict]) -> tuple[dict, SyncReporter]:
    """Run the calendar search for one client-42 appointment against one
    calendar holding the given events."""
    appointments_df = pd.DataFrame(
        [
            {
                "APPOINTMENT_ID": "123",
                "CLIENT_ID": 42,
                "NAME": "John Smith 90791",
                "STARTTIME": "2026-01-15 10:00:00",
                "NPI": 1111111111,
            }
        ]
    )
    service = MagicMock()
    service.events.return_value.list.return_value.execute.return_value = {
        "items": events,
        "nextPageToken": None,
    }
    reporter = SyncReporter()
    results = batch_search_calendar_events(
        service,
        [{"id": "cal@example.com", "summary": "Evaluator"}],
        appointments_df,
        reporter,
        npi_to_email={1111111111: "cal@example.com"},
        calendar_names={"cal@example.com": "Evaluator"},
        client_name_variants={},
    )
    return results, reporter


class TestPlaceholderEventsInSearch:
    def test_placeholder_event_matches_when_no_real_event(self):
        hold = make_calendar_event("hold", "2026-01-15T10:00:00", 42)
        hold["summary"] = "plchldr John Smith EVAL [COL-E]"

        results, reporter = search_single_calendar([hold])

        assert results[0]["event_id"] == "hold"
        assert reporter.ambiguous_calendar_matches == []

    def test_real_event_wins_even_when_placeholder_is_listed_first(self):
        hold = make_calendar_event("hold", "2026-01-15T09:30:00", 42)
        hold["summary"] = "plchldr John Smith EVAL [COL-E]"
        real = make_calendar_event("real", "2026-01-15T10:00:00", 42)

        results, reporter = search_single_calendar([hold, real])

        assert results[0]["event_id"] == "real"
        assert reporter.ambiguous_calendar_matches == []

    def test_placeholder_at_a_far_off_time_is_not_a_time_mismatch(self):
        hold = make_calendar_event("hold", "2026-01-15T16:00:00", 42)
        hold["summary"] = "plchldr John Smith EVAL [COL-E]"

        results, reporter = search_single_calendar([hold])

        assert results == {}
        assert reporter.time_mismatches == []


class TestPlaceholderTitlePromotion:
    @pytest.mark.parametrize(
        ("title", "expected"),
        [
            ("plchldr Jane Doe DAEVAL [COL-DE]", "Jane Doe DAEVAL [COL-DE]"),
            ("Placeholder - Jane Doe [COL-E]", "Jane Doe [COL-E]"),
            ("Jane Doe [COL-E] PLACEHOLDER", "Jane Doe [COL-E]"),
            ("Jane Doe [COL-E]", "Jane Doe [COL-E]"),
        ],
    )
    def test_strip_placeholder_marker(self, title, expected):
        assert strip_placeholder_marker(title) == expected

    def test_real_title_strips_marker(self):
        assert (
            real_title_for_placeholder_event(
                "plchldr Jane Doe DAEVAL [COL-DE]", "Jane Doe"
            )
            == "Jane Doe DAEVAL [COL-DE]"
        )

    def test_real_title_rebuilds_when_marker_is_split_across_words(self):
        assert (
            real_title_for_placeholder_event("plc hldr Jane [COL-DE]", "Jane Doe")
            == "Jane Doe DAEVAL [COL-DE]"
        )

    def test_real_title_is_none_when_nothing_can_be_rebuilt(self):
        assert real_title_for_placeholder_event("plc hldr Jane", "Jane Doe") is None

    def test_find_matching_prefers_the_placeholder_owning_the_event(self):
        placeholders = [
            _placeholder("near", "EVAL", REAL_START, event_id="other-event"),
            _placeholder(
                "owner", "EVAL", REAL_START + timedelta(days=3), event_id="promoted"
            ),
        ]

        match = find_matching_placeholder(placeholders, "EVAL", REAL_START, "promoted")

        assert match["id"] == "owner"


class TestIsPlaceholderTitle:
    def test_matches_variants_and_typos(self):
        for title in [
            "PLACEHOLDER",
            "Plchldr - Smith",
            "plchld",
            "plcholder",
            "placehldr",
            "plhldr",
            "plc hldr",
            "place-holder",
            "placehodler",
            "placholder",
            "palceholder",
            "placeholdr",
            "placeholer",
            "[COL-E] Placeholder",
        ]:
            assert _is_placeholder_title(title), title

    def test_ignores_real_titles(self):
        for title in ["", "Jane Doe", "[COL-E] Jane Doe", "Dr. Smith Available"]:
            assert not _is_placeholder_title(title), title


REAL_START = datetime(2026, 11, 10, 14, 0)


def _placeholder(
    placeholder_id: str,
    da_eval: str,
    start_time: datetime,
    event_id: str | None = "hold-event",
    email: str | None = "eval@example.com",
) -> dict:
    return {
        "id": placeholder_id,
        "daEval": da_eval,
        "startTime": start_time,
        "calendarEventId": event_id,
        "evaluatorEmail": email,
    }


class TestFindMatchingPlaceholder:
    @pytest.mark.parametrize(
        ("placeholders", "da_eval", "expected_id"),
        [
            ([], "EVAL", None),
            ([_placeholder("p1", "DA", REAL_START)], "EVAL", None),
            ([_placeholder("p1", "EVAL", REAL_START)], None, None),
            ([_placeholder("p1", "EVAL", REAL_START)], "EVAL", "p1"),
            (
                [
                    _placeholder("far", "EVAL", REAL_START + timedelta(days=7)),
                    _placeholder("near", "EVAL", REAL_START + timedelta(days=1)),
                    _placeholder("other-type", "DA", REAL_START),
                ],
                "EVAL",
                "near",
            ),
        ],
    )
    def test_picks_same_type_closest_in_time(self, placeholders, da_eval, expected_id):
        match = find_matching_placeholder(placeholders, da_eval, REAL_START)

        assert (match["id"] if match else None) == expected_id


class TestReplacePlaceholderWithRealAppointment:
    @patch("utils.appointments.delete_superseded_placeholder")
    @patch("utils.appointments.delete_calendar_event")
    @patch("utils.appointments.get_client_placeholder_appointments")
    def test_deletes_hold_event_and_row(
        self, get_placeholders, delete_event, delete_row
    ):
        get_placeholders.return_value = [_placeholder("p1", "EVAL", REAL_START)]

        replaced = replace_placeholder_with_real_appointment(
            7, "ta-123", "EVAL", REAL_START, "real-event"
        )

        assert replaced
        delete_event.assert_called_once_with("eval@example.com", "hold-event")
        delete_row.assert_called_once_with("p1", 7, "ta-123")

    @patch("utils.appointments.delete_superseded_placeholder")
    @patch("utils.appointments.delete_calendar_event")
    @patch("utils.appointments.get_client_placeholder_appointments")
    def test_no_match_deletes_nothing(self, get_placeholders, delete_event, delete_row):
        get_placeholders.return_value = [_placeholder("p1", "DA", REAL_START)]

        replaced = replace_placeholder_with_real_appointment(
            7, "ta-123", "EVAL", REAL_START, "real-event"
        )

        assert not replaced
        delete_event.assert_not_called()
        delete_row.assert_not_called()

    @patch("utils.appointments.delete_superseded_placeholder")
    @patch("utils.appointments.delete_calendar_event")
    @patch("utils.appointments.get_client_placeholder_appointments")
    def test_calendar_failure_still_removes_row(
        self, get_placeholders, delete_event, delete_row
    ):
        get_placeholders.return_value = [_placeholder("p1", "EVAL", REAL_START)]
        delete_event.side_effect = RuntimeError("calendar down")

        replaced = replace_placeholder_with_real_appointment(
            7, "ta-123", "EVAL", REAL_START, "real-event"
        )

        assert replaced
        delete_row.assert_called_once_with("p1", 7, "ta-123")

    @patch("utils.appointments.delete_superseded_placeholder")
    @patch("utils.appointments.delete_calendar_event")
    @patch("utils.appointments.get_client_placeholder_appointments")
    def test_never_deletes_the_real_appointments_event(
        self, get_placeholders, delete_event, delete_row
    ):
        get_placeholders.return_value = [
            _placeholder("p1", "EVAL", REAL_START, event_id="shared-event")
        ]

        replace_placeholder_with_real_appointment(
            7, "ta-123", "EVAL", REAL_START, "shared-event"
        )

        delete_event.assert_not_called()
        delete_row.assert_called_once_with("p1", 7, "ta-123")


class TestFormatAgeAt:
    def test_under_three_shows_months(self):
        assert (
            format_age_at(date(2024, 1, 15), date(2026, 5, 20)) == "2 years, 4 months"
        )

    def test_day_of_month_not_reached(self):
        assert (
            format_age_at(date(2024, 1, 21), date(2026, 5, 20)) == "2 years, 3 months"
        )

    def test_three_and_over_shows_years_only(self):
        assert format_age_at(date(2020, 1, 15), date(2026, 5, 20)) == "6 years"

    def test_description_uses_appointment_date(self):
        description = build_placeholder_description(
            7, date(2024, 1, 15), None, date(2026, 5, 20)
        )
        assert description == "Age: 2 years, 4 months\nClient ID: 7"
