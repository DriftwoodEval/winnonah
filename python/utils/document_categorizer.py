import contextlib
import json
import os
import re
from collections.abc import Callable
from typing import cast

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
# prompt. Kept short on purpose: this is a 4B model with a 4096-token
# context, so the nuance that used to live here as conditional prose now
# lives in CATEGORY_EXAMPLES instead, since worked examples steer a small
# model more reliably than longer if/unless clauses, and cost fewer tokens.
CATEGORY_DEFINITIONS = {
    "Referral": (
        "The document itself is sending a patient to us for care (an ask "
        "to schedule/see/accept them), not just mentioning a past one."
    ),
    "Records Request": (
        "Someone is requesting records/information FROM us, including a "
        "signed release authorization."
    ),
    "Insurance": (
        "Coverage, billing, claims, or prior-authorization paperwork that "
        "is NOT itself a denial or approval decision."
    ),
    "Insurance Denial": "An insurer refuses coverage/a claim/authorization with NOTHING granted.",
    "Insurance Approval": (
        "An insurer approves or authorizes coverage/a claim/treatment, "
        "including a partial or reduced approval."
    ),
    "Status Update Request": (
        "Asking where things stand on an existing referral/request/case, "
        "not submitting anything new."
    ),
    "Patient Documents": (
        "Sending records/information TO us about a patient, with no "
        "current ask to schedule/accept them."
    ),
    "Unsure": "Unclear, or fits none of the above.",
}

# Worked examples for confusions the model has actually made in practice, one
# line each. On a 4B model these steer behavior more reliably (and cheaper)
# than the longer conditional prose they replaced.
CATEGORY_EXAMPLES = [
    (
        "'Referral form, please schedule an appointment... history: "
        "diagnosed with anxiety in 2019' -> Referral, not Patient "
        "Documents (it asks us to schedule; history is just context)."
    ),
    (
        "'Coverage of 16 units has been Reduced to 10 units' -> Insurance "
        "Approval, not Denial (reduced still means something was granted)."
    ),
    (
        "Signed form authorizing us to release records to an attorney -> "
        "Records Request, not Insurance (authorization here means consent "
        "to release, not coverage)."
    ),
]

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


def correct_orientation(image: Image.Image) -> tuple[Image.Image, int]:
    """Detect a scanned page fed in sideways/upside-down and rotate it
    upright before OCR, since Tesseract's text recognition (unlike its
    orientation detection) assumes roughly-horizontal text.

    Returns the (possibly rotated) image and the clockwise angle applied,
    so the caller can also persist the fix into the source PDF page."""
    try:
        osd = pytesseract.image_to_osd(image)
    except pytesseract.TesseractError:
        return image, 0

    match = re.search(r"Rotate: (\d+)", osd)
    if not match:
        return image, 0

    angle = int(match.group(1))
    if angle == 0:
        return image, 0
    return image.rotate(-angle, expand=True), angle


def header_override_category(document_text: str) -> str | None:
    header = document_text[:HEADER_CHARS_CHECKED].upper()
    for marker, category in HEADER_CATEGORY_OVERRIDES.items():
        if marker in header:
            return category
    return None


def extract_text(pdf_path: str, llm: Llama) -> tuple[str, list[str], bytes | None]:
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
            image, angle = correct_orientation(image)
            if angle:
                page.set_rotation((page.rotation + angle) % 360)
                orientation_fixed = True
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
    example_lines = "\n".join(f"  - {example}" for example in CATEGORY_EXAMPLES)
    return (
        "Analyze this document and respond with a single JSON object only.\n"
        '- "category": exactly one of the following, using the definitions '
        'below. If genuinely ambiguous, use "Unsure" rather than '
        "guessing:\n"
        f"{category_lines}\n"
        "Examples of tricky cases:\n"
        f"{example_lines}\n"
        '- "clients": every client/patient full name the document is '
        "about, as a list (empty if none)\n"
        '- "confidence": 0.0-1.0, how certain you are. Be conservative: '
        "default below 0.5. Use 0.8+ only if the category is stated in so "
        'many words (e.g. "this is a referral", "your request is '
        'approved"). Use 0.5-0.8 for a clear inference from context, '
        "including partial/reduced approvals. Use below 0.5 if the "
        "wording is generic, ambiguous, or you're guessing at intent.\n\n"
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
