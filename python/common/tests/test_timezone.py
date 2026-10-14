from datetime import UTC, date, datetime

import pytest
from driftwood_common.constants import BUSINESS_TIMEZONE
from driftwood_common.timezone import (
    business_date_to_utc,
    business_to_utc,
    now_business,
    now_utc,
    utc_to_business,
)


class TestBusinessToUtc:
    @pytest.mark.parametrize(
        ("naive", "expected"),
        [
            # January: America/New_York is EST (UTC-5).
            (datetime(2026, 1, 15, 9), datetime(2026, 1, 15, 14, tzinfo=UTC)),
            # July: America/New_York is EDT (UTC-4).
            (datetime(2026, 7, 15, 9), datetime(2026, 7, 15, 13, tzinfo=UTC)),
            # 2026-03-08 02:00-03:00 local is the spring-forward gap; zoneinfo
            # resolves it by shifting forward into EDT rather than raising.
            (datetime(2026, 3, 8, 3), datetime(2026, 3, 8, 7, tzinfo=UTC)),
        ],
    )
    def test_converts_wall_clock_to_utc(self, naive, expected):
        assert business_to_utc(naive) == expected

    def test_defaults_to_the_business_timezone(self):
        naive = datetime(2026, 1, 15, 9)
        assert business_to_utc(naive) == business_to_utc(naive, BUSINESS_TIMEZONE)

    def test_uses_an_explicit_timezone(self):
        # January: America/Los_Angeles is PST (UTC-8).
        result = business_to_utc(datetime(2026, 1, 15, 9), "America/Los_Angeles")
        assert result == datetime(2026, 1, 15, 17, tzinfo=UTC)

    def test_rejects_already_aware_datetime(self):
        aware = datetime(2026, 1, 15, 9, tzinfo=UTC)
        with pytest.raises(ValueError, match="naive"):
            business_to_utc(aware)


class TestBusinessDateToUtc:
    def test_converts_business_midnight_to_utc(self):
        result = business_date_to_utc(date(2026, 1, 15))
        assert result == datetime(2026, 1, 15, 5, tzinfo=UTC)


class TestUtcToBusiness:
    @pytest.mark.parametrize(
        "utc_dt",
        [datetime(2026, 1, 15, 14), datetime(2026, 1, 15, 14, tzinfo=UTC)],
        ids=["naive-treated-as-utc", "aware-utc"],
    )
    def test_returns_naive_business_wall_clock(self, utc_dt):
        result = utc_to_business(utc_dt)
        assert result == datetime(2026, 1, 15, 9)
        assert result.tzinfo is None

    def test_round_trips_with_business_to_utc(self):
        naive = datetime(2026, 7, 15, 9, 30)
        assert utc_to_business(business_to_utc(naive)) == naive


class TestNowHelpers:
    def test_now_utc_and_now_business_represent_the_same_instant(self):
        assert abs((now_utc() - now_business()).total_seconds()) < 1

    def test_now_utc_is_utc_aware(self):
        assert now_utc().tzinfo is UTC

    def test_now_business_is_offset_from_utc(self):
        offset = now_business().utcoffset()
        assert offset is not None
        # America/New_York is always UTC-4 (EDT) or UTC-5 (EST).
        assert offset.total_seconds() in (-4 * 3600, -5 * 3600)

    def test_now_business_uses_an_explicit_timezone(self):
        offset = now_business("America/Los_Angeles").utcoffset()
        assert offset is not None
        assert offset.total_seconds() in (-7 * 3600, -8 * 3600)
