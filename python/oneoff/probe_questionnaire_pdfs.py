"""Find text that identifies each questionnaire type inside completed clients' Drive PDFs.

For each questionnaire type, looks at clients whose questionnaire is COMPLETED,
reads the first pages of every PDF in their Drive folder (downloading only the
first --max-kb of each), and prints the most common opening lines. With
--min-clients 1 the output includes client names and dates, so don't share it.

Run from python/: uv run python -m oneoff.probe_questionnaire_pdfs
"""

from __future__ import annotations

import argparse
import re
from collections import Counter, defaultdict

import pymupdf
from loguru import logger
from tqdm import tqdm

from utils.database import db_session
from utils.google import (
    download_start,
    get_file_as_bytes,
    list_files_in_folder,
    list_files_recursive,
)
from utils.questionnaire_pdfs import (
    FINGERPRINTS,
    LEADING_PAGES,
    drive_leading_pages_text,
    matching_types,
    pdfs_hinted_first,
    squash,
)

# Truncated downloads make MuPDF print a stderr error for every cut-off object.
pymupdf.TOOLS.mupdf_display_errors(False)

FILE_URL = "https://drive.google.com/file/d/"
EXAMPLES_PER_PHRASE = 3
HEADER_LINES = 15
MAX_LINE_CHARS = 80

QUERY = """
    SELECT q.questionnaireType AS type, c.driveId AS drive_id,
           c.firstName, c.lastName, c.preferredName
    FROM emr_questionnaire q
    JOIN emr_client c ON c.id = q.clientId
    WHERE q.status = 'COMPLETED' AND c.driveId IS NOT NULL
"""


def name_tokens(row: dict) -> set[str]:
    names = [row["firstName"], row["lastName"], row["preferredName"]]
    words = (w for name in names if name for w in re.split(r"\W+", name.lower()))
    return {w for w in words if len(w) > 1}


def file_name_phrases(file_name: str, tokens: set[str]) -> set[str]:
    """All 1 to 3 word phrases in a file name. Digit runs (ids, dates) split
    words apart and are discarded, as are the client's own name words."""
    stem = file_name.rsplit(".", 1)[0].lower()
    words = [w for w in re.split(r"[^a-z]+", stem) if len(w) > 2 and w not in tokens]
    return {
        " ".join(words[i : i + size])
        for size in (1, 2, 3)
        for i in range(len(words) - size + 1)
    }


def without_subsumed(phrase_clients: Counter[str]) -> list[tuple[str, int]]:
    """Drop a phrase when a longer phrase containing it has the same count,
    so 'conners' and 'conners self' don't both list for the same files."""
    return [
        (phrase, n)
        for phrase, n in phrase_clients.most_common()
        if not any(
            phrase != other and phrase in other and n == other_n
            for other, other_n in phrase_clients.items()
        )
    ]


def remember_examples(
    examples: dict[str, list[str]], keys: set[str] | list[str], file_id: str
) -> None:
    """Keep up to EXAMPLES_PER_PHRASE file ids for each key."""
    for key in keys:
        ids = examples.setdefault(key, [])
        if len(ids) < EXAMPLES_PER_PHRASE and file_id not in ids:
            ids.append(file_id)


