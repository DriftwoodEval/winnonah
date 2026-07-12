from datetime import datetime

from utils.fax import (
    extract_fax_number,
    format_date,
    format_fax_number,
    pretty_name,
)


class TestExtractFaxNumber:
    def test_extracts_digits_from_formatted_number(self):
        assert extract_fax_number("Dr Smith (843) 555-1234") == "8435551234"

    def test_extracts_digits_with_dashes(self):
        assert extract_fax_number("Dr Smith 843-555-1234") == "8435551234"

    def test_returns_none_for_empty_string(self):
        assert extract_fax_number("") is None

    def test_returns_none_when_no_number_present(self):
        assert extract_fax_number("Dr Smith no fax on file") is None

    def test_returns_none_for_too_short_number(self):
        assert extract_fax_number("Dr Smith 123-4567") is None


class TestFormatFaxNumber:
    def test_formats_ten_digit_string(self):
        assert format_fax_number("8435551234") == "(843) 555-1234"

    def test_strips_non_digits_before_formatting(self):
        assert format_fax_number("(843) 555-1234") == "(843) 555-1234"

    def test_returns_none_for_wrong_length(self):
        assert format_fax_number("12345") is None

    def test_returns_none_for_empty_input(self):
        assert format_fax_number("") is None


class TestFormatDate:
    def test_formats_datetime_object(self):
        assert format_date(datetime(2026, 3, 5)) == "03/05/26"

    def test_parses_string_date(self):
        assert format_date("2026-03-05") == "03/05/26"


class TestPrettyName:
    def test_combines_formatted_name_and_fax_number(self):
        assert pretty_name("dr smith 843-555-1234") == "Dr Smith (843) 555-1234"

    def test_returns_none_when_no_fax_number_found(self):
        assert pretty_name("dr smith no fax") is None
