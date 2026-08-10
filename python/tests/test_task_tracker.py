from unittest.mock import patch

import pytest

from utils.task_tracker import track_task


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self.lastrowid = None
        self._last_query = ""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, query, params=None):
        normalized = " ".join(query.split())
        self.conn.executed.append((normalized, params))
        self._last_query = normalized
        if "GET_LOCK" in normalized:
            pass
        elif "INSERT INTO emr_task" in normalized:
            self.conn.next_task_id += 1
            self.lastrowid = self.conn.next_task_id

    def fetchone(self):
        if "GET_LOCK" in self._last_query:
            return {"acquired": 1 if self.conn.lock_acquired else 0}
        return None


class FakeConnection:
    def __init__(self, lock_acquired=True, next_task_id=41):
        self.lock_acquired = lock_acquired
        self.next_task_id = next_task_id
        self.executed = []
        self.commits = 0
        self.closed = False

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def close(self):
        self.closed = True


def _queries_matching(conn, needle):
    return [q for q, _ in conn.executed if needle in q]


class TestTrackTaskLockAcquired:
    def test_yields_task_handle_and_inserts_running_row(self):
        conn = FakeConnection(lock_acquired=True)
        with (
            patch("utils.task_tracker.get_db", return_value=conn),
            track_task("fax_categorization", "Fax categorization") as handle,
        ):
            assert handle is not None
            assert handle.task_id == 42
        insert_queries = [
            (q, p) for q, p in conn.executed if "INSERT INTO emr_task" in q
        ]
        assert len(insert_queries) == 1
        assert insert_queries[0][1] == ("fax_categorization", "Fax categorization")

    def test_marks_completed_on_success(self):
        conn = FakeConnection(lock_acquired=True)
        with (
            patch("utils.task_tracker.get_db", return_value=conn),
            track_task("fax_categorization", "Fax categorization"),
        ):
            pass
        completed = [
            (q, p) for q, p in conn.executed if "SET status = 'completed'" in q
        ]
        assert len(completed) == 1
        assert completed[0][1] == (42,)

    def test_marks_failed_and_reraises_on_exception(self):
        conn = FakeConnection(lock_acquired=True)
        with (
            patch("utils.task_tracker.get_db", return_value=conn),
            pytest.raises(ValueError, match="boom"),
            track_task("fax_categorization", "Fax categorization"),
        ):
            raise ValueError("boom")
        failed = [
            (q, p)
            for q, p in conn.executed
            if "SET status = 'failed'" in q and "WHERE id = %s" in q
        ]
        assert len(failed) == 1
        assert failed[0][1] == ("boom", 42)

    def test_clears_orphaned_rows_before_inserting_new_row(self):
        conn = FakeConnection(lock_acquired=True)
        with (
            patch("utils.task_tracker.get_db", return_value=conn),
            track_task("fax_categorization", "Fax categorization"),
        ):
            pass
        orphan_idx = next(
            i for i, (q, _) in enumerate(conn.executed) if "Orphaned" in q
        )
        insert_idx = next(
            i for i, (q, _) in enumerate(conn.executed) if "INSERT INTO emr_task" in q
        )
        assert orphan_idx < insert_idx

    def test_releases_lock_and_closes_connection_on_success(self):
        conn = FakeConnection(lock_acquired=True)
        with (
            patch("utils.task_tracker.get_db", return_value=conn),
            track_task("fax_categorization", "Fax categorization"),
        ):
            pass
        assert _queries_matching(conn, "RELEASE_LOCK")
        assert conn.closed

    def test_releases_lock_and_closes_connection_on_failure(self):
        conn = FakeConnection(lock_acquired=True)
        with (
            patch("utils.task_tracker.get_db", return_value=conn),
            pytest.raises(ValueError),
            track_task("fax_categorization", "Fax categorization"),
        ):
            raise ValueError("boom")
        assert _queries_matching(conn, "RELEASE_LOCK")
        assert conn.closed


class TestTrackTaskLockNotAcquired:
    def test_yields_none_and_does_not_insert_row(self):
        conn = FakeConnection(lock_acquired=False)
        with (
            patch("utils.task_tracker.get_db", return_value=conn),
            track_task("fax_categorization", "Fax categorization") as handle,
        ):
            assert handle is None
        assert not _queries_matching(conn, "INSERT INTO emr_task")

    def test_closes_connection_without_releasing_lock(self):
        conn = FakeConnection(lock_acquired=False)
        with (
            patch("utils.task_tracker.get_db", return_value=conn),
            track_task("fax_categorization", "Fax categorization"),
        ):
            pass
        assert conn.closed
        assert not _queries_matching(conn, "RELEASE_LOCK")


class TestTaskHandleProgress:
    def test_updates_progress_fields(self):
        conn = FakeConnection(lock_acquired=True)
        with (
            patch("utils.task_tracker.get_db", return_value=conn),
            track_task("fax_categorization", "Fax categorization") as handle,
        ):
            assert handle is not None
            handle.progress(5, total=10, detail="halfway")
        progress_queries = [(q, p) for q, p in conn.executed if "progress_current" in q]
        assert len(progress_queries) == 1
        assert progress_queries[0][1] == (5, 10, "halfway", 42)

    def test_detail_defaults_to_none(self):
        conn = FakeConnection(lock_acquired=True)
        with (
            patch("utils.task_tracker.get_db", return_value=conn),
            track_task("fax_categorization", "Fax categorization") as handle,
        ):
            assert handle is not None
            handle.progress(3)
        progress_queries = [(q, p) for q, p in conn.executed if "progress_current" in q]
        assert progress_queries[0][1] == (3, None, None, 42)
