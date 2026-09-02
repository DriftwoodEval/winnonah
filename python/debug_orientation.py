"""Debug the fax-categorization page-rotation step against a real Drive file.

Downloads a Drive PDF (by link or id) and, for every page that takes the
OCR path in document_categorizer.extract_text, shows:
  - the page's existing /Rotate value (what's baked into the PDF now)
  - the Tesseract OSD reading (angle + confidence) the pipeline tries first
  - the readability score (summed word confidence) at each of the four
    rotations on the denoised image (the fallback signal when OSD isn't sure)
  - what page_rotation() actually decides for the page

PNGs are written to temp/orientation-debug/<id>/: pageNN_current.png as it
renders now, pageNN_fixed.png for any page the pipeline would rotate. If
anything changes, a corrected.pdf is written; --apply pushes it to Drive.

--probe N deep-dives one page: renders it at all four rotations with an
OSD reading for each, so you can pick the upright one by eye.

--set "N=DEG,..." sets an absolute /Rotate on those pages and writes a
corrected.pdf. Add --apply to push that back to Drive (overwrites it).

Run from the python/ dir:
    uv run python debug_orientation.py <ID>
    uv run python debug_orientation.py <ID> --probe 2
    uv run python debug_orientation.py <ID> --set "2=270" --apply
"""

# ruff: noqa: T201  (this is a console debugging tool; print is the point)

import re
import sys
from pathlib import Path

import pymupdf as fitz
import pytesseract
import typer
from loguru import logger
from PIL import Image
from pytesseract import Output

from utils.document_categorizer import (
    MIN_TEXT_LENGTH_PER_PAGE,
    _denoise_binarize,
    _orient_by_reading,
    _readability_score,
    page_rotation,
)
from utils.google import get_file_as_bytes, get_file_by_id, update_file_content

app = typer.Typer(add_completion=False, pretty_exceptions_show_locals=False)

OUT_ROOT = Path("temp/orientation-debug")


def parse_drive_id(link_or_id: str) -> str:
    """Accept a raw file id or any of the usual Drive URL shapes."""
    for pattern in (r"/d/([\w-]+)", r"[?&]id=([\w-]+)"):
        match = re.search(pattern, link_or_id)
        if match:
            return match.group(1)
    return link_or_id.strip()


def render(page: fitz.Page, dpi: int, extra_rotation: int = 0) -> Image.Image:
    """Render a page to a PIL image, optionally spinning it a further
    `extra_rotation` degrees clockwise on top of its own /Rotate."""
    matrix = fitz.Matrix(dpi / 72, dpi / 72)
    if extra_rotation:
        matrix = matrix * fitz.Matrix(extra_rotation)
    pix = page.get_pixmap(matrix=matrix)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def osd(image: Image.Image) -> dict:
    """Tesseract orientation reading, or a zeroed result if it bails."""
    try:
        return pytesseract.image_to_osd(image, output_type=Output.DICT)
    except pytesseract.TesseractError as err:
        logger.warning(f"OSD failed: {err}")
        return {"rotate": 0, "orientation_conf": 0.0, "script": "?", "script_conf": 0.0}


def osd_cell(r: dict) -> str:
    return f"+{int(r['rotate']) % 360}@{float(r['orientation_conf']):.1f}"


def osd_line(reading: dict) -> str:
    return (
        f"osd wants +{int(reading['rotate']) % 360:<3}  "
        f"conf {float(reading['orientation_conf']):>6.2f}  "
        f"script {reading['script']} ({float(reading['script_conf']):.2f})"
    )


def load(link_or_id: str) -> tuple[str, dict, fitz.Document, Path]:
    file_id = parse_drive_id(link_or_id)
    meta = get_file_by_id(file_id)
    logger.info(f"{meta['name']}  ({meta['mimeType']})  id={file_id}")
    pdf_bytes = get_file_as_bytes(meta)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    out_dir = OUT_ROOT / file_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "original.pdf").write_bytes(pdf_bytes)
    return file_id, meta, doc, out_dir