def leading_pages_lines(pdf_bytes: bytes) -> list[str] | None:
    """Top HEADER_LINES text lines of each of the first LEADING_PAGES pages, []
    for pages with no text layer, None if the (possibly truncated) bytes can't be
    opened as a PDF."""
    try:
        with pymupdf.open(stream=pdf_bytes, filetype="pdf") as doc:
            if doc.page_count == 0:
                return None
            lines: list[str] = []
            for i in range(min(LEADING_PAGES, doc.page_count)):
                page_lines = (
                    " ".join(line.split()) for line in doc[i].get_text().splitlines()
                )
                lines += [line[:MAX_LINE_CHARS] for line in page_lines if line][
                    :HEADER_LINES
                ]
            return lines
    except (
        RuntimeError,
        ValueError,
    ):  # FileDataError, or ValueError for a password-protected PDF
        return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--per-type", type=int, default=15, help="clients sampled per type"
    )
    parser.add_argument(
        "--min-clients",
        type=int,
        default=3,
        help="a line must appear for this many clients",
    )
    parser.add_argument(
        "--top", type=int, default=10, help="lines printed per type, most common first"
    )
    parser.add_argument(
        "--max-kb", type=int, default=256, help="download only this much of each PDF"
    )
    parser.add_argument(
        "--names-only",
        action="store_true",
        help="instead of page lines, print common file name phrases of the PDFs "
        "that match the type's text fingerprint (candidates for name hints)",
    )
    parser.add_argument(
        "--type",
        action="append",
        help="only this questionnaire type (repeatable), e.g. --type PAI",
    )
    args = parser.parse_args()

    with db_session() as conn, conn.cursor() as cur:
        cur.execute(QUERY)
        rows = cur.fetchall()

    logger.info(f"{len(rows)} completed questionnaires with a drive folder")
    clients_by_type: dict[str, list[tuple[str, set[str]]]] = defaultdict(list)
    for row in rows:
        if not args.type or row["type"] in args.type:
            clients_by_type[row["type"]].append((row["drive_id"], name_tokens(row)))

    logger.info(f"{len(clients_by_type)} questionnaire types")
    summary: list[str] = []
    for type_number, (qtype, clients) in enumerate(
        sorted(clients_by_type.items()), start=1
    ):
        if args.names_only and qtype not in FINGERPRINTS:
            continue  # no text fingerprint to tell which PDF is the questionnaire
        sample = clients[: args.per_type]
        line_clients: Counter[str] = Counter()
        name_clients: Counter[str] = Counter()
        example_files: dict[str, list[str]] = {}  # phrase or line -> file ids
        pdf_count = scanned_count = unreadable_count = 0
        # Types with name hints only read PDFs whose name contains one.
        name_fragments = FINGERPRINTS[qtype].hints if qtype in FINGERPRINTS else ()
        bar = tqdm(
            sample,
            desc=f"[{type_number}/{len(clients_by_type)}] {qtype}",
            unit="folder",
        )
        for drive_id, tokens in bar:
            seen_lines: set[str] = set()
            if args.names_only:
                # The first PDF whose text matches qtype's fingerprint is that
                # client's questionnaire; its name is what a hint should match.
                for f in pdfs_hinted_first(list_files_recursive(drive_id), qtype):
                    text = drive_leading_pages_text(f, qtype)
                    if text and qtype in matching_types(text):
                        phrases = file_name_phrases(f["name"], tokens)
                        remember_examples(example_files, phrases, f["id"])
                        name_clients.update(phrases)
                        pdf_count += 1
                        break
                continue
            files = list_files_in_folder(drive_id)
            for f in files:
                if f["mimeType"] != "application/pdf":
                    continue
                if name_fragments and not any(
                    squash(n) in squash(f["name"]) for n in name_fragments
                ):
                    continue
                pdf_count += 1
                lines = leading_pages_lines(download_start(f["id"], args.max_kb * 1024))
                if lines is None:  # truncated too short, so read the whole file
                    lines = leading_pages_lines(get_file_as_bytes(f))
                if lines is None:
                    unreadable_count += 1
                elif not lines:
                    scanned_count += 1
                else:
                    seen_lines.update(lines)
                    remember_examples(example_files, lines, f["id"])
            line_clients.update(seen_lines)

        summary.append(
            f"=== {qtype} ({len(clients)} completed, sampled {len(sample)}) ==="
        )
        if args.names_only:
            summary.append(f"Folders with a text-matched PDF: {pdf_count}")
            shared = [
                (phrase, n)
                for phrase, n in without_subsumed(name_clients)
                if n >= args.min_clients
            ][: args.top]
        else:
            summary.append(
                f"PDFs: {pdf_count}, no text layer: {scanned_count}, unreadable (truncated too short?): {unreadable_count}"
            )
            shared = [
                (line, n)
                for line, n in line_clients.most_common(args.top)
                if n >= args.min_clients
            ]
        for text, n in shared:
            summary.append(f"  {n:>3} clients | {text}")
            summary.extend(
                f"      {FILE_URL}{file_id}/view" for file_id in example_files[text]
            )

    logger.info("\n\nSUMMARY\n" + "\n".join(summary))


if __name__ == "__main__":
    main()
