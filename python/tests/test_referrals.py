import pandas as pd
import pymupdf
import pytest

from utils.referrals import generate_pdf, process_source_metadata


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


class TestGeneratePdf:
    def test_produces_a_single_page_pdf(self):
        data = generate_pdf("Dr Smith", [{"FULL_NAME": "Jane Doe"}])
        doc = pymupdf.open(stream=data, filetype="pdf")
        assert doc.page_count == 1

    def test_includes_referral_name_and_clients(self):
        data = generate_pdf(
            "Dr Smith", [{"FULL_NAME": "Jane Doe"}, {"FULL_NAME": "John Roe"}]
        )
        doc = pymupdf.open(stream=data, filetype="pdf")
        text = doc[0].get_text()
        assert "Hi Dr Smith," in text
        assert "Jane Doe" in text
        assert "John Roe" in text

    def test_handles_empty_client_group(self):
        data = generate_pdf("Dr Smith", [])
        doc = pymupdf.open(stream=data, filetype="pdf")
        assert doc.page_count == 1
