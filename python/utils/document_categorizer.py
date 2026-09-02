import contextlib
import json
import os
import re
from collections.abc import Callable
from pathlib import Path
from typing import cast

import cv2
import numpy as np
import pymupdf as fitz
import pytesseract
from llama_cpp import Llama
from llama_cpp.llama_types import ChatCompletionRequestMessage
from loguru import logger
from PIL import Image

from utils.misc import capitalize_name_with_exceptions

CATEGORIES = [
    "Referral",
    "Records Request",
    "Insurance",
    "Insurance Denial",
    "Insurance Approval",
    "Status Update Request",
    "Patient Documents",
    "Unsure",
]

# One-line disambiguation for each category, shown to the model in the
# prompt.
CATEGORY_DEFINITIONS = {
    "Referral": (
        "The document itself is sending a patient to us for care - look "
        "for an explicit ask to schedule/see/accept the patient, a "
        "referring provider's name/contact info, or a title like "
        "'Referral Information Form'. This is true even when the "
        "document also includes patient history (medical history, "
        "diagnosis, prior care) alongside that ask - history included TO "
        "support a referral is still a Referral, not Patient Documents. "
        "A document that merely mentions or summarizes a past referral as "
        "part of the patient's care history, with no current ask to "
        "schedule or accept the patient, is NOT a Referral."
    ),
    "Records Request": (
        "Someone is requesting records/information FROM us, including a "
        "signed authorization/consent form allowing us to release those "
        "records - even if the word 'authorization' appears, this is not "
        "Insurance unless it's about coverage/billing. An insurance "
        "company asking us for more information/documentation to process "
        "a claim or authorization is Insurance, not Records Request, even "
        "though it's technically requesting records from us - the sender "
        "being an insurer handling a claim is what controls, not the "
        "'requesting records' phrasing."
    ),
    "Insurance": (
        "Coverage, billing, or claims paperwork, or an insurer's prior "
        "authorization for treatment, that is NOT specifically a denial or "
        "approval decision. Includes an insurer asking us for additional "
        "information/documentation/records needed to process a claim or "
        "authorization. NOT a patient's signed authorization/consent to "
        "release their own records, which is a Records Request."
    ),
    "Insurance Denial": (
        "An insurer is refusing coverage, a claim, or prior authorization "
        "for treatment, with NOTHING granted. If any visits, sessions, or "
        "coverage are granted anywhere in the letter, even a reduced "
        "amount, that makes it an Insurance Approval instead, even if the "
        "same letter also refuses part of what was requested - a letter "
        "is only a Denial when the entire request is refused. Appeal-"
        "rights language and phrases like 'adverse determination' appear "
        "on approval letters too (for the part not granted), so don't "
        "treat those alone as denial signal; look for the actual outcome. "
        "The word 'Reduced' describing the decision on a request (e.g. "
        "'the request... has been Reduced') is NEVER a Denial by itself - "
        "a reduction means some units/visits/hours were still granted, "
        "just fewer than requested, which makes it an Approval."
    ),
    "Insurance Approval": (
        "An insurer is approving or authorizing coverage, a claim, or "
        "prior authorization for treatment, including a partial or "
        "reduced approval (fewer visits/sessions than requested, or "
        "coverage at a lower level than requested, or only some of "
        "several requested services granted). Look for explicit approval "
        "language (e.g. 'approved', 'authorized', 'partially approved', "
        "'reduced', effective dates or number of visits/sessions "
        "granted). This applies even if the letter also describes denying "
        "the remainder of the request - if ANYTHING is granted, it's an "
        "Approval, not a Denial. A decision stated only as 'Reduced' "
        "(without the word 'denied') is an Approval: the request was "
        "granted at a lower amount, not refused."
    ),
    "Status Update Request": (
        "Someone is asking where things stand on a client - a check-in "
        "asking for a status update, progress report, or timeline on an "
        "existing referral, request, or case, rather than submitting a "
        "new request or sending new information."
    ),
    "Patient Documents": (
        "Someone is sending records/information TO us about a patient "
        "(e.g. medical history, special education history, a summary of "
        "care) with no current ask to schedule/see/accept the patient - "
        "not a request, and not itself a referral for care. If the same "
        "document also asks us to schedule or take on the patient, that "
        "ask makes it a Referral instead, even though it contains patient "
        "history."
    ),
    "Unsure": "The document's category is unclear or it fits none of the above.",
}

