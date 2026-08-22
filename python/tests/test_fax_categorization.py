from unittest.mock import MagicMock, patch

from fax_categorization import (
    _already_seen_drive_file_ids,
    _match_clients,
    process_faxes,
)


def _client(client_id, tokens):
    return {"id": client_id, "tokens": tokens}


class TestMatchClients:
    def test_exact_name_match_gets_full_confidence(self):
        client_lookup = [_client(1, {"john", "smith"})]
        matched = _match_clients(["John Smith"], client_lookup)
        assert matched == {1: ("John Smith", 1.0)}

    def test_typo_in_name_still_matches_with_lower_confidence(self):
        client_lookup = [_client(1, {"jonathan", "smith"})]
        matched = _match_clients(["Jonathon Smith"], client_lookup)
        assert 1 in matched
        assert matched[1][1] < 1.0

    def test_unrelated_name_does_not_match(self):
        client_lookup = [_client(1, {"john", "smith"})]
        matched = _match_clients(["Alice Jones"], client_lookup)
        assert matched == {}

    def test_no_extracted_names_returns_empty(self):
        client_lookup = [_client(1, {"john", "smith"})]
        assert _match_clients([], client_lookup) == {}

    def test_keeps_best_match_across_multiple_names_for_same_client(self):
        client_lookup = [_client(1, {"john", "smith"})]
        matched = _match_clients(["Jonh Smith", "John Smith"], client_lookup)
        assert matched[1] == ("John Smith", 1.0)

    def test_matches_multiple_distinct_clients(self):
        client_lookup = [
            _client(1, {"john", "smith"}),
            _client(2, {"alice", "jones"}),
        ]
        matched = _match_clients(["John Smith", "Alice Jones"], client_lookup)
        assert set(matched.keys()) == {1, 2}


class TestAlreadySeenDriveFileIds:
    def test_returns_set_of_seen_ids(self):
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {"driveFileId": "abc"},
            {"driveFileId": "def"},
        ]
        cursor.__enter__.return_value = cursor
        conn = MagicMock()
        conn.cursor.return_value = cursor
        conn.__enter__.return_value = conn
        with patch("fax_categorization.db_session", return_value=conn):
            result = _already_seen_drive_file_ids()
        assert result == {"abc", "def"}

    def test_returns_empty_set_when_no_rows(self):
        cursor = MagicMock()
        cursor.fetchall.return_value = []
        cursor.__enter__.return_value = cursor
        conn = MagicMock()
        conn.cursor.return_value = cursor
        conn.__enter__.return_value = conn
        with patch("fax_categorization.db_session", return_value=conn):
            result = _already_seen_drive_file_ids()
        assert result == set()


