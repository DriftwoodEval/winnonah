"""Fingerprints that identify each questionnaire type's PDF in a client's Drive folder.

A file matches a type when the text of its first LEADING_PAGES pages contains every
one of the type's text phrases. A type's name hints only put likely files first.
Comparison ignores case, spacing and punctuation, so line breaks and symbols
like "|" or "(" in the PDF text don't matter.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import pymupdf

from utils.google import download_start, get_file_as_bytes

# Truncated downloads make MuPDF print a stderr error for every cut-off object.
pymupdf.TOOLS.mupdf_display_errors(False)

PARTIAL_BYTES = 256 * 1024
LEADING_PAGES = 2


@dataclass(frozen=True)
class Fingerprint:
    hints: tuple[str, ...] = ()  # file name fragments: files with one are checked first
    texts: tuple[str, ...] = ()  # all must appear in the leading pages to match


_ADULT_SELF_REPORT = ("Adult (Self-Report) Form", "Ages 19 years and up")

# lazy: PAI and CAT-Q have no fingerprint yet, so they are never checked.
FINGERPRINTS: dict[str, Fingerprint] = {
    "ABAS 3": Fingerprint(
        hints=("abas3",), texts=("Adult Form (Self-Report)", "Ages 16-89")
    ),
    "ASRS (2-5 Years)": Fingerprint(
        hints=("asrs",),
        texts=("Autism Spectrum Rating Scales (2-5 Years)", "Parent Ratings"),
    ),
    "ASRS (6-18 Years)": Fingerprint(
        hints=("asrs",),
        texts=("Autism Spectrum Rating Scales (6-18 Years)", "Parent Ratings"),
    ),
    # "BASC" without a version number covers both BASC-3 and BASC-4.
    "BASC Preschool": Fingerprint(
        hints=("basc report",), texts=("BASC", "Parent Rating Scales - Preschool")
    ),
    "BASC Child": Fingerprint(
        hints=("basc report",), texts=("BASC", "Parent Rating Scales - Child")
    ),
    "BASC Adolescent": Fingerprint(
        hints=("basc report",), texts=("BASC", "Parent Rating Scales - Adolescent")
    ),
    "CAARS 2": Fingerprint(
        hints=("caars",), texts=("Conners Adult ADHD Rating Scales 2nd Edition",)
    ),
    "Conners 4": Fingerprint(
        hints=("conners single raterreport",),
        texts=("C. Keith Conners, Ph.D.", "PARENT | SINGLE-RATER REPORT"),
    ),
    "Conners 4 Self": Fingerprint(
        hints=("conners", "self"),
        texts=("C. Keith Conners, Ph.D.", "SELF-REPORT | SINGLE-RATER REPORT"),
    ),
    "Conners EC": Fingerprint(
        hints=("ConnersEC_AssessmentReport",),
        texts=("Conners Early Childhood-P Assessment Report",),
    ),
    "DP-4": Fingerprint(
        hints=("dp4_p-checklist",), texts=("Parent/Caregiver Checklist Score Report",)
    ),
    "SRS-2": Fingerprint(hints=("srs adults",), texts=_ADULT_SELF_REPORT),
    "SRS Self": Fingerprint(hints=("srs adults",), texts=_ADULT_SELF_REPORT),
    "Vineland": Fingerprint(
        hints=("vineland comprehensive",),
        texts=(
            "Vineland Adaptive Behavior Scales, Third Edition",
            "Comprehensive Parent/Caregiver Form Report",
        ),
    ),
}


def squash(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def leading_pages_text(pdf_bytes: bytes, qtype: str | None = None) -> str | None:
    """Text of the first LEADING_PAGES pages, "" for pages with no text layer,
    None if the (possibly truncated) bytes can't be opened as a PDF. Stops reading
    pages once the text so far matches qtype. A page cut off by truncation ends
    the text there instead of discarding the pages before it."""
    try:
        with pymupdf.open(stream=pdf_bytes, filetype="pdf") as doc:
            if doc.page_count == 0:
                return None
            text = ""
            for i in range(min(LEADING_PAGES, doc.page_count)):
                try:
                    text += str(doc[i].get_text(sort=True)) + "\n"
                except RuntimeError:
                    if i == 0:
                        return None
                    break
                if qtype and qtype in matching_types(text):
                    break
            return text
    except (
        RuntimeError,
        ValueError,
    ):  # FileDataError, or ValueError for a password-protected PDF
        return None


def drive_leading_pages_text(file: dict, qtype: str | None = None) -> str | None:
    """Leading pages text of a Drive PDF. With qtype, first tries only the start of the
    file and keeps it if it matches qtype: a partial download can lose characters
    but never invents a match. Otherwise reads the whole file."""
    if qtype:
        text = leading_pages_text(download_start(file["id"], PARTIAL_BYTES), qtype)
        if text is not None and qtype in matching_types(text):
            return text
    return leading_pages_text(get_file_as_bytes(file), qtype)


def matching_types(page_text: str) -> set[str]:
    """Questionnaire types whose text phrases all appear in the page text."""
    text = squash(page_text)
    return {
        qtype
        for qtype, fp in FINGERPRINTS.items()
        if text and fp.texts and all(squash(t) in text for t in fp.texts)
    }


def pdfs_hinted_first(files: list[dict], qtype: str) -> list[dict]:
    """The PDFs among files, those whose name contains one of qtype's hints first.
    A hint only changes the order files are read in, never whether one matches."""
    hints = [squash(h) for h in FINGERPRINTS[qtype].hints]
    pdfs = [f for f in files if f["mimeType"] == "application/pdf"]
    return sorted(pdfs, key=lambda f: not any(h in squash(f["name"]) for h in hints))
