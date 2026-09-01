"""One-off remediation for clients wrongly given a fresh session on reactivation.

Before 2026-08-28 (and until the fixed image is deployed), every Inactive to
Active flip ran `reset_client_session`, archiving the client's prior-session
data and stamping `sessionStartedAt`, with no check on how long they were gone.
Clients who came back within 12 months should instead have kept their session
and had their insurance review reopened (`activate_reactivation_insurance_review`).

This script finds those clients, restores what `reset_client_session` archived,
clears `sessionStartedAt`, and applies the correct within-12-months treatment.

Dry run by default. Pass --apply to write.

Recovery notes:
- In-person assessments, insurance review content, external records note, and
  client notes were archived to their *_history tables and are restored here.
- `client.recordsNeeded` was cleared and never archived: it cannot be restored
  and staff must re-triage. Affected clients are listed in the report.
- `emr_failure` rows were deleted (not archived). They are re-created by the
  next questionnaire/appointment sync if the underlying condition still holds;
  this script does not touch them.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime

from dateutil.relativedelta import relativedelta
from loguru import logger
from pymysql.connections import Connection
from pymysql.cursors import DictCursor

from utils.constants import (
    TABLE_APPOINTMENT,
    TABLE_CLIENT,
    TABLE_EXTERNAL_RECORD,
    TABLE_EXTERNAL_RECORD_HISTORY,
    TABLE_IN_PERSON_ASSESSMENT,
    TABLE_IN_PERSON_ASSESSMENT_HISTORY,
    TABLE_INSURANCE_REVIEW,
    TABLE_INSURANCE_REVIEW_HISTORY,
    TABLE_NOTE,
    TABLE_NOTE_HISTORY,
)
from utils.database import activate_reactivation_insurance_review, db_session
from utils.timezone import utc_to_business

# Reactivation gaps at or above this are treated as legitimate full restarts
# and left alone.
RESET_THRESHOLD = relativedelta(months=12)

# How far apart an archival row's createdAt and the client's sessionStartedAt
# can be and still be considered part of the same reset transaction.
MATCH_WINDOW_SECONDS = 30


def _within_window(a: datetime, b: datetime) -> bool:
    return abs((a - b).total_seconds()) <= MATCH_WINDOW_SECONDS


def find_candidates(connection: Connection[DictCursor]) -> list[dict]:
    """Clients with a sessionStartedAt whose reactivation gap was under 12 months.

    Gap is measured from the client's latest appointment before sessionStartedAt
    to sessionStartedAt. Clients with no prior appointment are returned with
    gap_months=None for manual review.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT id, fullName, sessionStartedAt, recordsNeeded "
            f"FROM `{TABLE_CLIENT}` WHERE sessionStartedAt IS NOT NULL"
        )
        clients = cursor.fetchall()

    candidates: list[dict] = []
    for client in clients:
        session_start = client["sessionStartedAt"]
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT MAX(startTime) AS last_appt FROM `{TABLE_APPOINTMENT}` "
                "WHERE clientId = %s AND startTime < %s",
                (client["id"], session_start),
            )
            row = cursor.fetchone()
        last_appt = row["last_appt"] if row else None

        if last_appt is None:
            gap_months = None
            wrongly_reset = True  # unknown gap, flag for review
        else:
            delta = relativedelta(session_start, last_appt)
            gap_months = delta.years * 12 + delta.months
            wrongly_reset = session_start < last_appt + RESET_THRESHOLD

        if wrongly_reset:
            candidates.append(
                {
                    "id": client["id"],
                    "fullName": client["fullName"],
                    "sessionStartedAt": session_start,
                    "lastAppointmentBefore": last_appt,
                    "gapMonths": gap_months,
                    "recordsNeededCleared": client["recordsNeeded"] is None,
                }
            )
    return candidates


def _restore_assessments(cursor, client_id: int, session_start: datetime) -> int:
    cursor.execute(
        f"SELECT id FROM `{TABLE_IN_PERSON_ASSESSMENT}` WHERE clientId = %s",
        (client_id,),
    )
    assessment_ids = [r["id"] for r in cursor.fetchall()]
    restored = 0
    for assessment_id in assessment_ids:
        cursor.execute(
            f"SELECT content, createdAt FROM `{TABLE_IN_PERSON_ASSESSMENT_HISTORY}` "
            "WHERE assessmentId = %s ORDER BY createdAt DESC",
            (assessment_id,),
        )
        history_row = None
        for row in cursor.fetchall():
            if _within_window(row["createdAt"], session_start):
                history_row = row
                break
        if history_row is None:
            continue
        content = history_row["content"]
        if isinstance(content, str):
            content = json.loads(content)
        cursor.execute(
            f"UPDATE `{TABLE_IN_PERSON_ASSESSMENT}` "
            "SET status = %s, addedDate = %s, appointmentId = %s WHERE id = %s",
            (
                content.get("status"),
                content.get("addedDate"),
                content.get("appointmentId"),
                assessment_id,
            ),
        )
        restored += 1
    return restored


