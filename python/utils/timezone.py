"""Helpers for converting between the practice's business-local wall clock and
true UTC instants. All `emr_appointment.startTime`/`endTime` and similar
timestamp columns are stored as genuine UTC; TherapyAppointment CSV exports
and other business-facing inputs are naive wall-clock time in
`BUSINESS_TIMEZONE`.
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from utils.constants import BUSINESS_TIMEZONE

_BUSINESS_TZINFO = ZoneInfo(BUSINESS_TIMEZONE)


def business_to_utc(naive_business_dt: datetime) -> datetime:
    """Localize a naive business-local wall-clock datetime to UTC.

    Raises if given a datetime that already carries tzinfo, since that means
    the caller has an already-aware value and doesn't need this conversion.
    """
    if naive_business_dt.tzinfo is not None:
        raise ValueError(
            "business_to_utc expects a naive datetime, got one with tzinfo "
            f"{naive_business_dt.tzinfo!r}"
        )
    return naive_business_dt.replace(tzinfo=_BUSINESS_TZINFO).astimezone(UTC)


def utc_to_business(dt: datetime) -> datetime:
    """Convert a UTC datetime to naive business-local wall-clock time.

    Accepts either a naive datetime (interpreted as UTC, matching what
    pymysql returns for the DB's timestamp columns) or a UTC-aware one.
    """
    aware_utc = dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)
    return aware_utc.astimezone(_BUSINESS_TZINFO).replace(tzinfo=None)


def now_utc() -> datetime:
    """The current instant, as a genuine UTC-aware datetime."""
    return datetime.now(UTC)


def now_business() -> datetime:
    """The current instant, as business-local wall-clock time."""
    return datetime.now(_BUSINESS_TZINFO)
