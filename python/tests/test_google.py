from datetime import datetime
from typing import cast
from unittest.mock import MagicMock, patch

import pandas as pd

from utils.google import (
    _compute_age,
    _find_client_info_file,
    _patch_info_lines,
    _sync_client_info_file,
    build_client_lookup,
    client_match_confidence,
    get_punchlist_language_map,
    levenshtein,
    normalize_name_tokens,
)


def _mock_sheets_service(rows: list[list[str]]):
    service = MagicMock()
    service.spreadsheets.return_value.values.return_value.get.return_value.execute.return_value = {  # noqa: PD011 (Sheets API .values(), not a DataFrame)
        "values": rows
    }
    return service


class TestGetPunchlistLanguageMap:
    def test_maps_client_id_to_language(self):
        rows = [
            ["Client ID", "Client Name", "Language"],
            ["12345", "Testman Testson", "Spanish"],
        ]
        with patch(
            "utils.google.get_sheets_service", return_value=_mock_sheets_service(rows)
        ):
            assert get_punchlist_language_map() == {"12345": "Spanish"}

    def test_blank_language_cell_maps_to_english(self):
        rows = [
            ["Client ID", "Client Name", "Language"],
            ["12345", "Testman Testson", ""],
        ]
        with patch(
            "utils.google.get_sheets_service", return_value=_mock_sheets_service(rows)
        ):
            assert get_punchlist_language_map() == {"12345": "English"}

    def test_row_shorter_than_language_column_maps_to_english(self):
        rows = [
            ["Client ID", "Client Name", "Language"],
            ["12345", "Testman Testson"],
        ]
        with patch(
            "utils.google.get_sheets_service", return_value=_mock_sheets_service(rows)
        ):
            assert get_punchlist_language_map() == {"12345": "English"}

    def test_client_not_on_punchlist_is_absent_from_map(self):
        rows = [
            ["Client ID", "Client Name", "Language"],
            ["12345", "Testman Testson", "Spanish"],
        ]
        with patch(
            "utils.google.get_sheets_service", return_value=_mock_sheets_service(rows)
        ):
            language_map = get_punchlist_language_map()
        assert "99999" not in language_map

    def test_empty_sheet_returns_empty_map(self):
        with patch(
            "utils.google.get_sheets_service", return_value=_mock_sheets_service([])
        ):
            assert get_punchlist_language_map() == {}

    def test_missing_language_column_returns_empty_map(self):
        rows = [
            ["Client ID", "Client Name"],
            ["12345", "Testman Testson"],
        ]
        with patch(
            "utils.google.get_sheets_service", return_value=_mock_sheets_service(rows)
        ):
            assert get_punchlist_language_map() == {}


class TestNormalizeNameTokens:
    def test_lowercases_and_splits_on_whitespace(self):
        assert normalize_name_tokens("John Smith") == {"john", "smith"}

    def test_strips_punctuation(self):
        assert normalize_name_tokens("Smith-Doe, Jr.") == {"smith", "doe", "jr"}

    def test_returns_empty_set_for_empty_string(self):
        assert normalize_name_tokens("") == set()

    def test_returns_empty_set_for_none(self):
        # Falsy-input guard: no real caller passes None, but the function
        # defends against it, so verify at runtime via a type-check cast.
        assert normalize_name_tokens(cast(str, None)) == set()

    def test_collapses_double_spaces(self):
        assert normalize_name_tokens("John   Smith") == {"john", "smith"}


class TestLevenshtein:
    def test_identical_strings_have_zero_distance(self):
        assert levenshtein("smith", "smith") == 0

    def test_empty_first_string_returns_length_of_second(self):
        assert levenshtein("", "abc") == 3

    def test_empty_second_string_returns_length_of_first(self):
        assert levenshtein("abc", "") == 3

    def test_single_substitution(self):
        assert levenshtein("smith", "smyth") == 1

    def test_single_insertion(self):
        assert levenshtein("smith", "smithy") == 1

    def test_single_letter_substitution_in_longer_word(self):
        assert levenshtein("jonathan", "jonathon") == 1

    def test_adjacent_transposition_counts_as_two_edits(self):
        assert levenshtein("ab", "ba") == 2


