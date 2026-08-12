"""
Fax Categorization

Polls a Google Drive folder for incoming faxes, categorizes each one
(Referral, Records Request, Insurance, Patient Documents, Unsure) with a
conservative self-reported confidence score, identifies the client(s) it's
about, fuzzy-matches those names against emr_client, and records the fax
plus any candidate client matches for staff to review on the
/fax-categorization page.

Usage:
    python fax_categorization.py
"""

import json
import os
import tempfile

from dotenv import load_dotenv
from loguru import logger

from utils.config import validate_config
from utils.constants import (
    FAX_CATEGORIZATION_START_DATE,
    TABLE_FAX_CATEGORIZATION,
    TABLE_FAX_CATEGORIZATION_CLIENT_LINK,
)
from utils.database import db_session, get_all_clients
from utils.document_categorizer import (
    categorize_document,
    extract_text,
    limit_cpu_usage,
    load_model,
)
from utils.google import (
    build_client_lookup,
    client_match_confidence,
    get_file_as_bytes,
    get_file_by_id,
    list_files_in_folder,
    normalize_name_tokens,
    update_file_content,
)
from utils.misc import json_log_format
from utils.task_tracker import track_task

logger.add(
    "logs/fax-categorization.log",
    format=json_log_format,
    rotation="50 MB",
    filter=lambda r: r["name"] == "fax_categorization",
)
load_dotenv()


def _match_clients(
    names: list[str], client_lookup: list[dict]
) -> dict[int, tuple[str, float]]:
    """Fuzzy-match extracted names against the client lookup, tolerating
    small typos (e.g. "Jonh Smith" still matches "John Smith"). Returns a
    dict of client_id -> (matched name, confidence), deduped so each client
    is only linked once, keeping its best match across all extracted names."""
    matched: dict[int, tuple[str, float]] = {}
    for name in names:
        tokens = normalize_name_tokens(name)
        for client in client_lookup:
            confidence = client_match_confidence(client["tokens"], tokens)
            if confidence is None:
                continue
            existing = matched.get(client["id"])
            if existing is None or confidence > existing[1]:
                matched[client["id"]] = (name, confidence)
    return matched


def _already_seen_drive_file_ids() -> set[str]:
    with db_session() as conn, conn.cursor() as cursor:
        cursor.execute(f"SELECT drive_file_id FROM {TABLE_FAX_CATEGORIZATION}")
        return {row["drive_file_id"] for row in cursor.fetchall()}


def _extract_and_categorize(file: dict, llm) -> tuple[str, str, list[str], float]:
    """Download a Drive file, OCR/extract its text, and categorize it.
    Returns (document_text, category, client names, confidence)."""
    pdf_bytes = get_file_as_bytes(file)

    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp.flush()
        document_text, _sources, corrected_pdf = extract_text(tmp.name, llm)

    if corrected_pdf is not None:
        logger.info(f"Fixed page orientation for {file['name']}; updating Drive copy.")
        update_file_content(file["id"], corrected_pdf, "application/pdf")

    category = "Unsure"
    clients: list[str] = []
    confidence = 0.0
    if document_text.strip():
        category, clients, confidence = categorize_document(llm, document_text)
    else:
        logger.warning(
            f"No text could be extracted from {file['name']} (even with OCR)."
        )

    return document_text, category, clients, confidence


def _process_fax(file: dict, llm, client_lookup: list[dict]) -> None:
    logger.info(f"Categorizing fax: {file['name']} ({file['id']})")
    document_text, category, clients, confidence = _extract_and_categorize(file, llm)

    matched_clients = _match_clients(clients, client_lookup)

    llm_raw_output = json.dumps(
        {"category": category, "clients": clients, "confidence": confidence}
    )

    with db_session() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                INSERT INTO {TABLE_FAX_CATEGORIZATION}
                    (drive_file_id, file_name, category, llm_category, confidence, extracted_text, llm_raw_output)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    file["id"],
                    file["name"],
                    category,
                    category,
                    confidence,
                    document_text,
                    llm_raw_output,
                ),
            )
            fax_id = cursor.lastrowid

            for client_id, (matched_name, match_confidence) in matched_clients.items():
                cursor.execute(
                    f"""
                    INSERT INTO {TABLE_FAX_CATEGORIZATION_CLIENT_LINK}
                        (fax_categorization_id, client_id, source, matched_name, confidence)
                    VALUES (%s, %s, 'llm', %s, %s)
                    """,
                    (fax_id, client_id, matched_name, match_confidence),
                )
        conn.commit()

    logger.info(
        f"Recorded fax {file['name']} as {category} (confidence: {confidence:.2f}) "
        f"with {len(matched_clients)} candidate client match(es)."
    )