def _restore_single_blob(
    cursor,
    client_id: int,
    session_start: datetime,
    history_table: str,
    history_fk: str,
    live_table: str,
    live_set: str,
) -> bool:
    cursor.execute(
        f"SELECT content, createdAt FROM `{history_table}` "
        f"WHERE {history_fk} = %s ORDER BY createdAt DESC",
        (client_id,),
    )
    for row in cursor.fetchall():
        if _within_window(row["createdAt"], session_start):
            content = row["content"]
            if not isinstance(content, str):
                content = json.dumps(content)
            cursor.execute(
                f"UPDATE `{live_table}` SET {live_set} WHERE clientId = %s",
                (content, client_id),
            )
            return True
    return False


def remediate_client(
    connection: Connection[DictCursor], candidate: dict, apply: bool
) -> None:
    client_id = candidate["id"]
    session_start = candidate["sessionStartedAt"]
    label = f"client {client_id} ({candidate['fullName']})"

    if not apply:
        logger.info(
            f"[dry-run] would remediate {label}: gap "
            f"{candidate['gapMonths']} months, reactivated "
            f"{utc_to_business(session_start).date().isoformat()}"
        )
        return

    with connection.cursor() as cursor:
        assessments_restored = _restore_assessments(cursor, client_id, session_start)
        review_restored = _restore_single_blob(
            cursor,
            client_id,
            session_start,
            TABLE_INSURANCE_REVIEW_HISTORY,
            "reviewId",
            TABLE_INSURANCE_REVIEW,
            "content = %s, submittedToNotesAt = NULL",
        )
        external_restored = _restore_single_blob(
            cursor,
            client_id,
            session_start,
            TABLE_EXTERNAL_RECORD_HISTORY,
            "externalRecordId",
            TABLE_EXTERNAL_RECORD,
            "content = %s",
        )
        note_restored = _restore_single_blob(
            cursor,
            client_id,
            session_start,
            TABLE_NOTE_HISTORY,
            "noteId",
            TABLE_NOTE,
            "content = %s",
        )

        cursor.execute(
            f"UPDATE `{TABLE_CLIENT}` SET sessionStartedAt = NULL WHERE id = %s",
            (client_id,),
        )
    connection.commit()

    # Reopen the insurance review with the correct within-12-months note. The
    # original deactivatedAt is unknown here, so the note records the gap as
    # unknown.
    activate_reactivation_insurance_review(client_id, None, connection=connection)

    logger.info(
        f"Remediated {label}: assessments={assessments_restored}, "
        f"review={review_restored}, externalRecord={external_restored}, "
        f"note={note_restored}, sessionStartedAt cleared"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes. Without this flag the script only reports.",
    )
    args = parser.parse_args()

    with db_session() as connection:
        candidates = find_candidates(connection)

        if not candidates:
            logger.info("No wrongly-reset clients found.")
            return

        logger.info(f"Found {len(candidates)} candidate(s):")
        needs_retriage: list[str] = []
        for candidate in candidates:
            gap = candidate["gapMonths"]
            gap_str = (
                "unknown (no prior appointment)" if gap is None else f"{gap} months"
            )
            logger.info(
                f"  client {candidate['id']} ({candidate['fullName']}): "
                f"gap {gap_str}, sessionStartedAt "
                f"{utc_to_business(candidate['sessionStartedAt']).date().isoformat()}"
            )
            if candidate["recordsNeededCleared"]:
                needs_retriage.append(f"{candidate['id']} ({candidate['fullName']})")

        for candidate in candidates:
            remediate_client(connection, candidate, args.apply)

        if needs_retriage:
            logger.warning(
                "recordsNeeded was cleared and cannot be restored for: "
                + ", ".join(needs_retriage)
                + ". Staff must re-triage records for these clients."
            )
        logger.warning(
            "Deleted emr_failure rows are not restored by this script; the next "
            "sync re-creates them if the condition still holds."
        )

        if not args.apply:
            logger.info("Dry run only. Re-run with --apply to write changes.")


if __name__ == "__main__":
    main()
