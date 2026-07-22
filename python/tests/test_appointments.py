import pandas as pd

from utils.appointments import (
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