def _reprocess_requested_faxes() -> list[dict]:
    with db_session() as conn, conn.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT id, drive_file_id, file_name
            FROM {TABLE_FAX_CATEGORIZATION}
            WHERE reprocess_requested_at IS NOT NULL
            """
        )
        return list(cursor.fetchall())


def _reprocess_fax(fax: dict, llm, client_lookup: list[dict]) -> None:
    """Re-run extraction and categorization for a fax staff already
    reviewed. Only refreshes the LLM's own columns (llm_category,
    confidence, extracted_text, llm_raw_output) and adds newly-suggested
    candidate clients; a reviewer's chosen category and any client link
    they've already acted on (confirmed, rejected, or manually added) are
    left untouched."""
    logger.info(f"Re-running categorization for fax: {fax['file_name']} ({fax['id']})")
    file = get_file_by_id(fax["drive_file_id"])
    document_text, category, clients, confidence = _extract_and_categorize(file, llm)

    matched_clients = _match_clients(clients, client_lookup)

    llm_raw_output = json.dumps(
        {"category": category, "clients": clients, "confidence": confidence}
    )

    with db_session() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE {TABLE_FAX_CATEGORIZATION}
                SET llm_category = %s, confidence = %s, extracted_text = %s,
                    llm_raw_output = %s, reprocess_requested_at = NULL,
                    last_reprocessed_at = CURRENT_TIMESTAMP
                WHERE id = %s
                """,
                (category, confidence, document_text, llm_raw_output, fax["id"]),
            )

            for client_id, (matched_name, match_confidence) in matched_clients.items():
                # INSERT IGNORE: if staff already has a link (confirmed,
                # rejected, or manually added) for this client, leave it as
                # they left it rather than overwriting their decision.
                cursor.execute(
                    f"""
                    INSERT IGNORE INTO {TABLE_FAX_CATEGORIZATION_CLIENT_LINK}
                        (fax_categorization_id, client_id, source, matched_name, confidence)
                    VALUES (%s, %s, 'llm', %s, %s)
                    """,
                    (fax["id"], client_id, matched_name, match_confidence),
                )
        conn.commit()

    logger.info(
        f"Re-ran fax {fax['file_name']}: LLM now guesses {category} "
        f"(confidence: {confidence:.2f})."
    )


def process_faxes() -> None:
    folder_id = os.getenv("FAX_CATEGORIZATION_FOLDER_ID")
    if not folder_id:
        logger.error("FAX_CATEGORIZATION_FOLDER_ID is not set")
        return

    with track_task("fax_categorization", "AI fax categorization") as task:
        if task is None:
            # A previous run is still processing faxes (e.g. the LLM lookup
            # is taking longer than the cron interval); skip this run rather
            # than starting a second LLM load in parallel.
            return

        files = list_files_in_folder(
            folder_id, created_after=FAX_CATEGORIZATION_START_DATE
        )
        seen = _already_seen_drive_file_ids()
        new_files = [f for f in files if f["id"] not in seen]
        reprocess_faxes = _reprocess_requested_faxes()

        if not new_files and not reprocess_faxes:
            logger.info("No new or re-run-requested faxes to categorize.")
            return

        total = len(new_files) + len(reprocess_faxes)
        logger.info(
            f"Found {len(new_files)} new fax(es) and {len(reprocess_faxes)} "
            "re-run-requested fax(es) to categorize."
        )
        task.progress(0, total)

        client_lookup = build_client_lookup(get_all_clients())

        threads = max(1, (os.cpu_count() or 4) - 2)
        limit_cpu_usage(threads)
        llm = load_model(threads)
        if llm is None:
            raise RuntimeError("Could not load LLM")

        done = 0
        for file in new_files:
            task.progress(done, total, detail=file["name"])
            try:
                _process_fax(file, llm, client_lookup)
            except Exception:
                logger.exception(f"Failed to categorize fax {file['name']}")
            done += 1
            task.progress(done, total)

        for fax in reprocess_faxes:
            task.progress(done, total, detail=fax["file_name"])
            try:
                _reprocess_fax(fax, llm, client_lookup)
            except Exception:
                logger.exception(f"Failed to re-run fax {fax['file_name']}")
            done += 1
            task.progress(done, total)


def main() -> None:
    try:
        validate_config()
        process_faxes()
    except Exception:
        logger.exception("Failed to run fax categorization")


if __name__ == "__main__":
    main()