@app.command()
def main(
    link_or_id: str = typer.Argument(..., help="Drive share link or bare file id"),
    probe: int = typer.Option(
        0, help="Deep-dive a single page number: render all 4 rotations + OSD each"
    ),
    set_: str = typer.Option(
        "",
        "--set",
        help='Absolute /Rotate to force, e.g. "2=270" or "2=270,5=90". '
        "Writes corrected.pdf; add --apply to push it to Drive.",
    ),
    dpi: int = typer.Option(300, help="Render DPI"),
    apply: bool = typer.Option(
        False, "--apply", help="Push corrected.pdf back to Drive (overwrites it)"
    ),
):
    _file_id, meta, doc, out_dir = load(link_or_id)

    if probe:
        page = doc[probe - 1]
        print(f"\nPage {probe}: current /Rotate = {page.rotation}")
        # Strip the page's own rotation so `extra` is an absolute reading.
        page.set_rotation(0)
        for extra in (0, 90, 180, 270):
            image = render(page, dpi, extra)
            path = out_dir / f"page{probe:02d}_rot{extra:03d}.png"
            image.save(path)
            print(f"  /Rotate {extra:>3}  ->  {osd_line(osd(image))}   {path}")
        print(
            "\nOpen those 4 PNGs, see which is upright, then re-run with "
            f'--set "{probe}=<that number>" --apply'
        )
        return

    if set_:
        for chunk in set_.split(","):
            pg, _, deg = chunk.partition("=")
            doc[int(pg) - 1].set_rotation(int(deg) % 360)
            print(f"Page {pg}: /Rotate set to {int(deg) % 360}")
        corrected = out_dir / "corrected.pdf"
        corrected.write_bytes(doc.tobytes())
        print(f"Wrote {corrected}")
        if apply:
            typer.confirm(f"Overwrite the Drive copy of {meta['name']}?", abort=True)
            update_file_content(_file_id, corrected.read_bytes(), "application/pdf")
            print("Drive copy updated.")
        return

    header = (
        f"{'pg':>3} {'/Rot':>5} {'osd raw':>13} {'osd clean':>13}   "
        f"{'read score @ 0/90/180/270':<28} {'reads':>6} {'decision':<10}"
    )
    print(header)
    print("-" * len(header))

    changed = False
    for i, page in enumerate(doc.pages(), start=1):
        text = (page.get_text() or "").strip()
        if len(text) >= MIN_TEXT_LENGTH_PER_PAGE:
            print(f"{i:>3} {page.rotation:>5}   (has text, not OCR'd)")
            continue

        image = render(page, dpi)
        image.save(out_dir / f"page{i:02d}_current.png")
        binary = _denoise_binarize(image)
        clean = Image.fromarray(binary)

        raw_osd, clean_osd = osd(image), osd(clean)
        scores = {
            a: _readability_score(clean if a == 0 else clean.rotate(-a, expand=True))
            for a in (0, 90, 180, 270)
        }
        reads_pick = _orient_by_reading(clean)
        decided_angle = page_rotation(image, binary)
        if decided_angle:
            image.rotate(-decided_angle, expand=True).save(
                out_dir / f"page{i:02d}_fixed.png"
            )
            page.set_rotation((page.rotation + decided_angle) % 360)
            changed = True

        score_str = "/".join(f"{round(scores[a]):>5}" for a in (0, 90, 180, 270))
        print(
            f"{i:>3} {page.rotation:>5} {osd_cell(raw_osd):>13} "
            f"{osd_cell(clean_osd):>13}   {score_str:<28} "
            f"{('+' + str(reads_pick)):>6} "
            f"{('rotate +' + str(decided_angle)) if decided_angle else 'leave':<10}"
        )

    print(f"\nPer-page PNGs in {out_dir}/ (pageNN_current, pageNN_fixed)")
    if not changed:
        print("Pipeline would leave every page as-is.")
        return

    corrected = out_dir / "corrected.pdf"
    corrected.write_bytes(doc.tobytes())
    print(f"Wrote {corrected}")
    if apply:
        typer.confirm(f"Overwrite the Drive copy of {meta['name']}?", abort=True)
        update_file_content(_file_id, corrected.read_bytes(), "application/pdf")
        print("Drive copy updated.")
    else:
        print("Drive copy NOT touched (pass --apply to push corrected.pdf).")


if __name__ == "__main__":
    if len(sys.argv) == 1:
        sys.argv.append("--help")
    app()
