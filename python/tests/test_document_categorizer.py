from utils.document_categorizer import (
    CATEGORIES,
    build_prompt,
    header_override_category,
)


class TestHeaderOverrideCategory:
    def test_matches_known_letterhead_marker(self):
        text = "STATE OF SOUTH CAROLINA\nDISABILITY DETERMINATION SERVICES\n..."
        assert header_override_category(text) == "Records Request"

    def test_match_is_case_insensitive(self):
        text = "disability determination services letterhead"
        assert header_override_category(text) == "Records Request"

    def test_only_checks_header_characters(self):
        far_away_marker = "x" * 600 + "DISABILITY DETERMINATION SERVICES"
        assert header_override_category(far_away_marker) is None

    def test_returns_none_when_no_marker_present(self):
        assert header_override_category("Just a regular document body.") is None


class TestBuildPrompt:
    def test_includes_document_text(self):
        prompt = build_prompt("patient referral details here")
        assert "patient referral details here" in prompt

    def test_lists_every_category(self):
        prompt = build_prompt("some text")
        for category in CATEGORIES:
            assert category in prompt
