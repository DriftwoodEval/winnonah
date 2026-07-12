from datetime import date

import pandas as pd
import pytest

from utils.misc import (
    capitalize_name_with_exceptions,
    format_date,
    format_gender,
    format_phone_number,
    get_boolean_value,
    get_column,
    get_full_name,
)


class TestCapitalizeNameWithExceptions:
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("john smith", "John Smith"),
            ("MCDONALD", "McDonald"),
            ("o'brien", "O'Brien"),
            ("john smith jr", "John Smith Jr"),
            ("john smith iii", "John Smith III"),
            ("J.d.", "J.D."),
        ],
    )
    def test_capitalizes_names(self, name, expected):
        assert capitalize_name_with_exceptions(name) == expected

    def test_returns_empty_string_for_nan(self):
        assert capitalize_name_with_exceptions(float("nan")) == ""

    def test_returns_empty_string_for_non_string(self):
        assert capitalize_name_with_exceptions(None) == ""


class TestGetColumn:
    def test_returns_value_when_present(self):
        series = pd.Series({"NAME": "Test"})
        assert get_column(series, "NAME") == "Test"

    def test_returns_default_when_column_missing(self):
        series = pd.Series({"NAME": "Test"})
        assert get_column(series, "MISSING", default="fallback") == "fallback"

    def test_returns_default_when_value_is_nan(self):
        series = pd.Series({"NAME": float("nan")})
        assert get_column(series, "NAME", default="fallback") == "fallback"

    def test_returns_default_when_single_item_list_is_nan(self):
        series = pd.Series({"NAME": [float("nan")]})
        assert get_column(series, "NAME", default="fallback") == "fallback"

    def test_returns_list_value_unmodified(self):
        series = pd.Series({"NAME": ["a", "b"]})
        assert get_column(series, "NAME") == ["a", "b"]


class TestGetFullName:
    def test_combines_all_parts(self):
        assert get_full_name("John", "Smith", "Johnny") == "Johnny (John) Smith"

    def test_no_preferred_name(self):
        assert get_full_name("John", "Smith", None) == "John Smith"

    def test_only_lastname(self):
        assert get_full_name(None, "Smith", None) == "Smith"

    def test_all_missing_returns_empty_string(self):
        assert get_full_name(None, None, None) == ""


class TestFormatDate:
    def test_passes_through_date_object(self):
        assert format_date(date(2025, 2, 9)) == "2025-02-09"

    @pytest.mark.parametrize(
        ("date_str", "expected"),
        [
            ("02/09/2025", "2025-02-09"),
            ("2025-02-09 01:45:53", "2025-02-09"),
            ("2025-02-09", "2025-02-09"),
        ],
    )
    def test_parses_known_formats(self, date_str, expected):
        assert format_date(date_str) == expected

    def test_parses_jdbc_timestamp_literal(self):
        assert format_date("{ts '2025-02-09 01:45:53'}") == "2025-02-09"

    def test_returns_none_for_unparseable_date(self):
        assert format_date("not a date") is None


class TestFormatGender:
    @pytest.mark.parametrize(
        ("gender_data", "expected"),
        [
            ("male", "Male"),
            ("FEMALE", "Female"),
            ("Gender.MALE", "Male"),
        ],
    )
    def test_formats_gender(self, gender_data, expected):
        assert format_gender(gender_data) == expected

    def test_returns_none_for_non_string(self):
        assert format_gender(None) is None

    def test_returns_none_for_empty_string(self):
        assert format_gender("") is None


class TestGetBooleanValue:
    def test_string_true_is_true(self):
        row = pd.Series({"FLAG": "True"})
        assert get_boolean_value(row, "FLAG") is True

    def test_string_false_is_false(self):
        row = pd.Series({"FLAG": "False"})
        assert get_boolean_value(row, "FLAG") is False

    def test_missing_column_uses_default(self):
        row = pd.Series({})
        assert get_boolean_value(row, "FLAG", default=True) is True


class TestFormatPhoneNumber:
    def test_strips_non_digits(self):
        assert format_phone_number("(803) 555-1234") == "8035551234"

    def test_strips_leading_country_code(self):
        assert format_phone_number("18035551234") == "8035551234"

    def test_handles_float_input(self):
        assert format_phone_number(8035551234.0) == "8035551234"

    def test_returns_none_for_empty(self):
        assert format_phone_number("") is None

    def test_returns_none_for_nan(self):
        assert format_phone_number(float("nan")) is None

    def test_does_not_strip_ten_digit_leading_one(self):
        assert format_phone_number("1035551234") == "1035551234"
