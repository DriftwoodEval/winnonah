"""Requests made while a PDF check runs join its task instead of starting another."""

import threading
from contextlib import contextmanager
from unittest.mock import MagicMock

from cron import questionnaire_pdf_check as check


def test_queued_requests_share_one_task_with_growing_total(monkeypatch):
    first_started = threading.Event()
    release_first = threading.Event()
    tasks_opened = []
    progress = []

    task = MagicMock()
    task.progress.side_effect = lambda done, total: progress.append((done, total))

    @contextmanager
    def fake_track_task(*_args):
        tasks_opened.append(1)
        yield task

    def fake_list_files(_drive_id):
        first_started.set()
        release_first.wait(timeout=5)
        return []

    rows = {
        1: [{"id": 1, "type": "ASQ", "drive_id": "d1"}],
        2: [{"id": 2, "type": "ASQ", "drive_id": "d2"}],
    }
    monkeypatch.setattr(check, "select_rows", lambda _client, qid, _all_time: rows[qid])
    monkeypatch.setattr(check, "track_task", fake_track_task)
    monkeypatch.setattr(check, "db_session", MagicMock())
    monkeypatch.setattr(check, "list_files_recursive", fake_list_files)
    monkeypatch.setattr(check, "find_pdf", lambda _files, _type: None)

    results = {}
    t1 = threading.Thread(
        target=lambda: results.update(a=check.check_questionnaire_pdfs(None, 1))
    )
    t1.start()
    assert first_started.wait(timeout=5)
    t2 = threading.Thread(
        target=lambda: results.update(b=check.check_questionnaire_pdfs(None, 2))
    )
    t2.start()
    while not check._state.queue:  # noqa: SLF001 - second request is queued behind the first
        pass
    release_first.set()
    t1.join(timeout=5)
    t2.join(timeout=5)

    assert len(tasks_opened) == 1
    assert progress[0] == (0, 1)  # the bar shows before the first row finishes
    assert progress[-1] == (2, 2)  # the second request grew the total
    assert results == {"a": (0, 1), "b": (0, 1)}