# Below this many characters of extracted text, assume the page is a scan
# (e.g. image-only) rather than genuine empty content, and fall back to OCR.
MIN_TEXT_LENGTH_PER_PAGE = 20

# Only the letterhead/heading is checked (the first HEADER_CHARS_CHECKED
# characters), not the whole document - these senders are unambiguous from
# who they are, regardless of body wording that otherwise confuses the model
# (e.g. Disability Determination Services letters mentioning "authorization"
# get misread as Insurance). Matching anywhere in the body risks false
# triggers from the name being referenced for an unrelated reason. Sized
# generously (not just the heading's own length) because fax cover banners
# (date/time, sender helpdesk number, page count) often get extracted ahead
# of the actual letterhead.
HEADER_CHARS_CHECKED = 500
HEADER_CATEGORY_OVERRIDES = {
    "DISABILITY DETERMINATION SERVICES": "Records Request",
}

# Tokens set aside for the model's reply: a JSON object with a category
# string and a handful of client names.
RESPONSE_TOKEN_RESERVE = 96

DOCUMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": CATEGORIES},
        "clients": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "number"},
    },
    "required": ["category", "clients", "confidence"],
}

# For callers that already know a document's category from context (e.g.
# everything in a given intake folder is the same kind of document), so
# there's no reason to also ask the model to classify it.
CLIENT_SCHEMA = {
    "type": "object",
    "properties": {
        "clients": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["clients"],
}

# Emulates driftwood@opti (Dell OptiPlex 5060): Intel i5-8500, 6 cores/no
# SMT, 14.92 GiB RAM with ~3.06 GiB already used by the rest of the system.
SIMULATED_SPECS = {
    "opti": {
        "threads": 6 - 2,
        "max_memory_gib": 14.92 - 3.06,
    },
    "plex": {
        "threads": 4 - 2,
        "max_memory_gib": 15 - 2,
    },
}


# Tesseract's OSD reports an "Orientation confidence" alongside the angle.
# On a noisy or sparse fax page it happily returns a wrong 90/270 with a
# confidence well under 1, and the caller persists that rotation into the
# Drive copy, so a page that was upright lands sideways. We trust OSD only
# when it clears this on both the raw and the denoised render and the two
# agree (see page_rotation); otherwise we read the page four ways.
MIN_ORIENTATION_CONFIDENCE = 2.0

# Fallback when OSD isn't confident: OCR the page at all four 90-degree
# rotations and keep whichever reads as the most text. The score is the
# summed word confidence (rewards both more words and cleaner ones), since
# a page upside down still yields a fair count of low-confidence junk that
# a bare word count doesn't separate from the right way up. Act outright
# only when the best rotation clears a floor and beats the rest by the
# margin. When two rotations read close to each other (a page whose
# upright and upside down, or occasionally two perpendicular renders, look
# about as legible to OCR) a raw+clean-agreed OSD reading breaks the tie
# even below the confidence we'd trust it at on its own. Otherwise the
# page is unreadable (blank, heavy handwriting) and we leave it as
# received; every fax gets a human review anyway.
_MIN_WORD_CONFIDENCE = 55
_MIN_ORIENTATION_SCORE = 800.0
_ORIENTATION_SCORE_MARGIN = 1.35
_MIN_OSD_TIEBREAK_CONFIDENCE = 1.0
_WORDLIKE = re.compile(r"[A-Za-z]{3,}")


def _denoise_binarize(image: Image.Image) -> np.ndarray:
    """Grayscale, strip fax speckle, and threshold to crisp black/white.
    Shared by the orientation checks and the pre-OCR cleanup; does not
    deskew (that step needs a settled orientation first)."""
    grayscale = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
    denoised = cv2.fastNlMeansDenoising(grayscale, h=10)
    return cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        15,
    )


def _readability_score(image: Image.Image) -> float:
    """Summed confidence of the word-shaped tokens Tesseract reads off this
    image. A proxy for 'is this text the right way up': high when the page
    is upright and legible, near zero when it's sideways or blank."""
    try:
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    except pytesseract.TesseractError:
        return 0.0
    return sum(
        float(conf)
        for text, conf in zip(data["text"], data["conf"], strict=True)
        if float(conf) >= _MIN_WORD_CONFIDENCE and _WORDLIKE.search(text)
    )


