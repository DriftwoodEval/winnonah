import io

import pymupdf
import pytest
from PIL import Image

from utils.dds_fax import PAYEE_LINES, build_dds_fax_pdf, find_label


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


def test_missing_label_raises():
    with pytest.raises(ValueError, match="Authorized Signature"):
        build_dds_fax_pdf(_fax("Payee Name and Address:"), _png(), _pdf("x"))


def test_single_page_fax_raises():
    with pytest.raises(ValueError, match="page 2"):
        build_dds_fax_pdf(_pdf(*FORM_LINES), _png(), _pdf("x"))


def test_labels_are_found_by_ocr_on_a_scanned_page():
    source = pymupdf.open(stream=_pdf("Payee Name and Address:"), filetype="pdf")[0]
    scanned = pymupdf.open()
    page = scanned.new_page()
    page.insert_image(page.rect, pixmap=source.get_pixmap(dpi=200))
    assert not page.get_text()

    rect = find_label(page, "Payee Name and Address:")

    assert rect.x0 == pytest.approx(72, abs=10)
    assert rect.y1 == pytest.approx(100, abs=10)
