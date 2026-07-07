"""
Document Categorizer

Categorizes PDF documents (Referral, Records Request, Insurance, Patient
Documents, Unsure) using a local LLM, optionally identifying the
client(s)/patient(s) the document is about.

Usage:
    python categorize_documents.py path/to/file.pdf [more.pdf ...]
    python categorize_documents.py --clients --votes 5 path/to/file.pdf

    # Check accuracy against a folder of pre-tagged PDFs, named like
    # "case123_Referral.pdf" (the segment after the last underscore is the
    # correct category):
    python categorize_documents.py --eval path/to/tagged_pdfs/
"""

import argparse
import json
import os
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from llama_cpp import Llama
from loguru import logger

from utils.document_categorizer import (
    CATEGORIES,
    SIMULATED_SPECS,
    analyze_with_votes,
    extract_text,
    limit_cpu_usage,
    limit_memory_usage,
    load_model,
)


def _categorize_one(llm: Llama, pdf_path: str, want_clients: bool, votes: int) -> None:
    logger.info(f"Extracting text from {pdf_path}...")
    document_text, sources = extract_text(pdf_path, llm)
    for i, source in enumerate(sources):
        logger.debug(f"Page {i + 1}: {source}")

    if not document_text.strip():
        logger.warning("No text could be extracted from the PDF (even with OCR).")
        return

    category, clients, counts = analyze_with_votes(
        llm, document_text, votes, want_clients
    )
    if votes > 1:
        breakdown = ", ".join(f"{c}: {n}/{votes}" for c, n in counts.most_common())
        logger.info(f"votes -> {breakdown}")
    logger.info(f"Category: {category}")

    if want_clients:
        if clients:
            logger.info(f"Client(s): {', '.join(clients)}")
        else:
            logger.info("No client(s) identified.")


def _expected_category(pdf_path: Path) -> str | None:
    stem = pdf_path.stem
    if "_" not in stem:
        return None
    category = stem.rsplit("_", 1)[-1]
    return category if category in CATEGORIES else None


