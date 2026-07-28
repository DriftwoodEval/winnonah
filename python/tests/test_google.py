from unittest.mock import MagicMock, patch

from utils.google import get_punchlist_language_map


def _mock_sheets_service(rows: list[list[str]]):
    service = MagicMock()
    service.spreadsheets.return_value.values.return_value.get.return_value.execute.return_value = {
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
