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
    get_file_as_bytes,
    list_files_in_folder,
    normalize_name_tokens,
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


def _match_clients(names: list[str], client_lookup: list[dict]) -> dict[int, str]:
    """Token-subset match extracted names against the client lookup (same
    approach as utils.google's Drive-folder matcher). Returns a dict of
    client_id -> the extracted name that matched it, deduped so each client
    is only linked once even if matched by multiple name variants."""
    matched: dict[int, str] = {}
    for name in names:
        tokens = normalize_name_tokens(name)
        for client in client_lookup:
            if client["tokens"] and client["tokens"].issubset(tokens):
                matched.setdefault(client["id"], name)
    return matched


def _already_seen_drive_file_ids() -> set[str]:
    with db_session() as conn, conn.cursor() as cursor:
        cursor.execute(f"SELECT drive_file_id FROM {TABLE_FAX_CATEGORIZATION}")
        return {row["drive_file_id"] for row in cursor.fetchall()}


def _process_fax(file: dict, llm, client_lookup: list[dict]) -> None:
    logger.info(f"Categorizing fax: {file['name']} ({file['id']})")
    pdf_bytes = get_file_as_bytes(file)

    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp.flush()
        document_text, _sources = extract_text(tmp.name, llm)

    category = "Unsure"
    clients: list[str] = []
    confidence = 0.0
    if document_text.strip():
        category, clients, confidence = categorize_document(llm, document_text)
    else:
        logger.warning(
            f"No text could be extracted from {file['name']} (even with OCR)."
        )

    matched_clients = _match_clients(clients, client_lookup)

    llm_raw_output = json.dumps(
        {"category": category, "clients": clients, "confidence": confidence}
    )

    with db_session() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                INSERT INTO {TABLE_FAX_CATEGORIZATION}
                    (drive_file_id, file_name, category, confidence, extracted_text, llm_raw_output)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    file["id"],
                    file["name"],
                    category,
                    confidence,
                    document_text,
                    llm_raw_output,
                ),
            )
            fax_id = cursor.lastrowid

            for client_id, matched_name in matched_clients.items():
                cursor.execute(
                    f"""
                    INSERT INTO {TABLE_FAX_CATEGORIZATION_CLIENT_LINK}
                        (faxCategorizationId, clientId, source, matched_name, confidence)
                    VALUES (%s, %s, 'llm', %s, 1.0)
                    """,
                    (fax_id, client_id, matched_name),
                )
        conn.commit()

    logger.info(
        f"Recorded fax {file['name']} as {category} (confidence: {confidence:.2f}) "
        f"with {len(matched_clients)} candidate client match(es)."
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

        files = list_files_in_folder(folder_id)
        if not files:
            logger.info("No files found in fax categorization folder.")
            return

        seen = _already_seen_drive_file_ids()
        new_files = [f for f in files if f["id"] not in seen]
        if not new_files:
            logger.info("No new faxes to categorize.")
            return

        logger.info(f"Found {len(new_files)} new fax(es) to categorize.")
        task.progress(0, len(new_files))

        client_lookup = build_client_lookup(get_all_clients())

        threads = max(1, (os.cpu_count() or 4) - 2)
        limit_cpu_usage(threads)
        llm = load_model(threads)
        if llm is None:
            raise RuntimeError("Could not load LLM")

        for i, file in enumerate(new_files, start=1):
            try:
                _process_fax(file, llm, client_lookup)
            except Exception:
                logger.exception(f"Failed to categorize fax {file['name']}")
            task.progress(i, len(new_files), detail=file["name"])


def main() -> None:
    try:
        validate_config()
        process_faxes()
    except Exception:
        logger.exception("Failed to run fax categorization")


if __name__ == "__main__":
    main()
