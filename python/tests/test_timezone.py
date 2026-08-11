from datetime import UTC, datetime

import pytest

from utils.timezone import business_to_utc, now_business, now_utc


class TestBusinessToUtc:
    def test_converts_est_wall_clock_to_utc(self):
        # January: America/New_York is EST (UTC-5).
        naive = datetime(2026, 1, 15, 9, 0, 0)
        result = business_to_utc(naive)
        assert result == datetime(2026, 1, 15, 14, 0, 0, tzinfo=UTC)

    def test_converts_edt_wall_clock_to_utc(self):
        # July: America/New_York is EDT (UTC-4).
        naive = datetime(2026, 7, 15, 9, 0, 0)
        result = business_to_utc(naive)
        assert result == datetime(2026, 7, 15, 13, 0, 0, tzinfo=UTC)

    def test_handles_spring_forward_dst_boundary(self):
        # 2026-03-08 02:00 local is the spring-forward gap for America/New_York;
        # zoneinfo resolves it by shifting forward into EDT rather than raising.
        naive = datetime(2026, 3, 8, 3, 0, 0)
        result = business_to_utc(naive)
        assert result == datetime(2026, 3, 8, 7, 0, 0, tzinfo=UTC)

    def test_rejects_already_aware_datetime(self):
        aware = datetime(2026, 1, 15, 9, 0, 0, tzinfo=UTC)
        with pytest.raises(ValueError, match="naive"):
            business_to_utc(aware)


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