def _run_eval(
    llm: Llama,
    folder: str,
    repeat: int,
    votes: int,
    want_clients: bool,
    threads: int,
    simulate: str | None,
    output: str,
) -> None:
    folder_path = Path(folder)
    pdf_paths = sorted(folder_path.glob("*.pdf"))

    if not pdf_paths:
        logger.warning(f"No PDFs found in {folder_path}")
        return

    skipped = []
    cases: list[tuple[Path, str]] = []
    for pdf_path in pdf_paths:
        expected = _expected_category(pdf_path)
        if expected is None:
            skipped.append(pdf_path)
        else:
            cases.append((pdf_path, expected))

    if skipped:
        logger.info(
            f"Skipping {len(skipped)} file(s) with no recognized category suffix:"
        )
        for pdf_path in skipped:
            logger.info(f"  {pdf_path.name}")

    if not cases:
        logger.warning("No taggable PDFs found.")
        return

    results = []
    mismatches = []
    inconsistent = []
    durations: list[tuple[str, float]] = []
    documents: list[dict] = []
    eval_start = time.monotonic()
    for i, (pdf_path, expected) in enumerate(cases, start=1):
        logger.info(f"[{i}/{len(cases)}] {pdf_path.name} (expected: {expected})")

        doc_start = time.monotonic()
        actuals = []
        clients: list[str] = []
        for run in range(repeat):
            document_text, _ = extract_text(str(pdf_path), llm)
            actual, clients, vote_counts = analyze_with_votes(
                llm, document_text, votes, want_clients
            )
            actuals.append(actual)
            correct = actual == expected
            if votes > 1:
                vote_summary = ", ".join(
                    f"{c}: {n}/{votes}" for c, n in vote_counts.most_common()
                )
                logger.info(f"  votes -> {vote_summary}")
            if repeat > 1:
                logger.info(
                    f"  run {run + 1}/{repeat} -> got: {actual} ({'OK' if correct else 'MISMATCH'})"
                )
            results.append(correct)
            if not correct:
                mismatches.append((pdf_path.name, expected, actual))

        document_consistent = len(set(actuals)) == 1
        if repeat == 1:
            correct = actuals[0] == expected
            logger.info(f"  -> got: {actuals[0]} ({'OK' if correct else 'MISMATCH'})")
        elif not document_consistent:
            counts = Counter(actuals)
            summary = ", ".join(f"{c}: {n}/{repeat}" for c, n in counts.most_common())
            logger.info(f"  INCONSISTENT ({summary})")
            inconsistent.append(pdf_path.name)
        else:
            logger.info(f"  consistent across {repeat} runs")

        if want_clients:
            logger.info(
                f"  client(s): {', '.join(clients) if clients else 'none identified'}"
            )

        doc_elapsed = time.monotonic() - doc_start
        durations.append((pdf_path.name, doc_elapsed))
        logger.info(f"  time: {doc_elapsed:.1f}s")

        documents.append(
            {
                "name": pdf_path.name,
                "expected": expected,
                "actuals": actuals,
                "consistent": document_consistent,
                "clients": clients if want_clients else None,
                "time_seconds": doc_elapsed,
            }
        )

    total_elapsed = time.monotonic() - eval_start
    total = len(results)
    correct_count = sum(results)

    logger.info(f"{correct_count}/{total} correct ({correct_count / total:.0%})")

    for name, elapsed in durations:
        logger.info(f"  {name}: {elapsed:.1f}s")
    average_elapsed = total_elapsed / len(durations)
    logger.info(f"Average time: {average_elapsed:.1f}s")
    logger.info(f"Total time: {total_elapsed:.1f}s")

    if repeat > 1:
        logger.info(
            f"{len(inconsistent)}/{len(cases)} PDF(s) gave inconsistent results across runs:"
        )
        for name in inconsistent:
            logger.info(f"  {name}")

    if mismatches:
        logger.info("Mismatches:")
        for name, expected, actual in mismatches:
            logger.info(f"  {name}: expected {expected}, got {actual}")

    mismatch_counts = Counter(expected for _, expected, _ in mismatches)
    for category in CATEGORIES:
        if mismatch_counts[category]:
            logger.info(f"  {category}: {mismatch_counts[category]}")

    if output:
        record = {
            "timestamp": datetime.now(UTC).isoformat(),
            "folder": str(folder_path),
            "repeat": repeat,
            "votes": votes,
            "threads": threads,
            "simulate": simulate,
            "accuracy": correct_count / total,
            "correct": correct_count,
            "total": total,
            "average_time_seconds": average_elapsed,
            "total_time_seconds": total_elapsed,
            "inconsistent": inconsistent,
            "mismatches": [
                {"name": name, "expected": expected, "actual": actual}
                for name, expected, actual in mismatches
            ],
            "documents": documents,
        }
        with Path(output).open("a") as f:
            f.write(json.dumps(record) + "\n")
        logger.info(f"Appended results to {output}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Categorize PDF document(s).")
    parser.add_argument(
        "pdf_paths",
        nargs="*",
        metavar="pdf_path",
        help="Path(s) to the PDF file(s) to categorize",
    )
    parser.add_argument(
        "--eval",
        metavar="FOLDER",
        help="Instead of categorizing pdf_paths, check accuracy against a "
        'folder of pre-tagged PDFs, named like "case123_Referral.pdf"',
    )
    parser.add_argument(
        "--repeat",
        type=int,
        default=1,
        help="(--eval only) Re-run extraction + categorization this many "
        "times per PDF to check consistency",
    )
    parser.add_argument(
        "--output",
        default="eval_results.jsonl",
        help="(--eval only) Append a JSON record of this run's results "
        "here (one JSON object per line), so runs can be compared later. "
        'Pass an empty string ("") to skip writing (default: eval_results.jsonl)',
    )
    parser.add_argument(
        "--clients",
        action="store_true",
        help="Also identify the client(s)/patient(s) the document is about",
    )
    parser.add_argument(
        "--votes",
        type=int,
        default=1,
        help="Sample the category this many times and majority-vote the "
        "result, instead of trusting a single greedy answer (default: 1)",
    )
    parser.add_argument(
        "--threads",
        type=int,
        default=None,
        help="Max CPU threads to use, leaving the rest free for the rest of "
        "the machine (default: cpu count - 2, or the simulated spec's core "
        "count if --simulate is set)",
    )
    parser.add_argument(
        "--simulate",
        choices=sorted(SIMULATED_SPECS),
        help="Artificially constrain CPU threads and memory to match a "
        "specific low-power machine, to test how this behaves there",
    )
    args = parser.parse_args()

    if not args.pdf_paths and not args.eval:
        parser.error("provide pdf_path(s) or --eval FOLDER")

    if args.simulate:
        spec = SIMULATED_SPECS[args.simulate]
        threads = args.threads if args.threads is not None else spec["threads"]
        logger.info(
            f"Simulating '{args.simulate}': {threads} threads, "
            f"{spec['max_memory_gib']:.2f} GiB memory cap"
        )
        limit_memory_usage(spec["max_memory_gib"])
    else:
        threads = (
            args.threads
            if args.threads is not None
            else max(1, (os.cpu_count() or 4) - 2)
        )

    limit_cpu_usage(threads)

    llm = load_model(threads)
    if llm is None:
        return

    if args.eval:
        _run_eval(
            llm,
            args.eval,
            args.repeat,
            args.votes,
            args.clients,
            threads,
            args.simulate,
            args.output,
        )
        return

    durations: list[tuple[str, float]] = []
    for pdf_path in args.pdf_paths:
        logger.info(f"=== {pdf_path} ===")
        start = time.monotonic()
        _categorize_one(llm, pdf_path, args.clients, args.votes)
        elapsed = time.monotonic() - start
        durations.append((pdf_path, elapsed))
        logger.info(f"Time: {elapsed:.1f}s")

    if len(durations) > 1:
        for pdf_path, elapsed in durations:
            logger.info(f"{pdf_path}: {elapsed:.1f}s")
        total = sum(elapsed for _, elapsed in durations)
        logger.info(f"Average: {total / len(durations):.1f}s")
        logger.info(f"Total: {total:.1f}s")


if __name__ == "__main__":
    main()
