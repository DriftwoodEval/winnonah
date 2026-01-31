import io
import multiprocessing
import os
import tempfile

import pytesseract
from googleapiclient.http import MediaIoBaseDownload
from huggingface_hub import hf_hub_download
from llama_cpp import Llama
from loguru import logger
from pdf2image import convert_from_path
from pypdf import PdfReader

from utils.google import get_drive_service, get_items_in_folder

MODEL_REPO = "microsoft/Phi-3-mini-4k-instruct-gguf"
MODEL_FILE = "Phi-3-mini-4k-instruct-q4.gguf"
# Use relative path for flexibility (local vs docker)
TEMP_DIR = os.path.join(os.getcwd(), "temp")
MODEL_PATH = os.path.join(TEMP_DIR, MODEL_FILE)

_llm = None


def get_llm():
    global _llm
    if _llm is None:
        logger.info("Loading LLM model...")
        if not os.path.exists(MODEL_PATH):
            logger.info(f"Downloading model {MODEL_FILE} from {MODEL_REPO}...")
            # Ensure temp dir exists
            os.makedirs(TEMP_DIR, exist_ok=True)
            hf_hub_download(
                repo_id=MODEL_REPO,
                filename=MODEL_FILE,
                local_dir=TEMP_DIR,
            )

        # Determine reasonable thread count (leave 2 cores free if possible, min 1)
        # i5-8500 has 6 cores. usage = 4.
        n_threads = max(1, multiprocessing.cpu_count() - 2)

        # Load model (CPU optimized by default with llama-cpp-python)
        _llm = Llama(
            model_path=MODEL_PATH,
            n_ctx=4096,  # Phi-3 context window
            n_threads=n_threads,
            n_batch=1024,  # Increase batch size for faster prompt processing
            verbose=False,
        )
        logger.info(f"LLM model loaded with {n_threads} threads.")
    return _llm


def download_file_content(service, file_id, file_name):
    """Downloads file content to a temporary file and returns the path."""
    request = service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while done is False:
        status, done = downloader.next_chunk()

    fh.seek(0)

    # Save to temp file to process with pdf2image/pypdf
    fd, path = tempfile.mkstemp(suffix=".pdf")
    with os.fdopen(fd, "wb") as tmp:
        tmp.write(fh.read())

    return path


def extract_text_from_pdf(pdf_path, max_pages=5):
    """Extracts text from PDF using pypdf (text) or OCR (scanned).

    Args:
        pdf_path: Path to the PDF file.
        max_pages: Maximum number of pages to process. Defaults to 2 to save time.
    """
    text = ""
    try:
        # Try text extraction first
        reader = PdfReader(pdf_path)
        for i, page in enumerate(reader.pages):
            if i >= max_pages:
                text += "\n[...Truncated remaining pages...]"
                break
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

        # If text is too short/empty, assume scanned and use OCR
        if len(text.strip()) < 50:
            logger.info(
                f"Text extraction failed or sparse for {pdf_path}, using OCR (first {max_pages} pages)..."
            )
            # Only convert the first `max_pages`
            images = convert_from_path(pdf_path, first_page=1, last_page=max_pages)
            ocr_text = ""
            for img in images:
                ocr_text += pytesseract.image_to_string(img) + "\n"

            if len(images) == max_pages:
                ocr_text += "\n[...Truncated remaining pages...]"

            text = ocr_text

    except Exception as e:
        logger.error(f"Error processing PDF {pdf_path}: {e}")

    return text


def summarize_drive_folder(folder_id: str):
    """Main function to orchestrate the summarization."""
    service = get_drive_service()

    logger.info(f"Listing files in folder {folder_id}...")
    files = get_items_in_folder(folder_id)

    if not files:
        return "No files found in the client's folder."

    pdf_files = [f for f in files if f["name"].lower().endswith(".pdf")]

    if not pdf_files:
        return "No PDF files found in the client's folder."

    all_text = ""

    for file in pdf_files:
        logger.info(f"Processing {file['name']}...")
        try:
            temp_path = download_file_content(service, file["id"], file["name"])
            text = extract_text_from_pdf(temp_path)
            os.remove(temp_path)

            if text.strip():
                all_text += f"\n--- Document: {file['name']} ---\n{text}\n"
        except Exception as e:
            logger.error(f"Failed to process {file['name']}: {e}")
            all_text += f"\n--- Document: {file['name']} (Error reading file) ---"

    if not all_text.strip():
        return "Could not extract text from any documents."

    logger.info("Loading model for tokenization and summary...")
    llm = get_llm()

    # Token-based truncation
    # Context: 4096. Output: 500. System prompt: ~200. Safe input: ~3300.
    # Reduced to 2048 to speed up processing time.
    SAFE_TOKEN_LIMIT = 2048

    tokens = llm.tokenize(all_text.encode("utf-8"))
    if len(tokens) > SAFE_TOKEN_LIMIT:
        logger.info(
            f"Truncating input from {len(tokens)} tokens to {SAFE_TOKEN_LIMIT}..."
        )
        # Decode back to string after slicing tokens
        # Note: llama-cpp-python's detokenize returns bytes
        truncated_bytes = llm.detokenize(tokens[:SAFE_TOKEN_LIMIT])
        all_text = truncated_bytes.decode("utf-8", errors="ignore") + "... (truncated)"
    logger.info("Generating summary...")

    prompt = f"""<|user|>
You are a helpful medical assistant. Create a concise summary of the following referral documents.
Do NOT include patient name, DOB, or other demographics.
Output strict bullet points under these two headers only:

### Referral Reason
(List specific symptoms, concerns, or questions raised by the referring provider)

### Key History
(List ONLY relevant medical diagnoses, school IEP/504 status, or previous evaluations. Ignore general well-child history.)

Documents:
{all_text}
<|end|>
<|assistant|>"""

    output = llm(
        prompt,
        max_tokens=500,
        stop=["<|end|>", "<|user|>"],
        echo=False,
        temperature=0.1,  # Low temperature for factual summary
    )

    if isinstance(output, dict):
        logger.info("Finished.")
        return output["choices"][0]["text"].strip()
    else:
        logger.error("Output was not the correct type")
