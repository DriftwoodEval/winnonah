import pymupdf

from utils import questionnaire_pdfs
from utils.questionnaire_pdfs import (
    DrivePdfMatcher,
    leading_pages_text,
    matching_types,
    pdfs_hinted_first,
)


def test_text_match_ignores_line_breaks_and_symbols():
    text = "C. Keith Conners, Ph.D.\nPARENT |\nSINGLE-RATER REPORT"
    assert matching_types(text) == {"Conners 4"}


def test_conners_self_is_not_parent():
    text = "C. Keith Conners, Ph.D. SELF-REPORT | SINGLE-RATER REPORT"
    assert matching_types(text) == {"Conners 4 Self"}


def test_shared_self_report_text_matches_both_srs_types():
    text = "Adult (Self-Report) Form Ages 19 years and up"
    assert matching_types(text) == {"SRS-2", "SRS Self"}


def test_no_match():
    assert matching_types("Thank you for your payment") == set()


def test_conners_ec_matches_text_on_page_two():
    text = "By C. Keith Conners, Ph.D.\n\fConners Early Childhood\u2013P\nAssessment Report"
    assert matching_types(text) == {"Conners EC"}


def _pdf(*page_texts: str) -> bytes:
    doc = pymupdf.open()
    for text in page_texts:
        doc.new_page().insert_text((72, 72), text)
    return doc.tobytes()


def test_leading_pages_text_stops_once_the_type_matches():
    pdf = _pdf("Adult (Self-Report) Form Ages 19 years and up", "page two")
    assert "page two" not in (leading_pages_text(pdf, "SRS-2") or "")
    assert "page two" in (leading_pages_text(pdf) or "")


def test_abas3_adult_self_report_is_not_srs():
    text = "Adult Form (Self-Report)\nAges 16-89"
    assert matching_types(text) == {"ABAS 3"}


def test_name_hint_only_changes_read_order():
    pdf = "application/pdf"
    files = [
        {"name": "scan.pdf", "mimeType": pdf},
        {"name": "notes.docx", "mimeType": "text/plain"},
        {"name": "ABAS3_report.pdf", "mimeType": pdf},
    ]
    names = [f["name"] for f in pdfs_hinted_first(files, "ABAS 3")]
    assert names == ["ABAS3_report.pdf", "scan.pdf"]
    assert matching_types("ABAS3_report") == set()


def _count_downloads(monkeypatch, start: bytes, full: bytes) -> list[str]:
    calls: list[str] = []

    def fake_start(_file_id, _max_bytes):
        calls.append("start")
        return start

    def fake_full(_file):
        calls.append("full")
        return full

    monkeypatch.setattr(questionnaire_pdfs, "download_start", fake_start)
    monkeypatch.setattr(questionnaire_pdfs, "get_file_as_bytes", fake_full)
    return calls


def test_matcher_reads_a_small_file_once_for_every_type(monkeypatch):
    pdf = _pdf("Adult Form (Self-Report) Ages 16-89")
    calls = _count_downloads(monkeypatch, start=pdf, full=pdf)
    matcher = DrivePdfMatcher()
    file = {"id": "f1"}
    assert matcher.matches(file, "ABAS 3")
    assert not matcher.matches(file, "SRS-2")
    assert not matcher.matches(file, "Vineland")
    assert calls == ["start"]


def test_matcher_downloads_the_whole_file_once_when_the_start_is_not_enough(
    monkeypatch,
):
    pdf = _pdf("Adult Form (Self-Report) Ages 16-89")
    start = b"x" * questionnaire_pdfs.PARTIAL_BYTES  # a cut-off start with no text
    calls = _count_downloads(monkeypatch, start=start, full=pdf)
    matcher = DrivePdfMatcher()
    file = {"id": "f1"}
    assert not matcher.matches(file, "SRS-2")
    assert matcher.matches(file, "ABAS 3")
    assert not matcher.matches(file, "Vineland")
    assert calls == ["start", "full"]
