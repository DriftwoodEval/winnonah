import io
import shutil
from unittest.mock import MagicMock, patch

import pymupdf
import pytest
from PIL import Image

from utils.dds_fax import (
    PAYEE_LINES,
    build_dds_fax_pdf,
    find_label,
    mark_dds_request_sent,
)

requires_tesseract = pytest.mark.skipif(
    shutil.which("tesseract") is None,
    reason="tesseract is not installed (the Docker test image includes it)",
)


def _pdf(*lines: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    for i, line in enumerate(lines):
        page.insert_text((72, 100 + i * 60), line)
    return doc.tobytes()


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (30, 10), "black").save(buffer, format="PNG")
    return buffer.getvalue()


def _fax(*form_lines: str) -> bytes:
    """A DDS fax: a cover page followed by the form page."""
    doc = pymupdf.open(stream=_pdf("cover page"), filetype="pdf")
    doc.insert_pdf(pymupdf.open(stream=_pdf(*form_lines), filetype="pdf"))
    return doc.tobytes()


FORM_LINES = ("Payee Name and Address:", "Authorized Signature")
FAX = _fax(*FORM_LINES)


def test_form_is_filled_signed_and_followed_by_evaluation():
    result = pymupdf.open(
        stream=build_dds_fax_pdf(FAX, _png(), _pdf("evaluation body")), filetype="pdf"
    )

    assert len(result) == 2
    first_page = result[0]
    for line in PAYEE_LINES:
        assert first_page.search_for(line)
    assert len(first_page.get_images()) == 1
    assert "cover page" not in first_page.get_text()
    assert "evaluation body" in result[1].get_text()


@requires_tesseract
def test_missing_label_raises():
    with pytest.raises(ValueError, match="Authorized Signature"):
        build_dds_fax_pdf(_fax("Payee Name and Address:"), _png(), _pdf("x"))


def test_single_page_fax_raises():
    with pytest.raises(ValueError, match="page 2"):
        build_dds_fax_pdf(_pdf(*FORM_LINES), _png(), _pdf("x"))


@requires_tesseract
def test_labels_are_found_by_ocr_on_a_scanned_page():
    source = pymupdf.open(stream=_pdf("Payee Name and Address:"), filetype="pdf")[0]
    scanned = pymupdf.open()
    page = scanned.new_page()
    page.insert_image(page.rect, pixmap=source.get_pixmap(dpi=200))
    assert not page.get_text()

    rect = find_label(page, "Payee Name and Address:")

    assert rect.x0 == pytest.approx(72, abs=10)
    assert rect.y1 == pytest.approx(100, abs=10)


def test_cover_page_alone_with_note():
    result = pymupdf.open(
        stream=build_dds_fax_pdf(FAX, _png(), note="No evaluation on file"),
        filetype="pdf",
    )

    assert len(result) == 1
    assert result[0].search_for("No evaluation on file")
    assert result[0].get_images() == []


def test_overlong_note_raises():
    with pytest.raises(ValueError, match="too long"):
        build_dds_fax_pdf(FAX, _png(), note="word " * 2000)


def test_marking_a_request_sent_audits_the_pdf_that_went_out():

    request = {
        "id": 4,
        "clientId": 9,
        "faxCategorizationId": 2,
        "selectedFileId": "file1",
        "selectedFileName": "eval.pdf",
        "coverNote": None,
    }
    with (
        patch("utils.dds_fax.utils.database.get_db", return_value=MagicMock()),
        patch("utils.dds_fax.utils.database.record_audit_log") as record,
    ):
        mark_dds_request_sent(request)

    args = record.call_args
    assert args.args[1:3] == ("python.dds_fax.sent", 9)
    assert args.kwargs["detail"]["selectedFileName"] == "eval.pdf"
    assert args.kwargs["detail"]["hasCoverNote"] is False
