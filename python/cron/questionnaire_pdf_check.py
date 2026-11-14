"""Daily check that each COMPLETED questionnaire's PDF is in the client's Drive folder.

Only questionnaires sent within LOOKBACK_DAYS are checked. A found PDF's Drive
file id is stored on the questionnaire and never checked again; the rest are
rechecked every run, since staff download PDFs by hand.
"""

from googleapiclient.errors import HttpError
from loguru import logger

from utils.database import db_session
from utils.google import list_files_recursive
from utils.questionnaire_pdfs import (
    FINGERPRINTS,
    drive_leading_pages_text,
    matching_types,
    pdfs_hinted_first,
)

LOOKBACK_DAYS = 30

QUERY = """
    SELECT q.id, q.questionnaireType AS type, c.driveId AS drive_id
    FROM emr_questionnaire q
    JOIN emr_client c ON c.id = q.clientId
    WHERE q.status = 'COMPLETED' AND c.driveId IS NOT NULL
      AND q.pdfFileId IS NULL
      AND q.sent >= CURDATE() - INTERVAL %s DAY
"""


def find_pdf(files: list[dict], qtype: str) -> str | None:
    """Drive file id of the first PDF matching qtype's fingerprint, else None.
    Files with a name hint for qtype are read first."""
    for f in pdfs_hinted_first(files, qtype):
        text = drive_leading_pages_text(f, qtype)
        if text and qtype in matching_types(text):
            return f["id"]
    return None


def check_questionnaire_pdfs() -> None:
    with db_session() as conn, conn.cursor() as cur:
        cur.execute(QUERY, (LOOKBACK_DAYS,))
        rows = [r for r in cur.fetchall() if r["type"] in FINGERPRINTS]

        # None marks a folder that can't be listed (deleted or not shared).
        folder_files: dict[str, list[dict] | None] = {}
        found = 0
        for row in rows:
            drive_id = row["drive_id"]
            if drive_id not in folder_files:
                try:
                    folder_files[drive_id] = list_files_recursive(drive_id)
                except HttpError as e:
                    logger.warning(
                        f"Questionnaire {row['id']}: can't list Drive folder: {e.status_code}"
                    )
                    folder_files[drive_id] = None
            files = folder_files[drive_id]
            if files is None:
                continue
            file_id = find_pdf(files, row["type"])
            found += file_id is not None
            cur.execute(
                "UPDATE emr_questionnaire SET pdfFileId = %s, pdfCheckedAt = NOW() WHERE id = %s",
                (file_id, row["id"]),
            )
        conn.commit()
    logger.info(f"Questionnaire PDF check: {found} found, {len(rows) - found} missing")
