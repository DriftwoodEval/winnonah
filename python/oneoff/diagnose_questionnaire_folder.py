"""Explain why a Drive folder did or didn't match a questionnaire type's fingerprint.

For every item in the folder prints the name, type, whether the PDF opened, whether
it has a text layer, which questionnaire types it matched, and for the chosen type
which fingerprint phrases were found in the leading pages. Output identifies a client, so
don't share it.

Run from python/:
  uv run python -m oneoff.diagnose_questionnaire_folder FOLDER_URL_OR_ID "ASRS (2-5 Years)"
"""

from __future__ import annotations

import argparse
import re
from typing import Any, cast

import pymupdf
from loguru import logger

from utils.google import (
    get_drive_service,
    get_file_as_bytes,
    list_files_recursive,
)
from utils.questionnaire_pdfs import (
    FINGERPRINTS,
    drive_leading_pages_text,
    matching_types,
    squash,
)

PREVIEW_LINES = 6


def folder_id(value: str) -> str:
    match = re.search(r"folders/([\w-]+)", value)
    return match.group(1) if match else value


def log_raw_listing(folder: str) -> None:
    """Log every direct child with no filters, including trashed items, shortcuts
    and shared drive content, to compare with what list_files_in_folder returns."""
    service = get_drive_service()
    info = (
        service.files()
        .get(fileId=folder, fields="name, driveId", supportsAllDrives=True)
        .execute()
    )
    logger.info(f"folder is in a shared drive: {'driveId' in info}")
    page_token = None
    while True:
        resp = (
            service.files()
            .list(
                q=f"'{folder}' in parents",
                fields="nextPageToken, files(name, mimeType, trashed, shortcutDetails)",
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        for item in resp.get("files", []):
            logger.info(
                f"raw: {item['name']} [{item['mimeType']}] trashed={item['trashed']}"
                + (" SHORTCUT" if "shortcutDetails" in item else "")
            )
        page_token = resp.get("nextPageToken")
        if not page_token:
            break


def extraction_variants(page: pymupdf.Page) -> dict[str, str]:
    """Page text pulled out in several ways, since the same text layer can read
    cleanly in one mode and scrambled in another."""
    rawdict = cast(dict[str, Any], page.get_text("rawdict"))
    raw_chars = "".join(
        char["c"]
        for block in rawdict["blocks"]
        if block["type"] == 0
        for line in block["lines"]
        for span in line["spans"]
        for char in span["chars"]
    )
    return {
        "default": str(page.get_text()),
        "sorted": str(page.get_text(sort=True)),
        "no spaces": str(page.get_text(flags=pymupdf.TEXT_INHIBIT_SPACES)),
        "ligatures kept": str(page.get_text(flags=pymupdf.TEXT_PRESERVE_LIGATURES)),
        "words": " ".join(str(w[4]) for w in page.get_text("words")),
        "raw chars": raw_chars,
    }


def log_extraction_modes(pdf_bytes: bytes, phrases: tuple[str, ...]) -> None:
    with pymupdf.open(stream=pdf_bytes, filetype="pdf") as doc:
        variants = extraction_variants(doc[0])
    for mode, text in variants.items():
        squashed = squash(text)
        found = ", ".join(
            f"{'yes' if squash(p) in squashed else 'NO'}" for p in phrases
        )
        logger.info(f"  mode {mode}: {found}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", help="Drive folder link or id")
    parser.add_argument("qtype", help="questionnaire type, e.g. 'ASRS (2-5 Years)'")
    parser.add_argument(
        "--modes",
        action="store_true",
        help="also try each text extraction mode (downloads whole PDFs)",
    )
    args = parser.parse_args()
    fingerprint = FINGERPRINTS[args.qtype]

    log_raw_listing(folder_id(args.folder))
    files = list_files_recursive(folder_id(args.folder))
    logger.info(f"{len(files)} files in folder and subfolders")
    for f in files:
        logger.info(f"{f['path']}{f['name']}  [{f['mimeType']}]")
        is_pdf = f["mimeType"] == "application/pdf" or f["name"].lower().endswith(
            ".pdf"
        )
        if not is_pdf:
            logger.info("  not treated as a PDF (mime type and extension)")
            continue
        if args.modes:
            logger.info(f"  phrases tried: {fingerprint.texts}")
            log_extraction_modes(get_file_as_bytes(f), fingerprint.texts)
            continue
        text = drive_leading_pages_text(f)
        if text is None:
            logger.info("  could not open even the whole file (corrupt or encrypted?)")
            continue
        if not text.strip():
            logger.info(
                "  opened, but the leading pages have no text layer (scan, needs OCR)"
            )
            continue
        logger.info(f"  matches: {sorted(matching_types(text)) or 'none'}")
        squashed = squash(text)
        for phrase in fingerprint.texts:
            found = "yes" if squash(phrase) in squashed else "NO"
            logger.info(f"  phrase {found}: {phrase}")
        lines = [" ".join(line.split()) for line in text.splitlines() if line.strip()]
        logger.info(f"  first lines: {lines[:PREVIEW_LINES]}")


if __name__ == "__main__":
    main()
