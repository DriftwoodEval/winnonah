"""Daily check that each COMPLETED questionnaire's PDF is in the client's Drive folder.

Only questionnaires sent within LOOKBACK_DAYS are checked, unless one client or
questionnaire is requested. A found PDF's Drive file id is stored on the questionnaire and never
checked again; the rest are rechecked every run, since staff download PDFs by
hand.
"""

import argparse
import threading
import time
from dataclasses import dataclass, field

from dotenv import load_dotenv
from driftwood_common.log_format import json_log_format
from googleapiclient.errors import HttpError
from loguru import logger

from utils.database import SYSTEM_ACTOR, db_session, record_audit_log
from utils.google import list_files_recursive
from utils.questionnaire_pdfs import (
    FINGERPRINTS,
    drive_leading_pages_text,
    matching_types,
    pdfs_hinted_first,
)
from utils.task_tracker import track_task

LOOKBACK_DAYS = 30
# How long a queued request waits before retrying while the cron holds the task.
BUSY_RETRY_SECONDS = 5
LOOKBACK_FILTER = " AND q.sent >= CURDATE() - INTERVAL %s DAY"

QUERY = """
    SELECT q.id, q.clientId AS client_id, q.questionnaireType AS type,
           c.driveId AS drive_id
    FROM emr_questionnaire q
    JOIN emr_client c ON c.id = q.clientId
    WHERE q.status = 'COMPLETED' AND c.driveId IS NOT NULL
      AND q.pdfFileId IS NULL
"""


def find_pdf(files: list[dict], qtype: str) -> str | None:
    """Drive file id of the first PDF matching qtype's fingerprint, else None.
    Files with a name hint for qtype are read first."""
    for f in pdfs_hinted_first(files, qtype):
        text = drive_leading_pages_text(f, qtype)
        if text and qtype in matching_types(text):
            return f["id"]
    return None


@dataclass
class _Request:
    rows: list[dict]
    found: int = 0
    error: Exception | None = None
    finished: threading.Event = field(default_factory=threading.Event)

    def fail(self, error: Exception) -> None:
        self.error = error
        self.finished.set()


# Requests are queued here and drained by one worker thread under a single
# task, so several clicks show as one task whose progress total grows.
_lock = threading.Lock()


@dataclass
class _State:
    queue: list[_Request] = field(default_factory=list)
    running: bool = False
    total: int = 0
    done: int = 0


_state = _State()


def select_rows(
    client_id: int | None, questionnaire_id: int | None, all_time: bool = False
) -> list[dict]:
    """Completed questionnaires still missing a PDF, for one questionnaire, one
    client, or (with neither) everything sent within LOOKBACK_DAYS, or every
    questionnaire ever sent when all_time is set."""
    with db_session() as conn, conn.cursor() as cur:
        if questionnaire_id is not None:
            cur.execute(QUERY + " AND q.id = %s", (questionnaire_id,))
        elif client_id is not None:
            cur.execute(QUERY + " AND c.id = %s", (client_id,))
        elif all_time:
            cur.execute(QUERY)
        else:
            cur.execute(QUERY + LOOKBACK_FILTER, (LOOKBACK_DAYS,))
        return [r for r in cur.fetchall() if r["type"] in FINGERPRINTS]


def check_questionnaire_pdfs(
    client_id: int | None = None,
    questionnaire_id: int | None = None,
    all_time: bool = False,
) -> tuple[int, int]:
    """Queue a check for one questionnaire, one client, or all (the cron's
    30-day window), wait for it, and return (found, missing) counts.


    If the cron is mid-run in another process, the request waits for it to
    finish and then runs as its own task."""
    rows = select_rows(client_id, questionnaire_id, all_time)
    if not rows:
        return 0, 0
    request = _Request(rows)
    with _lock:
        _state.queue.append(request)
        _state.total += len(rows)
        start_worker = not _state.running
        _state.running = True
    if start_worker:
        threading.Thread(target=_work, daemon=True).start()
    request.finished.wait()
    if request.error:
        raise request.error
    found, missing = request.found, len(rows) - request.found
    logger.info(f"Questionnaire PDF check: {found} found, {missing} missing")
    return found, missing


def _work() -> None:
    """Drain the queue under one task. Loops again if a request arrived just
    as the task closed, or if another process holds the task."""
    while True:
        busy = False
        try:
            with track_task(
                "questionnaire_pdf_check", "Checking questionnaire PDFs"
            ) as task:
                if task is None:
                    busy = True
                else:
                    _drain(task)
        except Exception as e:
            logger.exception("Questionnaire PDF check failed")
            with _lock:
                failed = _state.queue[:]
                _state.queue.clear()
            for request in failed:
                request.fail(e)
        if busy:
            time.sleep(BUSY_RETRY_SECONDS)
            continue
        with _lock:
            if not _state.queue:
                _state.running = False
                _state.total = _state.done = 0
                return


def _drain(task) -> None:
    # None marks a folder that can't be listed (deleted or not shared).
    folder_files: dict[str, list[dict] | None] = {}
    with db_session() as conn, conn.cursor() as cur:
        while True:
            with _lock:
                if not _state.queue:
                    return
                request = _state.queue.pop(0)
                done, total = _state.done, _state.total
            # Shown before the slow Drive reads so the bar appears right away.
            task.progress(done, total)
            try:
                for row in request.rows:
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
                    if files is not None:
                        file_id = find_pdf(files, row["type"])
                        request.found += file_id is not None
                        logger.info(
                            f"[{_state.done + 1}/{_state.total}] Questionnaire {row['id']} "
                            f"({row['type']}): {'PDF found' if file_id else 'no PDF'}"
                        )
                        cur.execute(
                            "UPDATE emr_questionnaire SET pdfFileId = %s, pdfCheckedAt = NOW() WHERE id = %s",
                            (file_id, row["id"]),
                        )
                        if file_id:
                            record_audit_log(
                                conn,
                                "python.questionnaire.pdfFound",
                                row["client_id"],
                                *SYSTEM_ACTOR,
                                detail={
                                    "questionnaireId": row["id"],
                                    "type": row["type"],
                                    "pdfFileId": file_id,
                                },
                            )
                    with _lock:
                        _state.done += 1
                        done, total = _state.done, _state.total
                    task.progress(done, total)
                conn.commit()
            except Exception as e:
                request.fail(e)
                raise
            request.finished.set()


if __name__ == "__main__":
    # Set up here, not at import, since the API process imports this module too.
    logger.add(
        "logs/questionnaire-pdf-check.log",
        format=json_log_format,
        rotation="50 MB",
    )
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--all",
        action="store_true",
        help=f"check every questionnaire, not just the last {LOOKBACK_DAYS} days",
    )
    check_questionnaire_pdfs(all_time=parser.parse_args().all)
