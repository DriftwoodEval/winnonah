from unittest.mock import MagicMock

import pandas as pd

from utils.appointments import (
    SyncReporter,
    batch_search_calendar_events,
    build_placeholder_title,
    parse_location_and_type,
    should_skip_appointment,
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
            service, calendars, appointments_df, reporter, npi_to_email, calendar_names
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
        )

        assert results[0]["calendar_id"] == "only@example.com"
        assert reporter.ambiguous_calendar_matches == []
