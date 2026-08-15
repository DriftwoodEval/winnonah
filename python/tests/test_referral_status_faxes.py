import datetime as dt
from datetime import date, timedelta
from unittest.mock import patch

from referral_status_faxes import (
    fetch_referral_statuses,
    get_last_sent_dates,
    is_due,
    months_elapsed,
    most_recent_milestone,
    send_referral_status_faxes,
)

TODAY = date(2026, 6, 15)
CUTOFF = TODAY - timedelta(days=90)  # approximates "3 months ago" for these tests


def _client(
    client_id=1,
    full_name="Jane Doe",
    referral_source="Dr Smith 843-555-1234",
    added_date=None,
    status_text="Waiting on questionnaires",
    done=False,
):
    return {
        "clientId": client_id,
        "fullName": full_name,
        "referralSource": referral_source,
        "addedDate": (added_date or (date.today() - timedelta(days=100))).isoformat(),
        "statusText": status_text,
        "done": done,
    }


class TestFetchReferralStatuses:
    def test_returns_empty_list_when_api_key_missing(self, monkeypatch):
        monkeypatch.delenv("API_KEY", raising=False)
        assert fetch_referral_statuses() == []

    def test_calls_internal_route_with_bearer_auth(self, monkeypatch):
        monkeypatch.setenv("API_KEY", "secret")
        monkeypatch.setenv("EMR_APP_URL", "https://example.com")

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return [_client()]

        with patch(
            "referral_status_faxes.requests.get", return_value=FakeResponse()
        ) as mock_get:
            result = fetch_referral_statuses()

        mock_get.assert_called_once()
        assert (
            mock_get.call_args.args[0]
            == "https://example.com/api/internal/referral-status"
        )
        assert mock_get.call_args.kwargs["headers"] == {
            "Authorization": "Bearer secret"
        }
        assert result == [_client()]


class TestGetLastSentDates:
    def test_returns_empty_dict_for_no_client_ids(self):
        assert get_last_sent_dates([]) == {}

    def test_converts_utc_timestamp_to_business_local_date(self):
        class FakeCursor:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def execute(self, query, params):
                pass

            def fetchall(self):
                # 2026-01-01 04:30 UTC is still 2025-12-31 business-local (America/New_York)
                return [{"clientId": 1, "lastSentAt": dt.datetime(2026, 1, 1, 4, 30)}]

        class FakeConnection:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def cursor(self):
                return FakeCursor()

        with patch("utils.database.get_db", return_value=FakeConnection()):
            result = get_last_sent_dates([1])

        assert result == {1: date(2025, 12, 31)}


class TestMonthsElapsed:
    def test_counts_whole_months_only(self):
        assert months_elapsed(date(2026, 1, 15), date(2026, 4, 14)) == 2
        assert months_elapsed(date(2026, 1, 15), date(2026, 4, 15)) == 3
        assert months_elapsed(date(2026, 1, 15), date(2026, 4, 16)) == 3

    def test_handles_year_rollover(self):
        assert months_elapsed(date(2025, 11, 1), date(2026, 2, 1)) == 3


class TestMostRecentMilestone:
    def test_returns_none_before_three_months(self):
        assert most_recent_milestone(date(2026, 4, 1), date(2026, 6, 15)) is None

    def test_returns_three_month_mark(self):
        assert most_recent_milestone(date(2026, 3, 1), date(2026, 6, 15)) == date(
            2026, 6, 1
        )

    def test_returns_most_recent_of_several_elapsed_milestones(self):
        # Added over a year ago (15 months elapsed): most recent completed
        # 3-month milestone is 15 months out, not an earlier one.
        assert most_recent_milestone(date(2025, 3, 1), date(2026, 6, 15)) == date(
            2026, 6, 1
        )


class TestIsDue:
    def test_client_with_log_row_due_when_last_sent_past_cutoff(self):
        client = _client(added_date=date(2025, 1, 1))
        assert is_due(client, TODAY, CUTOFF, last_sent=CUTOFF - timedelta(days=1))

    def test_client_with_log_row_not_due_when_recently_sent(self):
        client = _client(added_date=date(2025, 1, 1))
        assert not is_due(client, TODAY, CUTOFF, last_sent=TODAY - timedelta(days=5))

    def test_no_log_row_due_when_milestone_just_crossed(self):
        # Added exactly 3 calendar months before today: milestone is today itself.
        client = _client(added_date=date(TODAY.year, TODAY.month - 3, TODAY.day))
        assert is_due(client, TODAY, CUTOFF, last_sent=None)

    def test_no_log_row_not_due_when_milestone_crossed_long_ago(self):
        # Added ~7 months ago: most recent milestone was ~1 month ago, well
        # outside the lookback window, so this waits for the 9-month mark
        # instead of firing immediately.
        client = _client(added_date=TODAY - timedelta(days=210))
        assert not is_due(client, TODAY, CUTOFF, last_sent=None)

    def test_no_log_row_not_due_before_three_months(self):
        client = _client(added_date=TODAY - timedelta(days=10))
        assert not is_due(client, TODAY, CUTOFF, last_sent=None)


