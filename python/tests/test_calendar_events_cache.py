from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest

from utils import google

START = datetime(2026, 11, 25, tzinfo=UTC)
END = datetime(2026, 11, 26, tzinfo=UTC)


@pytest.fixture(autouse=True)
def fake_google(monkeypatch):
    google.clear_calendar_events_cache()
    monkeypatch.setattr(google, "google_authenticate", MagicMock())
    fetch = MagicMock(side_effect=lambda _creds, cid, *_: [{"id": cid}])
    monkeypatch.setattr(google, "_list_calendar_events", fetch)
    yield fetch
    google.clear_calendar_events_cache()


def test_second_call_is_served_from_cache(fake_google):
    first = google.list_calendar_events_batch(["a", "b"], START, END)
    second = google.list_calendar_events_batch(["a", "b"], START, END)

    assert first == second == {"a": [{"id": "a"}], "b": [{"id": "b"}]}
    assert fake_google.call_count == 2


def test_clearing_the_cache_refetches(fake_google):
    google.list_calendar_events_batch(["a"], START, END)
    google.clear_calendar_events_cache()
    google.list_calendar_events_batch(["a"], START, END)

    assert fake_google.call_count == 2


def test_failed_calendar_is_empty_and_not_cached(fake_google):
    fake_google.side_effect = lambda *_: None
    assert google.list_calendar_events_batch(["a"], START, END) == {"a": []}
    google.list_calendar_events_batch(["a"], START, END)

    assert fake_google.call_count == 2