class TestProcessFaxes:
    def test_returns_early_when_folder_id_not_set(self, monkeypatch):
        monkeypatch.delenv("FAX_CATEGORIZATION_FOLDER_ID", raising=False)
        with patch("fax_categorization.track_task") as mock_track:
            process_faxes()
        mock_track.assert_not_called()

    def test_skips_when_another_run_holds_the_lock(self, monkeypatch):
        monkeypatch.setenv("FAX_CATEGORIZATION_FOLDER_ID", "folder-1")
        track_cm = MagicMock()
        track_cm.__enter__.return_value = None
        track_cm.__exit__.return_value = False
        with (
            patch("fax_categorization.track_task", return_value=track_cm),
            patch("fax_categorization.list_files_in_folder") as mock_list,
        ):
            process_faxes()
        mock_list.assert_not_called()

    def test_returns_when_no_new_or_reprocess_faxes(self, monkeypatch):
        monkeypatch.setenv("FAX_CATEGORIZATION_FOLDER_ID", "folder-1")
        task = MagicMock()
        track_cm = MagicMock()
        track_cm.__enter__.return_value = task
        track_cm.__exit__.return_value = False
        with (
            patch("fax_categorization.track_task", return_value=track_cm),
            patch("fax_categorization.list_files_in_folder", return_value=[]),
            patch(
                "fax_categorization._already_seen_drive_file_ids", return_value=set()
            ),
            patch("fax_categorization._reprocess_requested_faxes", return_value=[]),
            patch("fax_categorization.build_client_lookup") as mock_lookup,
        ):
            process_faxes()
        mock_lookup.assert_not_called()

    def test_returns_when_all_files_already_seen_and_none_reprocessing(
        self, monkeypatch
    ):
        monkeypatch.setenv("FAX_CATEGORIZATION_FOLDER_ID", "folder-1")
        task = MagicMock()
        track_cm = MagicMock()
        track_cm.__enter__.return_value = task
        track_cm.__exit__.return_value = False
        files = [{"id": "file-1", "name": "fax.pdf"}]
        with (
            patch("fax_categorization.track_task", return_value=track_cm),
            patch("fax_categorization.list_files_in_folder", return_value=files),
            patch(
                "fax_categorization._already_seen_drive_file_ids",
                return_value={"file-1"},
            ),
            patch("fax_categorization._reprocess_requested_faxes", return_value=[]),
            patch("fax_categorization.build_client_lookup") as mock_lookup,
        ):
            process_faxes()
        mock_lookup.assert_not_called()

    def test_raises_when_llm_fails_to_load(self, monkeypatch):
        monkeypatch.setenv("FAX_CATEGORIZATION_FOLDER_ID", "folder-1")
        task = MagicMock()
        track_cm = MagicMock()
        track_cm.__enter__.return_value = task
        track_cm.__exit__.return_value = False
        files = [{"id": "file-1", "name": "fax.pdf"}]
        with (
            patch("fax_categorization.track_task", return_value=track_cm),
            patch("fax_categorization.list_files_in_folder", return_value=files),
            patch(
                "fax_categorization._already_seen_drive_file_ids", return_value=set()
            ),
            patch("fax_categorization._reprocess_requested_faxes", return_value=[]),
            patch("fax_categorization.build_client_lookup", return_value=[]),
            patch("fax_categorization.get_all_clients", return_value=[]),
            patch("fax_categorization.limit_cpu_usage"),
            patch("fax_categorization.load_model", return_value=None),
            patch("fax_categorization._process_fax") as mock_process,
        ):
            try:
                process_faxes()
                raised = False
            except RuntimeError:
                raised = True
        assert raised
        mock_process.assert_not_called()

    def test_processes_each_new_file_and_continues_after_a_failure(self, monkeypatch):
        monkeypatch.setenv("FAX_CATEGORIZATION_FOLDER_ID", "folder-1")
        task = MagicMock()
        track_cm = MagicMock()
        track_cm.__enter__.return_value = task
        track_cm.__exit__.return_value = False
        files = [
            {"id": "file-1", "name": "fax1.pdf"},
            {"id": "file-2", "name": "fax2.pdf"},
        ]
        with (
            patch("fax_categorization.track_task", return_value=track_cm),
            patch("fax_categorization.list_files_in_folder", return_value=files),
            patch(
                "fax_categorization._already_seen_drive_file_ids", return_value=set()
            ),
            patch("fax_categorization._reprocess_requested_faxes", return_value=[]),
            patch("fax_categorization.build_client_lookup", return_value=[]),
            patch("fax_categorization.get_all_clients", return_value=[]),
            patch("fax_categorization.limit_cpu_usage"),
            patch("fax_categorization.load_model", return_value=MagicMock()),
            patch(
                "fax_categorization._process_fax",
                side_effect=[Exception("boom"), None],
            ) as mock_process,
        ):
            process_faxes()
        assert mock_process.call_count == 2

    def test_reprocesses_requested_faxes_and_continues_after_a_failure(
        self, monkeypatch
    ):
        monkeypatch.setenv("FAX_CATEGORIZATION_FOLDER_ID", "folder-1")
        task = MagicMock()
        track_cm = MagicMock()
        track_cm.__enter__.return_value = task
        track_cm.__exit__.return_value = False
        reprocess_faxes = [
            {"id": 1, "driveFileId": "file-1", "fileName": "fax1.pdf"},
            {"id": 2, "driveFileId": "file-2", "fileName": "fax2.pdf"},
        ]
        with (
            patch("fax_categorization.track_task", return_value=track_cm),
            patch("fax_categorization.list_files_in_folder", return_value=[]),
            patch(
                "fax_categorization._already_seen_drive_file_ids", return_value=set()
            ),
            patch(
                "fax_categorization._reprocess_requested_faxes",
                return_value=reprocess_faxes,
            ),
            patch("fax_categorization.build_client_lookup", return_value=[]),
            patch("fax_categorization.get_all_clients", return_value=[]),
            patch("fax_categorization.limit_cpu_usage"),
            patch("fax_categorization.load_model", return_value=MagicMock()),
            patch(
                "fax_categorization._reprocess_fax",
                side_effect=[Exception("boom"), None],
            ) as mock_reprocess,
        ):
            process_faxes()
        assert mock_reprocess.call_count == 2