class TestClientMatchConfidence:
    def test_exact_match_returns_full_confidence(self):
        tokens = {"john", "smith"}
        assert client_match_confidence(tokens, tokens) == 1.0

    def test_returns_none_for_empty_client_tokens(self):
        assert client_match_confidence(set(), {"john", "smith"}) is None

    def test_returns_none_for_empty_name_tokens(self):
        assert client_match_confidence({"john", "smith"}, set()) is None

    def test_returns_none_when_tokens_are_too_different(self):
        assert client_match_confidence({"john", "smith"}, {"alice", "jones"}) is None

    def test_small_typo_returns_reduced_confidence_below_one(self):
        confidence = client_match_confidence(
            {"jonathan", "smith"}, {"jonathon", "smith"}
        )
        assert confidence is not None
        assert 0.0 < confidence < 1.0

    def test_short_token_has_less_typo_tolerance(self):
        # "al" (2 chars, max_allowed=1) vs "ed" (edit distance 2) shouldn't match.
        assert client_match_confidence({"al"}, {"ed"}) is None


class TestBuildClientLookup:
    def test_builds_one_entry_per_client(self):
        df = pd.DataFrame(
            {
                "CLIENT_ID": [1],
                "FIRSTNAME": ["John"],
                "LASTNAME": ["Smith"],
                "PREFERRED_NAME": [None],
            }
        )
        lookup = build_client_lookup(df)
        assert len(lookup) == 1
        assert lookup[0]["id"] == 1
        assert lookup[0]["tokens"] == {"john", "smith"}

    def test_adds_extra_entry_for_distinct_preferred_name(self):
        df = pd.DataFrame(
            {
                "CLIENT_ID": [1],
                "FIRSTNAME": ["Jonathan"],
                "LASTNAME": ["Smith"],
                "PREFERRED_NAME": ["Johnny"],
            }
        )
        lookup = build_client_lookup(df)
        assert len(lookup) == 2
        assert {"jonathan", "smith"} in [entry["tokens"] for entry in lookup]
        assert {"johnny", "smith"} in [entry["tokens"] for entry in lookup]

    def test_does_not_duplicate_when_preferred_name_matches_first_name(self):
        df = pd.DataFrame(
            {
                "CLIENT_ID": [1],
                "FIRSTNAME": ["John"],
                "LASTNAME": ["Smith"],
                "PREFERRED_NAME": ["John"],
            }
        )
        lookup = build_client_lookup(df)
        assert len(lookup) == 1


class TestComputeAge:
    def test_computes_age_for_birthday_already_passed_this_year(self):
        today = datetime.now()
        dob = datetime(today.year - 30, 1, 1)
        assert _compute_age(dob) == 30

    def test_computes_age_for_birthday_not_yet_reached_this_year(self):
        today = datetime.now()
        dob = datetime(today.year - 30, 12, 31)
        assert _compute_age(dob) == 29


class TestPatchInfoLines:
    def test_overwrites_matching_prefix_line(self):
        content = "John Smith\nDOB: 01/01/2000\nAge: 25"
        result = _patch_info_lines(content, {"DOB:": "02/02/2000"})
        assert "DOB: 02/02/2000" in result
        assert "01/01/2000" not in result

    def test_appends_missing_prefix_as_new_line(self):
        content = "John Smith"
        result = _patch_info_lines(content, {"Evaluator:": "Dr. Jones"})
        assert result.splitlines()[-1] == "Evaluator: Dr. Jones"

    def test_preserves_unrelated_lines(self):
        content = "John Smith\nStaff note: call before visit"
        result = _patch_info_lines(content, {"DOB:": "01/01/2000"})
        assert "Staff note: call before visit" in result.splitlines()

    def test_updates_multiple_fields(self):
        content = "John Smith\nDOB: 01/01/2000\nAge: 25"
        result = _patch_info_lines(content, {"DOB:": "02/02/2000", "Age:": "26"})
        lines = result.splitlines()
        assert "DOB: 02/02/2000" in lines
        assert "Age: 26" in lines


