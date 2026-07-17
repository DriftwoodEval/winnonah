"""
Referral Fax Intake

Polls a Google Drive folder for incoming referral update request faxes,
extracts each one's text, uses the local LLM to identify the client(s) it's
about, fuzzy-matches those names against emr_client, and records the fax
plus any candidate client matches for staff to review on the
/referral-faxes page.

Usage:
    python referral_fax_intake.py
"""

import json
import os
import tempfile

from dotenv import load_dotenv
from loguru import logger

from utils.config import validate_config
from utils.constants import TABLE_REFERRAL_FAX, TABLE_REFERRAL_FAX_CLIENT_LINK
from utils.database import db_session, get_all_clients
from utils.document_categorizer import (
    RESPONSE_TOKEN_RESERVE,
    build_client_prompt,
    extract_clients,
    extract_text,
    fit_to_context,
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

logger.add(
    "logs/referral-fax-intake.log",
    format=json_log_format,
    rotation="50 MB",
    filter=lambda r: r["name"] == "referral_fax_intake",
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
        cursor.execute(f"SELECT drive_file_id FROM {TABLE_REFERRAL_FAX}")
        return {row["drive_file_id"] for row in cursor.fetchall()}


def _process_fax(file: dict, llm, client_lookup: list[dict]) -> None:
    logger.info(f"Processing new referral fax: {file['name']} ({file['id']})")
    pdf_bytes = get_file_as_bytes(file)

    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp.flush()
        document_text, _sources = extract_text(tmp.name, llm)

    clients: list[str] = []
    if document_text.strip():
        truncated_text = fit_to_context(
            llm, document_text, build_client_prompt, RESPONSE_TOKEN_RESERVE
        )
        clients = extract_clients(llm, truncated_text)
    else:
        logger.warning(
            f"No text could be extracted from {file['name']} (even with OCR)."
        )

    matched_clients = _match_clients(clients, client_lookup)

    llm_raw_output = json.dumps({"clients": clients})

    with db_session() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                INSERT INTO {TABLE_REFERRAL_FAX}
                    (drive_file_id, file_name, extracted_text, llm_raw_output)
                VALUES (%s, %s, %s, %s)
                """,
                (file["id"], file["name"], document_text, llm_raw_output),
            )
            fax_id = cursor.lastrowid

            for client_id, matched_name in matched_clients.items():
                cursor.execute(
                    f"""
                    INSERT INTO {TABLE_REFERRAL_FAX_CLIENT_LINK}
                        (faxId, clientId, source, matched_name, confidence)
                    VALUES (%s, %s, 'llm', %s, 1.0)
                    """,
                    (fax_id, client_id, matched_name),
                )
        conn.commit()

    logger.info(
        f"Recorded fax {file['name']} with {len(matched_clients)} candidate client match(es)."
    )


def process_referral_faxes() -> None:
    folder_id = os.getenv("REFERRAL_FAX_INTAKE_FOLDER_ID")
    if not folder_id:
        logger.error("REFERRAL_FAX_INTAKE_FOLDER_ID is not set")
        return

    files = list_files_in_folder(folder_id)
    if not files:
        logger.info("No files found in referral fax intake folder.")
        return

    seen = _already_seen_drive_file_ids()
    new_files = [f for f in files if f["id"] not in seen]
    if not new_files:
        logger.info("No new referral faxes to process.")
        return

    logger.info(f"Found {len(new_files)} new referral fax(es).")

    client_lookup = build_client_lookup(get_all_clients())

    threads = max(1, (os.cpu_count() or 4) - 2)
    limit_cpu_usage(threads)
    llm = load_model(threads)
    if llm is None:
        logger.error("Could not load LLM; aborting.")
        return

    for file in new_files:
        try:
            _process_fax(file, llm, client_lookup)
        except Exception:
            logger.exception(f"Failed to process referral fax {file['name']}")


def main() -> None:
    try:
        validate_config()
        process_referral_faxes()
    except Exception:
        logger.exception("Failed to run referral fax intake")


if __name__ == "__main__":
    main()
