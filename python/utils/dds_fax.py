"""Faxes to Disability Determination Services (DDS).

When staff approve a request on the Issues page, page 2 of the original DDS
fax is completed (payee name and address filled in, authorized signature
added) and faxed back as the first page, followed by the psychological
evaluation PDF staff selected. Each approved request is faxed once.
"""

import io
import os
import re
from collections import defaultdict
from pathlib import Path

import pymupdf
import pytesseract
from loguru import logger
from PIL import Image

import utils.database
from utils.constants import (
    TABLE_CLIENT,
    TABLE_DDS_FAX_REQUEST,
    TABLE_FAX_CATEGORIZATION,
)
from utils.google import get_file_as_bytes, get_file_by_id, send_gmail

SIGNATURE_PATH = Path("forms/dds_signature.png")
FROM_ADDR = "me"

# Environment variable holding the DDS records fax number (10 digits).
ENV_DDS_FAX_NUMBER = "DDS_FAX_NUMBER"

# The form has a single payee field, so the name and address share it, one per line.
PAYEE_LINES = (
    "DRIFTWOOD EVALUATION CENTER LLC",
    "118A Springhall Drive",
    "Goose Creek, SC 29445",
)

# Page 2 of the incoming fax is the payee form (zero-based index).
FORM_PAGE_INDEX = 1

# The form is located by its printed labels. Text goes just right of the payee
# labels, and the signature image sits on the line directly above its label.
PAYEE_LABEL = "Payee Name and Address:"
SIGNATURE_LABEL = "Authorized Signature"
TEXT_FONT_SIZE = 10
# The payee lines are centered on the form's blank lines, which start at the
# label's left edge, are this wide, and are this far apart. The first one sits
# TEXT_FIRST_LINE_OFFSET below the label.
PAYEE_LINE_WIDTH = 197
TEXT_LINE_HEIGHT = 24
TEXT_FIRST_LINE_OFFSET = 18
SIGNATURE_SIZE = (100, 27)
# Points the signature overlaps down into the label so it rests on the line.
SIGNATURE_DROP = 6
SIGNATURE_OFFSET_X = 15

# The incoming fax is usually a scanned image with no text layer, so labels
# are found by OCR on a render of the page at this zoom (72 dpi * zoom).
OCR_ZOOM = 3


def ocr_lines(page: pymupdf.Page) -> list[list[tuple[str, pymupdf.Rect]]]:
    """OCR a render of the page into lines of (word, rect in page points)."""
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(OCR_ZOOM, OCR_ZOOM))
    data = pytesseract.image_to_data(
        Image.open(io.BytesIO(pixmap.tobytes("png"))),
        output_type=pytesseract.Output.DICT,
    )
    lines = defaultdict(list)
    for i, text in enumerate(data["text"]):
        if not text.strip():
            continue
        left, top = data["left"][i] / OCR_ZOOM, data["top"][i] / OCR_ZOOM
        rect = pymupdf.Rect(
            left,
            top,
            left + data["width"][i] / OCR_ZOOM,
            top + data["height"][i] / OCR_ZOOM,
        )
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines[key].append((text, rect))
    return list(lines.values())


def _normalize(word: str) -> str:
    return re.sub(r"[^\w:]", "", word).lower()


def find_label(page: pymupdf.Page, label: str) -> pymupdf.Rect:
    """Rect of the label (case-insensitive) from the page's text layer, or by
    OCR when the page has none. Raises ValueError when not found."""
    hits = page.search_for(label)
    if hits:
        return hits[0]

    wanted = [_normalize(word) for word in label.split()]
    for line in ocr_lines(page):
        words = [_normalize(word) for word, _ in line]
        for start in range(len(words) - len(wanted) + 1):
            if words[start : start + len(wanted)] == wanted:
                rects = [rect for _, rect in line[start : start + len(wanted)]]
                return pymupdf.Rect(
                    min(r.x0 for r in rects),
                    min(r.y0 for r in rects),
                    max(r.x1 for r in rects),
                    max(r.y1 for r in rects),
                )
    raise ValueError(f'Could not find "{label}" on the DDS fax')


