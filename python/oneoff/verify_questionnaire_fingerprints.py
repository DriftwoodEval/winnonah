"""Check how well the questionnaire fingerprints find PDFs in real Drive folders.

For a sample of clients per questionnaire type (COMPLETED, with a Drive folder),
looks for a PDF in the folder matching that type's fingerprint. Prints, per type,
how many folders matched, which other types the matching file also matched
(ambiguous fingerprints), and links to folders with no match so you can open them
and see what is really inside. The links identify clients, so don't share the output.

Run from python/: uv run python -m oneoff.verify_questionnaire_fingerprints
"""

from __future__ import annotations

import argparse
import random
from collections import Counter, defaultdict

from googleapiclient.errors import HttpError
from loguru import logger
from tqdm import tqdm

from utils.database import db_session
from utils.google import list_files_recursive
from utils.questionnaire_pdfs import (
    FINGERPRINTS,
    drive_leading_pages_text,
    matching_types,
    pdfs_hinted_first,
)

FOLDER_URL = "https://drive.google.com/drive/folders/"
FILE_URL = "https://drive.google.com/file/d/"

QUERY = """
    SELECT q.questionnaireType AS type, c.driveId AS drive_id
    FROM emr_questionnaire q
    JOIN emr_client c ON c.id = q.clientId
    WHERE q.status = 'COMPLETED' AND c.driveId IS NOT NULL
      AND q.sent >= CURDATE() - INTERVAL %s DAY
"""


def folder_match(
    drive_id: str, qtype: str
) -> tuple[tuple[str, set[str]] | None, int, int]:
    """Look for a PDF matching qtype. Returns ((matching file id, all types it
    matched), or None if no file matched), plus counts of PDFs with no text
    layer and PDFs that couldn't be opened."""
    scanned = unreadable = 0
    for f in pdfs_hinted_first(list_files_recursive(drive_id), qtype):
        text = drive_leading_pages_text(f, qtype)
        if text is None:
            unreadable += 1
        elif not text.strip():
            scanned += 1
        types = matching_types(text or "")
        if qtype in types:
            return (f["id"], types), scanned, unreadable
    return None, scanned, unreadable


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--per-type",
        type=int,
        default=40,
        help="random folders checked per type; the match count covers all of them",
    )
    parser.add_argument(
        "--links", type=int, default=5, help="pass and miss links listed per type"
    )
    parser.add_argument(
        "--days", type=int, default=90, help="only questionnaires sent this recently"
    )
    parser.add_argument(
        "--skip",
        type=lambda value: [t.strip() for t in value.split(",")],
        default=[],
        help="comma-separated questionnaire types to skip, e.g. --skip 'ABAS 3, Vineland'",
    )
    args = parser.parse_args()

    with db_session() as conn, conn.cursor() as cur:
        cur.execute(QUERY, (args.days,))
        rows = cur.fetchall()

    folders_by_type: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        folders_by_type[row["type"]].append(row["drive_id"])

    summary: list[str] = []
    for qtype in sorted(folders_by_type):
        if qtype in args.skip:
            continue
        if qtype not in FINGERPRINTS:
            summary.append(f"=== {qtype}: no fingerprint, skipped ===")
            continue
        folders = folders_by_type[qtype]
        sample = random.sample(folders, min(args.per_type, len(folders)))
        logger.info(f"{qtype}: checking {len(sample)} of {len(folders)} folders")
        checked = matched = scanned = unreadable = 0
        also: Counter[str] = Counter()
        passes: list[str] = []
        misses: list[str] = []
        bad_folders: list[str] = []
        bar = tqdm(sample, desc=qtype, unit="folder")
        for drive_id in bar:
            try:
                result, folder_scanned, folder_unreadable = folder_match(
                    drive_id, qtype
                )
            except HttpError:
                bad_folders.append(f"{FOLDER_URL}{drive_id}")
                continue
            checked += 1
            scanned += folder_scanned
            unreadable += folder_unreadable
            if result is None:
                misses.append(f"{FOLDER_URL}{drive_id}")
            else:
                file_id, types = result
                matched += 1
                also.update(types - {qtype})
                passes.append(f"{FILE_URL}{file_id}/view")
            bar.set_postfix(matched=matched, missed=len(misses))

        logger.info(f"{qtype}: {matched}/{checked} matched")
        summary.append(f"=== {qtype}: {matched}/{checked} folders matched ===")
        summary.append(
            f"  PDFs with no text layer: {scanned}, unreadable: {unreadable}"
        )
        for other, n in also.most_common():
            summary.append(f"  matching file also matched {other}: {n} times")
        summary.extend(f"  passed, file: {url}" for url in passes[: args.links])
        summary.extend(f"  missed, folder: {url}" for url in misses[: args.links])
        if bad_folders:
            summary.append(
                f"  folders that couldn't be opened (404 or no access): {len(bad_folders)}"
            )
            summary.extend(f"    {url}" for url in bad_folders[: args.links])

    logger.info("\n\nSUMMARY\n" + "\n".join(summary))


if __name__ == "__main__":
    main()
