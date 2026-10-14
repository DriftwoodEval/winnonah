"""Loguru formatters shared by the Python projects."""

from __future__ import annotations

import json
import traceback

import loguru


def json_log_format(record: loguru.Record) -> str:
    """Format a log record as one JSON line, for loguru's `format=` argument.

    The line carries the time, level, module, function, line, and message, plus
    the formatted traceback when the record has an exception.
    """
    payload = {
        "time": record["time"].isoformat(),
        "level": record["level"].name,
        "module": record["name"],
        "function": record["function"],
        "line": record["line"],
        "message": record["message"],
    }
    if record["exception"] is not None:
        payload["exception"] = "".join(traceback.format_exception(*record["exception"]))
    # Escape braces so loguru's format_map treats this as a literal string, not a
    # template; format_map unescapes {{ and }} back to valid JSON. Escape < so
    # loguru's colorizer doesn't parse literal angle brackets in the message (for
    # example "<unknown>" in Selenium stacktraces) as color tags.
    return (
        (json.dumps(payload) + "\n")
        .replace("{", "{{")
        .replace("}", "}}")
        .replace("<", r"\<")
    )
