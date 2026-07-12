from pathlib import Path

from categorize_documents import _expected_category


class TestExpectedCategory:
    def test_extracts_category_after_last_underscore(self):
        assert _expected_category(Path("case123_Referral.pdf")) == "Referral"

    def test_handles_category_with_space(self):
        assert (
            _expected_category(Path("case123_Records Request.pdf")) == "Records Request"
        )

    def test_uses_segment_after_last_underscore_when_multiple_present(self):
        assert _expected_category(Path("case_123_Insurance.pdf")) == "Insurance"

    def test_returns_none_when_no_underscore(self):
        assert _expected_category(Path("case123.pdf")) is None

    def test_returns_none_when_suffix_is_not_a_known_category(self):
        assert _expected_category(Path("case123_NotACategory.pdf")) is None
