"""One-off: restore emr_questionnaire.updatedAt after the PDF check overwrote it.

The "As Of" column in the Questionnaires table shows updatedAt, which MySQL
resets on every row update. The daily PDF check updated every row it looked at,
so those rows now show the PDF check time instead of the time the questionnaire
checker (qreceive) last looked at them.

For each row that has not been touched since its PDF check (updatedAt is within
a few seconds of pdfCheckedAt), this script sets updatedAt to the time of the
last qreceive run-log line for that client before the first PDF check. Rows
with no such log line are left alone and counted in the report. Rows that
qreceive has updated since the PDF check already have a correct date and are
skipped.

Dry run by default. Pass --apply to write.

Run from python/: uv run python -m oneoff.restore_questionnaire_updated_at
"""

from __future__ import annotations

import argparse

from loguru import logger
from pymysql.connections import Connection
from pymysql.cursors import DictCursor

from utils.database import db_session

# updatedAt and pdfCheckedAt are set by separate NOW() calls in one statement
# or one transaction, so allow a small gap.
TOUCH_WINDOW_SECONDS = 5

CANDIDATES_SQL = f"""
    SELECT q.id, q.clientId, q.updatedAt,
           (SELECT MAX(l.time)
              FROM emr_script_run_log l
              JOIN emr_script_run r ON r.id = l.runId
             WHERE r.app = 'qreceive'
               AND l.clientId = q.clientId
               AND l.time < (SELECT MIN(pdfCheckedAt) FROM emr_questionnaire)
           ) AS restoreTo
      FROM emr_questionnaire q
     WHERE q.pdfCheckedAt IS NOT NULL
       AND ABS(TIMESTAMPDIFF(SECOND, q.pdfCheckedAt, q.updatedAt)) <= {TOUCH_WINDOW_SECONDS}
"""


def find_restorable(connection: Connection[DictCursor]) -> tuple[list[dict], int]:
    with connection.cursor() as cursor:
        cursor.execute(CANDIDATES_SQL)
        rows = cursor.fetchall()
    restorable = [r for r in rows if r["restoreTo"] is not None]
    return restorable, len(rows) - len(restorable)


def apply_restore(connection: Connection[DictCursor], rows: list[dict]) -> None:
    with connection.cursor() as cursor:
        # Setting updatedAt explicitly stops ON UPDATE CURRENT_TIMESTAMP from
        # overriding it.
        cursor.executemany(
            "UPDATE emr_questionnaire SET updatedAt = %s WHERE id = %s",
            [(r["restoreTo"], r["id"]) for r in rows],
        )
    connection.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes. Without this flag the script only reports.",
    )
    args = parser.parse_args()

    with db_session() as connection:
        restorable, skipped = find_restorable(connection)
        logger.info(
            f"{len(restorable)} rows can be restored, {skipped} have no qreceive log line."
        )

        if not args.apply:
            logger.info("Dry run only. Re-run with --apply to write changes.")
            return

        apply_restore(connection, restorable)
        logger.info("Applied.")


if __name__ == "__main__":
    main()