def _mock_drive_files_list(pages: list[dict]):
    files_mock = MagicMock()
    files_mock.list.return_value.execute.side_effect = pages
    return files_mock


class TestFindClientInfoFile:
    def test_returns_matching_txt_file(self):
        service = MagicMock()
        service.files.return_value = _mock_drive_files_list(
            [{"files": [{"id": "f1", "name": "0 - John Smith info.txt"}]}]
        )
        result = _find_client_info_file(service, "folder-1")
        assert result == {"id": "f1", "name": "0 - John Smith info.txt"}

    def test_returns_none_when_no_matching_file(self):
        service = MagicMock()
        service.files.return_value = _mock_drive_files_list([{"files": []}])
        assert _find_client_info_file(service, "folder-1") is None

    def test_ignores_non_txt_matches(self):
        service = MagicMock()
        service.files.return_value = _mock_drive_files_list(
            [{"files": [{"id": "f1", "name": "0 - other.pdf"}]}]
        )
        assert _find_client_info_file(service, "folder-1") is None

    def test_follows_pagination(self):
        service = MagicMock()
        service.files.return_value = _mock_drive_files_list(
            [
                {"files": [], "nextPageToken": "page2"},
                {"files": [{"id": "f2", "name": "0 - info.txt"}]},
            ]
        )
        result = _find_client_info_file(service, "folder-1")
        assert result == {"id": "f2", "name": "0 - info.txt"}


class TestSyncClientInfoFile:
    def test_creates_new_file_when_none_exists(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": []
        }
        row = {
            "driveId": "folder-1",
            "fullName": "John Smith",
            "dob": datetime(2000, 1, 1),
            "startTime": datetime(2026, 3, 5),
            "providerName": "Dr. Jones",
        }
        _sync_client_info_file(service, row)
        service.files.return_value.create.assert_called_once()
        create_kwargs = service.files.return_value.create.call_args.kwargs
        assert create_kwargs["body"]["name"] == "0 - John Smith info.txt"
        assert create_kwargs["body"]["parents"] == ["folder-1"]

    def test_adds_beth_note_when_provider_is_beth(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": []
        }
        row = {
            "driveId": "folder-1",
            "fullName": "John Smith",
            "dob": datetime(2000, 1, 1),
            "startTime": datetime(2026, 3, 5),
            "providerName": "Beth Evaluator",
        }
        _sync_client_info_file(service, row)
        media = service.files.return_value.create.call_args.kwargs["media_body"]
        content = media.getbytes(0, media.size()).decode()
        assert "Include Beth's notes" in content

    def test_updates_existing_file_preserving_name_change(self):
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [{"id": "existing-1", "name": "0 - John Smith info.txt"}]
        }
        service.files.return_value.get_media.return_value.execute.return_value = (
            b"Old Name\nDOB 01/01/1999\nAge 26"
        )
        row = {
            "driveId": "folder-1",
            "fullName": "John Smith",
            "dob": datetime(2000, 1, 1),
            "startTime": datetime(2026, 3, 5),
            "providerName": "Dr. Jones",
        }
        _sync_client_info_file(service, row)
        service.files.return_value.update.assert_called_once()
        update_kwargs = service.files.return_value.update.call_args.kwargs
        assert update_kwargs["fileId"] == "existing-1"
        media = update_kwargs["media_body"]
        content = media.getbytes(0, media.size()).decode()
        assert content.startswith("John Smith")
        assert "DOB 01/01/2000" in content
