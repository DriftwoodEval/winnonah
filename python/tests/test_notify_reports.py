from unittest.mock import patch

from notify_reports import check_report_queue_and_notify


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self._last_query = ""
        self._last_params: tuple | None = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, query, params: tuple | None = None):
        normalized = " ".join(query.split())
        self.conn.executed.append((normalized, params))
        self._last_query = normalized
        self._last_params = params
        if normalized.startswith("INSERT INTO emr_seen_report_folders") and params:
            self.conn.seen_folder_ids.add(params[0])

    def fetchone(self):
        if self._last_query.startswith("SELECT folderId") and self._last_params:
            folder_id = self._last_params[0]
            if folder_id in self.conn.seen_folder_ids:
                return {"folderId": folder_id}
            return None
        return None


class FakeConnection:
    def __init__(self, seen_folder_ids=None):
        self.seen_folder_ids = set(seen_folder_ids or [])
        self.executed = []
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1


def _patch_db(seen_folder_ids=None):
    return patch(
        "notify_reports.get_db",
        return_value=FakeConnection(seen_folder_ids=seen_folder_ids),
    )


class TestNoFolders:
    def test_returns_without_querying_db_when_no_items(self):
        with (
            patch("notify_reports.get_items_in_folder", return_value=[]),
            patch("notify_reports.get_db") as mock_get_db,
            patch("notify_reports.send_gmail") as mock_send,
        ):
            check_report_queue_and_notify()
        mock_get_db.assert_not_called()
        mock_send.assert_not_called()


class TestAllFoldersAlreadySeen:
    def test_no_notifications_sent(self):
        items = [{"id": "folder-1", "name": "Report [ABC123]"}]
        with (
            patch("notify_reports.get_items_in_folder", return_value=items),
            _patch_db(seen_folder_ids={"folder-1"}),
            patch("notify_reports.get_queue_notify_users") as mock_users,
            patch("notify_reports.send_gmail") as mock_send,
        ):
            check_report_queue_and_notify()
        mock_users.assert_not_called()
        mock_send.assert_not_called()


class TestNoEligibleUsers:
    def test_no_notification_and_folder_not_marked_seen(self):
        items = [{"id": "folder-1", "name": "Report [ABC123]"}]
        conn = FakeConnection()
        with (
            patch("notify_reports.get_items_in_folder", return_value=items),
            patch("notify_reports.get_db", return_value=conn),
            patch("notify_reports.get_queue_notify_users", return_value=[]),
            patch("notify_reports.send_gmail") as mock_send,
        ):
            check_report_queue_and_notify()
        mock_send.assert_not_called()
        assert "folder-1" not in conn.seen_folder_ids


class TestNewFolderWithoutClientId:
    def test_notifies_all_eligible_users_and_marks_seen(self):
        items = [{"id": "folder-1", "name": "General Report Folder"}]
        conn = FakeConnection()
        users = [
            {"email": "a@example.com", "blocked_evaluator_npis": None},
            {"email": "b@example.com", "blocked_evaluator_npis": None},
        ]
        with (
            patch("notify_reports.get_items_in_folder", return_value=items),
            patch("notify_reports.get_db", return_value=conn),
            patch("notify_reports.get_queue_notify_users", return_value=users),
            patch(
                "notify_reports.get_most_recent_non_billing_evaluator_npi"
            ) as mock_npi,
            patch("notify_reports.send_gmail") as mock_send,
        ):
            check_report_queue_and_notify()
        mock_npi.assert_not_called()
        assert mock_send.call_count == 2
        sent_to = {call.kwargs["to_addr"] for call in mock_send.call_args_list}
        assert sent_to == {"a@example.com", "b@example.com"}
        assert "folder-1" in conn.seen_folder_ids


class TestNewFolderWithClientId:
    def test_extracts_client_id_and_looks_up_evaluator_npi(self):
        items = [{"id": "folder-1", "name": "Report [ABC-123]"}]
        conn = FakeConnection()
        users = [{"email": "a@example.com", "blocked_evaluator_npis": None}]
        with (
            patch("notify_reports.get_items_in_folder", return_value=items),
            patch("notify_reports.get_db", return_value=conn),
            patch("notify_reports.get_queue_notify_users", return_value=users),
            patch(
                "notify_reports.get_most_recent_non_billing_evaluator_npi",
                return_value=1234567890,
            ) as mock_npi,
            patch("notify_reports.send_gmail") as mock_send,
        ):
            check_report_queue_and_notify()
        mock_npi.assert_called_once_with("ABC-123")
        mock_send.assert_called_once()

    def test_skips_user_who_blocked_the_evaluator(self):
        items = [{"id": "folder-1", "name": "Report [ABC-123]"}]
        conn = FakeConnection()
        users = [
            {
                "email": "blocked@example.com",
                "blocked_evaluator_npis": "[1234567890]",
            },
            {"email": "allowed@example.com", "blocked_evaluator_npis": None},
        ]
        with (
            patch("notify_reports.get_items_in_folder", return_value=items),
            patch("notify_reports.get_db", return_value=conn),
            patch("notify_reports.get_queue_notify_users", return_value=users),
            patch(
                "notify_reports.get_most_recent_non_billing_evaluator_npi",
                return_value=1234567890,
            ),
            patch("notify_reports.send_gmail") as mock_send,
        ):
            check_report_queue_and_notify()
        mock_send.assert_called_once()
        assert mock_send.call_args.kwargs["to_addr"] == "allowed@example.com"

    def test_no_client_id_in_folder_name_skips_npi_lookup(self):
        items = [{"id": "folder-1", "name": "Miscellaneous Reports"}]
        conn = FakeConnection()
        users = [{"email": "a@example.com", "blocked_evaluator_npis": None}]
        with (
            patch("notify_reports.get_items_in_folder", return_value=items),
            patch("notify_reports.get_db", return_value=conn),
            patch("notify_reports.get_queue_notify_users", return_value=users),
            patch(
                "notify_reports.get_most_recent_non_billing_evaluator_npi"
            ) as mock_npi,
            patch("notify_reports.send_gmail"),
        ):
            check_report_queue_and_notify()
        mock_npi.assert_not_called()


class TestMultipleFolders:
    def test_only_new_folders_are_processed(self):
        items = [
            {"id": "folder-seen", "name": "Old Report"},
            {"id": "folder-new", "name": "New Report"},
        ]
        conn = FakeConnection(seen_folder_ids={"folder-seen"})
        users = [{"email": "a@example.com", "blocked_evaluator_npis": None}]
        with (
            patch("notify_reports.get_items_in_folder", return_value=items),
            patch("notify_reports.get_db", return_value=conn),
            patch("notify_reports.get_queue_notify_users", return_value=users),
            patch("notify_reports.get_most_recent_non_billing_evaluator_npi"),
            patch("notify_reports.send_gmail") as mock_send,
        ):
            check_report_queue_and_notify()
        mock_send.assert_called_once()
        assert "New Report" in mock_send.call_args.kwargs["subject"]
        assert conn.seen_folder_ids == {"folder-seen", "folder-new"}