def _rotation_scores(image: Image.Image) -> dict[int, float]:
    """Readability score at each of the four 90-degree rotations."""
    return {
        angle: _readability_score(
            image if angle == 0 else image.rotate(-angle, expand=True)
        )
        for angle in (0, 90, 180, 270)
    }


def _orient_by_reading(
    image: Image.Image, osd_hint: int | None = None, osd_conf: float = 0.0
) -> int:
    """Decide orientation by OCR when OSD can't: score 0/90/180/270 and
    return the clockwise angle of the most readable one, or 0 if none reads
    well enough to be sure.

    `osd_hint` is a raw+clean-agreed OSD angle (with `osd_conf` its lower
    confidence). It's only consulted to break a near-tie between the top
    two rotations: for a genuine 180-degree up/down tie the OSD angle wins
    directly, for an odd perpendicular near-tie the higher-reading rotation
    wins once OSD has vouched that it's plausible."""
    scores = _rotation_scores(image)
    logger.debug(
        f"Orientation-by-reading scores: { {a: round(s) for a, s in scores.items()} }"
    )
    ranked = sorted(scores, key=lambda a: scores[a], reverse=True)
    best, second = ranked[0], ranked[1]

    if scores[best] < _MIN_ORIENTATION_SCORE:
        return 0
    if scores[best] >= _ORIENTATION_SCORE_MARGIN * max(scores[second], 1.0):
        return best
    if osd_hint in (best, second) and osd_conf >= _MIN_OSD_TIEBREAK_CONFIDENCE:
        return osd_hint if (best - second) % 180 == 0 else best
    return 0


def _osd_reading(image: Image.Image) -> tuple[int, float]:
    """Tesseract's orientation call: (clockwise angle to upright, confidence).
    A failed or unparseable reading comes back as (0, 0.0)."""
    try:
        osd = pytesseract.image_to_osd(image)
    except pytesseract.TesseractError:
        return 0, 0.0
    angle = re.search(r"Rotate: (\d+)", osd)
    confidence = re.search(r"Orientation confidence: ([\d.]+)", osd)
    return (
        int(angle.group(1)) if angle else 0,
        float(confidence.group(1)) if confidence else 0.0,
    )


def page_rotation(rgb: Image.Image, binary: np.ndarray) -> int:
    """Clockwise angle (0/90/180/270) to turn a scanned page upright before
    OCR, since Tesseract's text recognition (unlike its orientation
    detection) assumes roughly-horizontal text. 0 means already upright, or
    not callable with confidence.

    Trusts Tesseract OSD outright only when it reads the same confident
    angle off both the raw render and the denoised `binary`: binarizing a
    hard page can hand OSD a confident-looking reading the raw page doesn't
    support. Otherwise reads the page four ways (see _orient_by_reading),
    passing along a weaker raw+clean-agreed OSD angle as a tiebreaker."""
    clean = Image.fromarray(binary)
    raw_angle, raw_conf = _osd_reading(rgb)
    clean_angle, clean_conf = _osd_reading(clean)

    agreed = raw_angle if raw_angle == clean_angle else None
    conf = min(raw_conf, clean_conf)

    if agreed is not None and conf >= MIN_ORIENTATION_CONFIDENCE:
        return agreed

    logger.debug(
        f"OSD not jointly confident (raw {raw_angle}deg@{raw_conf:.1f}, "
        f"clean {clean_angle}deg@{clean_conf:.1f}); reading page four ways"
    )
    return _orient_by_reading(clean, osd_hint=agreed, osd_conf=conf)


