"""One-off cleanup of placeholder appointments left behind after TA scheduled
the real appointment.

The sync now removes a client's placeholder (its DB row and its hold event on
the evaluator's calendar) when the real appointment is imported, and re-checks
on every sync. Placeholders left over from before that fix still show up next
to the real appointment as duplicates.

For each client, every non-cancelled real appointment starting on or after
--since (default: today, business time) is paired with at most one of the
client's remaining placeholders, using the same matching the sync uses
(`find_matching_placeholder`): the promoted hold event first, else the same
appointment type closest in time. Each pair's placeholder is removed through
`replace_placeholder_with_real_appointment`, which also deletes the hold event
from Google Calendar and writes the audit log entry.

Dry run by default. Pass --apply to write.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime

from driftwood_common.timezone import business_date_to_utc, now_business
from loguru import logger

from utils.appointments import (
    find_matching_placeholder,
    replace_placeholder_with_real_appointment,
)
from utils.constants import TABLE_APPOINTMENT
from utils.database import db_session, get_client_placeholder_appointments


def find_real_appointments(connection, since_utc: datetime) -> list[dict]:
    """Real, non-cancelled appointments from since_utc onward, for clients who
    still have at least one placeholder."""
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT a.id, a.clientId, a.daEval, a.startTime, a.calendarEventId
            FROM `{TABLE_APPOINTMENT}` a
            WHERE a.placeholder = 0
              AND a.cancelled = 0
              AND a.startTime >= %s
              AND a.clientId IN (
                  SELECT clientId FROM `{TABLE_APPOINTMENT}` WHERE placeholder = 1
              )
            ORDER BY a.clientId, a.startTime
            """,
            (since_utc,),
        )
        return list(cursor.fetchall())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write changes")
    parser.add_argument(
        "--since",
        type=date.fromisoformat,
        default=now_business().date(),
        help="only consider real appointments on/after this date (YYYY-MM-DD)",
    )
    args = parser.parse_args()
    since_utc = business_date_to_utc(args.since).replace(tzinfo=None)

    with db_session() as connection:
        real_appointments = find_real_appointments(connection, since_utc)
        # Dry run can't delete, so track which placeholders it has already paired.
        paired: set[str] = set()
        removed = 0
        for appt in real_appointments:
            placeholders = [
                p
                for p in get_client_placeholder_appointments(appt["clientId"])
                if p["id"] not in paired
            ]
            match = find_matching_placeholder(
                placeholders, appt["daEval"], appt["startTime"], appt["calendarEventId"]
            )
            if match is None:
                continue
            paired.add(match["id"])
            removed += 1
            logger.info(
                f"client {appt['clientId']}: placeholder {match['id']} "
                f"({match['daEval']} {match['startTime']}) superseded by "
                f"appointment {appt['id']} ({appt['daEval']} {appt['startTime']})"
            )
            if args.apply:
                replace_placeholder_with_real_appointment(
                    appt["clientId"],
                    appt["id"],
                    appt["daEval"],
                    appt["startTime"],
                    appt["calendarEventId"],
                )

    verb = "Removed" if args.apply else "Would remove"
    logger.info(f"{verb} {removed} duplicate placeholder(s).")
    if not args.apply:
        logger.info("Dry run only. Re-run with --apply to write changes.")


if __name__ == "__main__":
    main()
