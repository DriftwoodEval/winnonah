import contextlib
import json
import os
import re
from collections import Counter
from collections.abc import Callable
from typing import cast

import fitz  # PyMuPDF
import pytesseract
from llama_cpp import Llama
from llama_cpp.llama_types import ChatCompletionRequestMessage
from loguru import logger
from PIL import Image

from utils.misc import capitalize_name_with_exceptions

CATEGORIES = ["Referral", "Records Request", "Insurance", "Patient Documents", "Unsure"]

# One-line disambiguation for each category, shown to the model in the
# prompt.
CATEGORY_DEFINITIONS = {
    "Referral": (
        "The document itself is sending a patient to us for care. A "
        "document that merely mentions or summarizes a past referral as "
        "part of the patient's care history is NOT a Referral."
    ),
    "Records Request": (
        "Someone is requesting records/information FROM us, including a "
        "signed authorization/consent form allowing us to release those "
        "records - even if the word 'authorization' appears, this is not "
        "Insurance unless it's about coverage/billing."
    ),
    "Insurance": (
        "Coverage, billing, or claims paperwork, or an insurer's prior "
        "authorization for treatment - NOT a patient's signed "
        "authorization/consent to release their own records, which is a "
        "Records Request."
    ),
    "Patient Documents": (
        "Someone is sending records/information TO us about a patient "
        "(e.g. medical history, special education history, a summary of "
        "care) - not a request, and not itself a referral for care."
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
    },
    "required": ["category", "clients"],
}

# Temperature used when sampling multiple votes. 0 would just repeat the same
# greedy answer every time, so voting needs some randomness to actually
# explore alternative readings of an ambiguous document.
VOTE_TEMPERATURE = 0.7

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


def correct_orientation(image: Image.Image) -> Image.Image:
    """Detect a scanned page fed in sideways/upside-down and rotate it
    upright before OCR, since Tesseract's text recognition (unlike its
    orientation detection) assumes roughly-horizontal text."""
    try:
        osd = pytesseract.image_to_osd(image)
    except pytesseract.TesseractError:
        return image

    match = re.search(r"Rotate: (\d+)", osd)
    if not match:
        return image

    angle = int(match.group(1))
    if angle == 0:
        return image
    return image.rotate(-angle, expand=True)


def header_override_category(document_text: str) -> str | None:
    header = document_text[:HEADER_CHARS_CHECKED].upper()
    for marker, category in HEADER_CATEGORY_OVERRIDES.items():
        if marker in header:
            return category
    return None


def extract_text(pdf_path: str, llm: Llama) -> tuple[str, list[str]]:
    doc = fitz.open(pdf_path)
    pages: list[str] = []
    sources: list[str] = []
    page_count = doc.page_count
    n_ctx = llm.n_ctx()

    for page_number, page in enumerate(doc.pages(), start=1):
        text = cast(str, page.get_text()).strip()
        source = "pdf text"

        if len(text) < MIN_TEXT_LENGTH_PER_PAGE:
            pix = page.get_pixmap(dpi=300)
            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            image = correct_orientation(image)
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

    doc.close()
    return "\n\n".join(pages), sources


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


def analyze_document(
    llm: Llama, document_text: str, temperature: float = 0.0
) -> tuple[str, list[str]]:
    """Single grammar-constrained call that gets both the category and the
    client name(s) together, instead of two separate prompts that would each
    re-prefill the whole (possibly large) document text."""
    prompt = build_prompt(document_text)

    messages: list[ChatCompletionRequestMessage] = [{"role": "user", "content": prompt}]

    response = llm.create_chat_completion(
        messages=messages,
        stream=False,
        max_tokens=RESPONSE_TOKEN_RESERVE,
        temperature=temperature,
        response_format={"type": "json_object", "schema": DOCUMENT_SCHEMA},
    )
    response = cast(dict, response)
    content = response["choices"][0]["message"]["content"] or "{}"

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        data = {}

    category = str(data.get("category", ""))
    raw_clients = data.get("clients") or []
    clients = [
        capitalize_name_with_exceptions(str(name))
        for name in raw_clients
        if name and str(name).lower() != "none"
    ]
    return category, clients


def analyze_with_votes(
    llm: Llama, document_text: str, votes: int, want_clients: bool = True
) -> tuple[str, list[str], Counter]:
    """Sample `votes` independent analyses and majority-vote the category
    (self-consistency), instead of trusting a single greedy answer. The
    client list returned is from whichever sample matched the winning
    category (first match), since clients aren't voted on independently."""
    override = header_override_category(document_text)

    document_text = fit_to_context(
        llm, document_text, build_prompt, RESPONSE_TOKEN_RESERVE
    )

    if override:
        # The letterhead alone decides the category - skip sampling/voting
        # on a question already answered. Only spend a call on clients if
        # they were actually asked for.
        if not want_clients:
            return override, [], Counter([override])
        _, clients = analyze_document(llm, document_text)
        return override, clients, Counter([override])

    if votes <= 1:
        category, clients = analyze_document(llm, document_text)
        return category, clients, Counter([category])

    samples = [
        analyze_document(llm, document_text, temperature=VOTE_TEMPERATURE)
        for _ in range(votes)
    ]
    counts = Counter(category for category, _ in samples)
    winner, _ = counts.most_common(1)[0]
    clients = next(clients for category, clients in samples if category == winner)
    return winner, clients, counts


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