def fill_dds_form(fax_pdf: bytes, signature_png: bytes) -> pymupdf.Document:
    """Page 2 of the DDS fax alone, with payee name and address filled in and
    the signature placed. Raises ValueError if the fax has no page 2 or a label
    is not found."""
    doc = pymupdf.open(stream=fax_pdf, filetype="pdf")
    if len(doc) <= FORM_PAGE_INDEX:
        raise ValueError("The DDS fax has no page 2")
    doc.select([FORM_PAGE_INDEX])
    page = doc[0]

    rect = find_label(page, PAYEE_LABEL)
    for i, line in enumerate(PAYEE_LINES):
        text_width = pymupdf.get_text_length(line, fontsize=TEXT_FONT_SIZE)
        page.insert_text(
            (
                rect.x0 + (PAYEE_LINE_WIDTH - text_width) / 2,
                rect.y1 + TEXT_FIRST_LINE_OFFSET + i * TEXT_LINE_HEIGHT,
            ),
            line,
            fontsize=TEXT_FONT_SIZE,
        )

    rect = find_label(page, SIGNATURE_LABEL)
    width, height = SIGNATURE_SIZE
    page.insert_image(
        pymupdf.Rect(
            rect.x0 + SIGNATURE_OFFSET_X,
            rect.y0 - height + SIGNATURE_DROP,
            rect.x0 + SIGNATURE_OFFSET_X + width,
            rect.y0 + SIGNATURE_DROP,
        ),
        stream=signature_png,
        keep_proportion=True,
    )
    return doc


def build_dds_fax_pdf(
    fax_pdf: bytes, signature_png: bytes, evaluation_pdf: bytes
) -> bytes:
    """Completed page 2 of the DDS fax as page one, followed by the evaluation PDF."""
    doc = fill_dds_form(fax_pdf, signature_png)
    with pymupdf.open(stream=evaluation_pdf, filetype="pdf") as evaluation:
        doc.insert_pdf(evaluation)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def get_approved_dds_requests() -> list[dict]:
    """Approved requests with a selected PDF, with the original fax's Drive id
    and the client's name."""
    with utils.database.get_db() as conn, conn.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT r.id, r.clientId, r.selectedFileId, f.driveFileId AS faxFileId,
                   c.firstName, c.lastName
            FROM {TABLE_DDS_FAX_REQUEST} r
            JOIN {TABLE_FAX_CATEGORIZATION} f ON f.id = r.faxCategorizationId
            JOIN {TABLE_CLIENT} c ON c.id = r.clientId
            WHERE r.status = 'approved' AND r.selectedFileId IS NOT NULL
            ORDER BY r.decidedAt
            """
        )
        return list(cursor.fetchall())


def mark_dds_request_sent(request_id: int) -> None:
    with utils.database.get_db() as conn, conn.cursor() as cursor:
        cursor.execute(
            f"""
            UPDATE {TABLE_DDS_FAX_REQUEST}
            SET status = 'sent', sentAt = UTC_TIMESTAMP()
            WHERE id = %s AND status = 'approved'
            """,
            (request_id,),
        )
        conn.commit()


def send_approved_dds_requests() -> None:
    """Fax each approved request, then mark it sent. A failure leaves the
    request approved so the next run retries it."""
    requests = get_approved_dds_requests()
    if not requests:
        return

    fax_number = os.getenv(ENV_DDS_FAX_NUMBER)
    if not fax_number:
        logger.error(f"{ENV_DDS_FAX_NUMBER} is not set, cannot fax DDS requests")
        return
    signature_png = SIGNATURE_PATH.read_bytes()

    for request in requests:
        try:
            pdf_bytes = build_dds_fax_pdf(
                get_file_as_bytes(get_file_by_id(request["faxFileId"])),
                signature_png,
                get_file_as_bytes(get_file_by_id(request["selectedFileId"])),
            )
        except Exception:
            logger.exception(f"Failed to build DDS fax for request {request['id']}")
            continue

        result = send_gmail(
            message_text="Fax",
            subject="Fax",
            to_addr=f"{fax_number}@redfax.com",
            from_addr=FROM_ADDR,
            attachments=[(pdf_bytes, f"dds_{request['clientId']}.pdf")],
        )
        if result is None:
            logger.error(f"Failed to send DDS fax for request {request['id']}")
            continue

        mark_dds_request_sent(request["id"])
        logger.info(f"Sent DDS fax for request {request['id']}")
