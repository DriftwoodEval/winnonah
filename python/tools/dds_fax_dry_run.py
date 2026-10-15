"""Build the DDS fax from local PDFs without touching the database, Drive, or
fax service, to check label placement before real requests go through.

Usage (from python/):
    uv run python -m tools.dds_fax_dry_run --fax dds_fax.pdf --evaluation eval.pdf
Writes temp/dds-fax-dry-run/<fax name>_completed.pdf.

Add --dump to list what OCR finds on the form page (each line with its
position, and whether each label is located) instead of building the PDF.
"""

import argparse
from pathlib import Path

import pymupdf
from loguru import logger

from utils.dds_fax import (
    FORM_PAGE_INDEX,
    PAYEE_LABEL,
    SIGNATURE_LABEL,
    SIGNATURE_PATH,
    build_dds_fax_pdf,
    find_label,
    ocr_lines,
)


def dump_form_page(fax_pdf: bytes) -> None:
    """Log the form page's size, each label's hits, and every text block."""
    with pymupdf.open(stream=fax_pdf, filetype="pdf") as doc:
        logger.info(f"Fax has {len(doc)} page(s)")
        if len(doc) <= FORM_PAGE_INDEX:
            return
        page = doc[FORM_PAGE_INDEX]
        logger.info(f"Form page size: {page.rect}")
        for label in (PAYEE_LABEL, SIGNATURE_LABEL):
            try:
                logger.info(f'Label "{label}": {find_label(page, label)}')
            except ValueError:
                logger.warning(f'Label "{label}": NOT FOUND')
        for line in ocr_lines(page):
            x0 = min(rect.x0 for _, rect in line)
            y0 = min(rect.y0 for _, rect in line)
            logger.info(f"({x0:.0f}, {y0:.0f}) {' '.join(word for word, _ in line)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fax", type=Path, required=True, help="Incoming DDS fax PDF")
    parser.add_argument(
        "--evaluation",
        type=Path,
        help="Evaluation PDF to append (not needed with --dump)",
    )
    parser.add_argument(
        "--dump", action="store_true", help="List what is found on the form page"
    )
    parser.add_argument(
        "--signature", type=Path, default=SIGNATURE_PATH, help="Signature PNG"
    )
    args = parser.parse_args()

    if args.dump:
        dump_form_page(args.fax.read_bytes())
        return
    if not args.evaluation:
        parser.error("--evaluation is required unless --dump is used")

    pdf_bytes = build_dds_fax_pdf(
        args.fax.read_bytes(), args.signature.read_bytes(), args.evaluation.read_bytes()
    )
    out_dir = Path("temp/dds-fax-dry-run")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{args.fax.stem}_completed.pdf"
    out_path.write_bytes(pdf_bytes)
    logger.info(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