def _rotate_clockwise(binary: np.ndarray, angle: int) -> np.ndarray:
    """Lossless 90-degree-multiple clockwise rotation of a binary page.
    Returns a contiguous array so OpenCV (in _deskew) accepts it."""
    return np.ascontiguousarray(np.rot90(binary, k=(-angle // 90) % 4))


# Beyond this, assume the Hough line detector locked onto something other
# than text baselines (a torn/folded edge, a stray mark) rather than a real
# skew: page_rotation already handles gross 90-degree turns, so a
# larger residual angle here is more likely noise than a real fax tilt.
MAX_DESKEW_ANGLE_DEGREES = 15


def _estimate_skew_angle(binary: np.ndarray) -> float:
    """Estimates the rotation needed to level the page, from the
    predominant angle of near-horizontal text lines (via Hough line
    detection). Takes the median across all detected lines so a handful of
    stray marks or a torn edge can't skew the result the way fitting a
    single bounding box to every dark pixel would.

    Returned in the same sign convention cv2.getRotationMatrix2D expects
    (i.e. the correction to apply), not the raw skew of the page."""
    edges = cv2.Canny(binary, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180,
        threshold=150,
        minLineLength=binary.shape[1] // 3,
        maxLineGap=20,
    )
    if lines is None:
        return 0.0

    angles = []
    for x1, y1, x2, y2 in lines.reshape(-1, 4):
        angle = float(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
        if abs(angle) <= MAX_DESKEW_ANGLE_DEGREES:
            angles.append(angle)

    return float(np.median(angles)) if angles else 0.0


def _deskew(binary: np.ndarray) -> np.ndarray:
    """Straightens the small (non-90-degree) tilt a fax transmission or
    sloppy feed leaves behind, which page_rotation's 90-degree
    orientation check doesn't catch."""
    angle = _estimate_skew_angle(binary)
    if abs(angle) < 0.1:
        return binary

    height, width = binary.shape
    center = (width // 2, height // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(
        binary,
        matrix,
        (width, height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )


def header_override_category(document_text: str) -> str | None:
    header = document_text[:HEADER_CHARS_CHECKED].upper()
    for marker, category in HEADER_CATEGORY_OVERRIDES.items():
        if marker in header:
            return category
    return None


def extract_text(
    pdf_path: str,
    llm: Llama,
    *,
    clean_faxes: bool = True,
    save_preprocessed_dir: str | None = None,
) -> tuple[str, list[str], bytes | None]:
    doc = fitz.open(pdf_path)
    pages: list[str] = []
    sources: list[str] = []
    page_count = doc.page_count
    n_ctx = llm.n_ctx()
    orientation_fixed = False

    for page_number, page in enumerate(doc.pages(), start=1):
        text = cast(str, page.get_text()).strip()
        source = "pdf text"

        if len(text) < MIN_TEXT_LENGTH_PER_PAGE:
            pix = page.get_pixmap(dpi=300)
            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            binary = _denoise_binarize(image)

            angle = page_rotation(image, binary)
            if angle:
                page.set_rotation((page.rotation + angle) % 360)
                orientation_fixed = True
                image = image.rotate(-angle, expand=True)
                binary = _rotate_clockwise(binary, angle)

            if clean_faxes:
                # binary is already denoised and rotated upright; deskewing
                # the small residual tilt is all that's left.
                image = Image.fromarray(_deskew(binary))
            if save_preprocessed_dir:
                stem = Path(pdf_path).stem
                out_dir = Path(save_preprocessed_dir)
                out_dir.mkdir(parents=True, exist_ok=True)
                image.save(out_dir / f"{stem}_page{page_number}.png")
            text = pytesseract.image_to_string(image).strip()
            source = "image scan (OCR)"

        logger.debug(f"Page {page_number}/{page_count}: {source}")
        pages.append(text)
        sources.append(source)

        # A header override on page 1 already decides the category, and
        # these forms are known to carry it on page 1 - no need to
        # extract/OCR further pages just to re-derive an answer we have.
        if page_number == 1 and header_override_category(text) is not None:
            logger.debug("Header matches a known override; skipping remaining pages.")
            break

        # Anything beyond the context window gets truncated away later
        # anyway (see fit_to_context), so there's no point paying for OCR
        # on further pages once we've already got more text than fits.
        token_count = len(
            llm.tokenize("\n\n".join(pages).encode("utf-8"), add_bos=False)
        )
        if token_count >= n_ctx:
            logger.debug(
                f"Reached the {n_ctx}-token context window after page "
                f"{page_number}/{page_count}; skipping remaining pages."
            )
            break

    corrected_pdf = doc.tobytes() if orientation_fixed else None
    doc.close()
    return "\n\n".join(pages), sources, corrected_pdf


def build_prompt(document_text: str) -> str:
    category_lines = "\n".join(
        f"  - {name}: {CATEGORY_DEFINITIONS[name]}" for name in CATEGORIES
    )
    return (
        "Analyze this document and respond with a single JSON object only.\n"
        '- "category": exactly one of the following, using the definitions '
        "below to pick the best fit. If it's unclear or genuinely "
        'ambiguous which category applies, use "Unsure" rather than '
        "guessing:\n"
        f"{category_lines}\n"
        '- "clients": every client/patient full name the document is '
        "about, as a list (empty list if none is identifiable)\n"
        '- "confidence": a number from 0.0 to 1.0 for how certain you are '
        "of the category. Be conservative: most real documents are NOT "
        "clear-cut, so assume the correct score is below 0.5 unless the "
        "evidence forces you "
        "higher, and treat 0.9+ as reserved for the rare document that "
        "leaves no room for doubt at all. Score above 0.8 only when the "
        "category is stated in so many words on the page (e.g. a letter "
        "that literally says 'this is a referral' or 'your request is "
        "approved'), score 0.5-0.8 when it takes a reasonable inference "
        "from clear context, and score below 0.5 whenever the wording is "
        "generic, the document could plausibly fit more than one "
        "category, or you are guessing at intent rather than reading it "
        "directly off the page. A letter that mixes approval and denial "
        "wording for different parts of the same request (e.g. a partial "
        "or reduced approval that also lists what wasn't granted) is a "
        "case where the category is still clear from whether anything "
        "was granted, but treat it as a 0.5-0.8 case, not 0.9+, since the "
        "mixed wording is easy to misread.\n\n"
        "Document:\n"
        f"{document_text}"
    )


def build_client_prompt(document_text: str) -> str:
    return (
        "Respond with a single JSON object only.\n"
        '- "clients": every client/patient full name this document is '
        "about, as a list (empty list if none is identifiable)\n\n"
        "Document:\n"
        f"{document_text}"
    )


def fit_to_context(
    llm: Llama,
    document_text: str,
    prompt_builder: Callable[[str], str],
    response_reserve: int,
) -> str:
    """Truncate document_text so the full prompt fits the model's context
    window. Running on low-power hardware means we keep n_ctx small rather
    than raising it (a bigger window means slower, heavier prefill on every
    request), so long/OCR'd documents get trimmed instead."""
    n_ctx = llm.n_ctx()
    template_tokens = len(llm.tokenize(prompt_builder("").encode("utf-8")))
    budget = n_ctx - template_tokens - response_reserve

    doc_tokens = llm.tokenize(document_text.encode("utf-8"), add_bos=False)
    if len(doc_tokens) <= budget:
        return document_text

    logger.debug(
        f"Document is {len(doc_tokens)} tokens, which exceeds the "
        f"{budget}-token budget for this {n_ctx}-token context window; "
        "truncating to fit."
    )
    return llm.detokenize(doc_tokens[:budget]).decode("utf-8", errors="ignore")


def _complete_json(llm: Llama, prompt: str, schema: dict, temperature: float) -> dict:
    """Runs a single grammar-constrained chat completion and returns the
    parsed JSON object (empty dict if the model's reply isn't valid JSON)."""
    messages: list[ChatCompletionRequestMessage] = [{"role": "user", "content": prompt}]

    response = llm.create_chat_completion(
        messages=messages,
        stream=False,
        max_tokens=RESPONSE_TOKEN_RESERVE,
        temperature=temperature,
        response_format={"type": "json_object", "schema": schema},
    )
    response = cast(dict, response)
    content = response["choices"][0]["message"]["content"] or "{}"

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {}


def _clean_client_names(raw_clients: object) -> list[str]:
    if not isinstance(raw_clients, list):
        return []
    return [
        capitalize_name_with_exceptions(str(name))
        for name in raw_clients
        if name and str(name).lower() != "none"
    ]


def _clean_confidence(raw_confidence: object) -> float:
    try:
        confidence = float(cast(str, raw_confidence))
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, confidence))


def analyze_document(llm: Llama, document_text: str) -> tuple[str, list[str], float]:
    """Single grammar-constrained call that gets the category, client
    name(s), and the model's own confidence in the category together,
    instead of separate prompts that would each re-prefill the whole
    (possibly large) document text."""
    data = _complete_json(llm, build_prompt(document_text), DOCUMENT_SCHEMA, 0.0)
    category = str(data.get("category", ""))
    clients = _clean_client_names(data.get("clients"))
    confidence = _clean_confidence(data.get("confidence"))
    return category, clients, confidence


def extract_clients(llm: Llama, document_text: str) -> list[str]:
    """Pulls just the client/patient name(s) out of a document, skipping the
    category classification analyze_document also does. Use this when the
    document's category is already known from context (e.g. an intake
    folder that only ever contains one kind of document)."""
    data = _complete_json(llm, build_client_prompt(document_text), CLIENT_SCHEMA, 0.0)
    return _clean_client_names(data.get("clients"))


def categorize_document(
    llm: Llama, document_text: str, want_clients: bool = True
) -> tuple[str, list[str], float]:
    """Categorizes a document, honoring a header override (letterhead alone
    decides the category, treated as fully certain) before falling back to
    the model. Only spends a call on clients if they were actually asked
    for."""
    override = header_override_category(document_text)
    if override and not want_clients:
        return override, [], 1.0

    document_text = fit_to_context(
        llm, document_text, build_prompt, RESPONSE_TOKEN_RESERVE
    )

    if override:
        clients = extract_clients(llm, document_text)
        return override, clients, 1.0

    return analyze_document(llm, document_text)


def limit_memory_usage(max_gib: float) -> None:
    """Cap this process's address space so it OOMs the way a machine with
    only this much free memory actually would, instead of quietly eating
    into RAM this dev box happens to have spare."""
    try:
        import resource  # noqa: PLC0415 (Unix-only, so imported conditionally)
    except ImportError:
        return  # not available on Windows

    max_bytes = int(max_gib * 1024**3)
    try:
        _, hard = resource.getrlimit(resource.RLIMIT_AS)
        resource.setrlimit(resource.RLIMIT_AS, (max_bytes, hard))
    except (ValueError, OSError) as e:
        logger.warning(f"Could not apply memory limit: {e}")


def limit_cpu_usage(max_threads: int) -> None:
    """Cap how much CPU this process (and the OCR subprocesses it spawns)
    can hog, so the rest of the machine stays usable while a long
    extraction/categorization run is going.

    Thread-count params (n_threads, OMP_THREAD_LIMIT, etc.) only cap how many
    threads *we* spawn - they don't stop those threads from being scheduled
    across every core and reading as 100% system-wide. Restricting CPU
    affinity is what actually enforces a hard ceiling, since a thread can
    only ever run on a CPU it's allowed to use.
    """
    # Covers OpenMP (tesseract) and common BLAS backends some llama.cpp
    # builds link against, in case they ignore n_threads/n_threads_batch.
    for var in (
        "OMP_THREAD_LIMIT",
        "OMP_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "MKL_NUM_THREADS",
    ):
        os.environ.setdefault(var, str(max_threads))

    # Lower our own scheduling priority (POSIX only) so the OS favors other
    # processes over ours when CPU is contended. Never raises even if the
    # platform/permissions don't support it.
    if hasattr(os, "nice"):
        with contextlib.suppress(OSError):
            os.nice(10)

    # Hard cap: restrict which CPUs this process (and subprocesses it
    # spawns, like tesseract) is allowed to run on at all. Linux-only.
    if hasattr(os, "sched_setaffinity"):
        try:
            available = sorted(os.sched_getaffinity(0))
            allowed = set(available[:max_threads]) or {available[0]}
            os.sched_setaffinity(0, allowed)
        except OSError:
            pass


def load_model(n_threads: int) -> Llama | None:
    repo_id = "unsloth/gemma-4-E4B-it-GGUF"
    filename = "gemma-4-E4B-it-Q4_K_M.gguf"

    logger.info(
        f"Checking cache and pulling model from {repo_id} if missing "
        "(this can take a while on first run)..."
    )

    try:
        llm = Llama.from_pretrained(
            repo_id=repo_id,
            filename=filename,
            n_ctx=4096,
            n_threads=n_threads,
            # Left unset, this defaults to using every core for prompt
            # processing regardless of n_threads - explicitly cap it too.
            n_threads_batch=n_threads,
            flash_attn=True,
            verbose=False,
        )
    except Exception as e:
        logger.error(f"Error loading model: {e}")
        return None

    logger.info("Model loaded.")
    return llm