class TestSendReferralStatusFaxes:
    def test_no_statuses_returned_sends_nothing(self):
        with (
            patch("referral_status_faxes.fetch_referral_statuses", return_value=[]),
            patch("utils.google.send_gmail") as mock_send,
        ):
            send_referral_status_faxes()
        mock_send.assert_not_called()

    def test_client_not_yet_at_three_months_is_skipped(self):
        recent = _client(added_date=date.today() - timedelta(days=10))
        with (
            patch(
                "referral_status_faxes.fetch_referral_statuses",
                return_value=[recent],
            ),
            patch("referral_status_faxes.get_last_sent_dates", return_value={}),
            patch("utils.google.send_gmail") as mock_send,
        ):
            send_referral_status_faxes()
        mock_send.assert_not_called()

    def test_done_client_is_skipped(self):
        finished = _client(done=True)
        with (
            patch(
                "referral_status_faxes.fetch_referral_statuses",
                return_value=[finished],
            ),
            patch("referral_status_faxes.get_last_sent_dates", return_value={}),
            patch("utils.google.send_gmail") as mock_send,
        ):
            send_referral_status_faxes()
        mock_send.assert_not_called()

    def test_client_faxed_within_three_months_is_skipped(self):
        due = _client(client_id=1)
        with (
            patch("referral_status_faxes.fetch_referral_statuses", return_value=[due]),
            patch(
                "referral_status_faxes.get_last_sent_dates",
                return_value={1: date.today() - timedelta(days=5)},
            ),
            patch("utils.google.send_gmail") as mock_send,
        ):
            send_referral_status_faxes()
        mock_send.assert_not_called()

    def test_client_last_faxed_over_three_months_ago_is_sent_again(self):
        due = _client(client_id=1)
        with (
            patch("referral_status_faxes.fetch_referral_statuses", return_value=[due]),
            patch(
                "referral_status_faxes.get_last_sent_dates",
                return_value={1: date.today() - timedelta(days=100)},
            ),
            patch("utils.google.send_gmail") as mock_send,
            patch("referral_status_faxes.log_faxes_sent") as mock_log,
        ):
            send_referral_status_faxes()
        mock_send.assert_called_once()
        mock_log.assert_called_once_with([1])

    def test_no_log_row_client_past_milestone_window_is_skipped(self):
        # Regression guard for the first-run blast: a client with no log row
        # who crossed their 3-month mark long ago should NOT be faxed
        # immediately, only once they hit their next milestone.
        stale = _client(client_id=1, added_date=date.today() - timedelta(days=210))
        with (
            patch(
                "referral_status_faxes.fetch_referral_statuses", return_value=[stale]
            ),
            patch("referral_status_faxes.get_last_sent_dates", return_value={}),
            patch("utils.google.send_gmail") as mock_send,
        ):
            send_referral_status_faxes()
        mock_send.assert_not_called()

    def test_invalid_referral_source_is_skipped_without_sending(self):
        bad_source = _client(referral_source="No Referral Source")
        with (
            patch(
                "referral_status_faxes.fetch_referral_statuses",
                return_value=[bad_source],
            ),
            patch(
                "referral_status_faxes.get_last_sent_dates",
                return_value={1: date.today() - timedelta(days=100)},
            ),
            patch("utils.google.send_gmail") as mock_send,
        ):
            send_referral_status_faxes()
        mock_send.assert_not_called()

    def test_groups_multiple_clients_from_same_source_into_one_fax(self):
        clients = [
            _client(client_id=1, full_name="Jane Doe"),
            _client(client_id=2, full_name="John Roe"),
        ]
        with (
            patch(
                "referral_status_faxes.fetch_referral_statuses", return_value=clients
            ),
            patch(
                "referral_status_faxes.get_last_sent_dates",
                return_value={
                    1: date.today() - timedelta(days=100),
                    2: date.today() - timedelta(days=100),
                },
            ),
            patch("utils.google.send_gmail") as mock_send,
            patch("referral_status_faxes.log_faxes_sent") as mock_log,
        ):
            send_referral_status_faxes()
        mock_send.assert_called_once()
        assert mock_send.call_args.kwargs["to_addr"] == "8435551234@redfax.com"
        mock_log.assert_called_once_with([1, 2])

    def test_dry_run_writes_pdf_but_does_not_send_or_log(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        due = _client(client_id=1)
        with (
            patch("referral_status_faxes.fetch_referral_statuses", return_value=[due]),
            patch(
                "referral_status_faxes.get_last_sent_dates",
                return_value={1: date.today() - timedelta(days=100)},
            ),
            patch("utils.google.send_gmail") as mock_send,
            patch("referral_status_faxes.log_faxes_sent") as mock_log,
        ):
            send_referral_status_faxes(dry_run=True)
        mock_send.assert_not_called()
        mock_log.assert_not_called()

        written = list((tmp_path / "temp" / "referral-status-faxes").glob("*.pdf"))
        assert len(written) == 1
