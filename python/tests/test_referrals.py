import pandas as pd
import pytest

from utils.referrals import format_name, process_source_metadata


class TestFormatName:
    def test_title_cases_simple_name(self):
        assert format_name("dr john smith") == "Dr John Smith"

    def test_preserves_known_acronyms(self):
        assert format_name("musc childrens hospital") == "MUSC Childrens Hospital"

    def test_strips_parenthetical_notes(self):
        assert format_name("Dr Smith (referring physician)") == "Dr Smith"

    def test_strips_digits_and_punctuation(self):
        assert format_name("Dr. Smith 843-555-1234") == "Dr Smith"

    def test_collapses_extra_whitespace(self):
        assert format_name("John    Smith") == "John Smith"


class TestProcessSourceMetadata:
    def test_returns_none_for_nan(self):
        assert process_source_metadata(float("nan")) is None

    @pytest.mark.parametrize(
        "source", ["Unknown", "No Referral Source", "", "BabyNet", "  babynet  "]
    )
    def test_returns_none_for_ignored_sources(self, source):
        assert process_source_metadata(source) is None

    def test_returns_none_when_fax_digits_not_ten(self):
        assert process_source_metadata("Dr Smith 555-1234") is None

    def test_extracts_and_formats_valid_source(self):
        result = process_source_metadata("Dr Smith 843-555-1234")
        assert result == {
            "name": "Dr Smith",
            "fax": "8435551234",
            "fax_pretty": "(843) 555-1234",
        }

    def test_uses_pandas_isna_for_missing_value_check(self):
        assert process_source_metadata(pd.NA) is None
