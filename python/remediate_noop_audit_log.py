"""One-off cleanup for no-op audit log entries.

Several `record_audit_log` callers log a before/after diff computed by
comparing a freshly formatted value against whatever the DB driver handed
back for the existing row (e.g. a DATE column coming back as a
`datetime.date` compared against a newly formatted string). When the two
sides are really the same value but a different type, the diff reports a
field as "changed" even though nothing happened. This script scans every
`emr_audit_log` row for that pattern, across every action, not just
`python.client.update`, and:

- deletes a row entirely if every diff it logged turns out to be a no-op
  (the write really did nothing)
- strips just the no-op fields out of `detail` if the row also recorded a
  real change (so the row survives with an accurate diff)

It also renames the system actor `userEmail` labels still sitting on old
literal strings in the DB to the names the code uses now (OLD_TO_NEW_USER_EMAIL).

Dry run by default: prints a preview with counts only, no old/new values.
Pass --apply to write.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter

from loguru import logger

from utils.constants import TABLE_AUDIT_LOG
from utils.database import db_session

PAIR_KEYS = (("old", "new"), ("oldValue", "newValue"), ("from", "to"))

OLD_TO_NEW_USER_EMAIL = {
    "csv-sync (internal)": "TA import",
    "questionnaire-sweep (internal)": "Posteval questionnaire sweep",
    "report sync (internal)": "Report queue sync",
    "punchlist-sync": "Punchlist sync",
    "session remediation (internal)": "Session remediation",
    "questionnaires (internal API)": "Questionnaires app (API)",
    "questionnaires (direct DB write)": "Questionnaires app (DB write)",
}


def _values_equal(old, new) -> bool:
    if old == new:
        return True
    try:
        return float(old) == float(new)
    except (TypeError, ValueError):
        return False


def _find_diff_leaves(node, path: tuple = ()) -> list[tuple[tuple, object, object]]:
    """Recursively finds {old,new}/{oldValue,newValue}/{from,to}-shaped dicts
    anywhere in a detail payload. Stops descending into a dict once it
    matches a pair, since the pair's own old/new values aren't further diff
    units to recurse into."""
    leaves: list[tuple[tuple, object, object]] = []
    if isinstance(node, dict):
        for a, b in PAIR_KEYS:
            if a in node and b in node:
                leaves.append((path, node[a], node[b]))
                return leaves
        for key, value in node.items():
            leaves.extend(_find_diff_leaves(value, (*path, key)))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            leaves.extend(_find_diff_leaves(value, (*path, i)))
    return leaves


def _strip_leaf(detail: dict, path: tuple) -> None:
    node = detail
    for key in path[:-1]:
        node = node[key]
    del node[path[-1]]


def _plan_row(
    detail: dict,
) -> tuple[str, dict | None, list[tuple[tuple, object, object]]]:
    """Returns (outcome, new_detail, noop_leaves).

    outcome is "keep" (nothing to do), "delete" (every diff was a no-op), or
    "strip" (some diffs were no-ops, new_detail has them removed). noop_leaves
    is the (path, old, new) triples that were no-ops, for sampling/counting.
    """
    leaves = _find_diff_leaves(detail)
    if not leaves:
        return "keep", None, []

    noop = [(path, old, new) for path, old, new in leaves if _values_equal(old, new)]
    if not noop:
        return "keep", None, []
    if len(noop) == len(leaves):
        return "delete", None, noop

    stripped = json.loads(json.dumps(detail))
    for path, _, _ in noop:
        _strip_leaf(stripped, path)
    return "strip", stripped, noop


def _parse_detail(raw) -> dict | None:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    if isinstance(raw, str):
        raw = json.loads(raw)
    return raw if isinstance(raw, dict) else None


def preview_noop_cleanup(
    connection,
) -> tuple[
    list[tuple[int, str, dict | None]], list[tuple[int, str, tuple, object, object]]
]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT id, action, detail FROM `{TABLE_AUDIT_LOG}` WHERE detail IS NOT NULL"
        )
        rows = cursor.fetchall()

    plans: list[tuple[int, str, dict | None]] = []
    # (row id, action, field path, old value, new value) for every no-op leaf,
    # kept only for --sample: deliberately not logged by default since dob,
    # address, phoneNumber, email etc. are PII.
    noop_samples: list[tuple[int, str, tuple, object, object]] = []
    by_action: Counter[str] = Counter()
    by_field: Counter[str] = Counter()

    for row in rows:
        detail = _parse_detail(row["detail"])
        if detail is None:
            continue
        outcome, new_detail, noop_leaves = _plan_row(detail)
        if outcome == "keep":
            continue
        plans.append((row["id"], outcome, new_detail))
        by_action[f"{row['action']} ({outcome})"] += 1
        for path, old, new in noop_leaves:
            by_field[".".join(str(p) for p in path) or "<root>"] += 1
            noop_samples.append((row["id"], row["action"], path, old, new))

    logger.info(f"Found {len(plans)} audit log row(s) with no-op diff data:")
    for label, count in sorted(by_action.items()):
        logger.info(f"  {label}: {count}")
    logger.info("No-op fields:")
    for field, count in by_field.most_common():
        logger.info(f"  {field}: {count}")

    return plans, noop_samples


def print_sample(
    noop_samples: list[tuple[int, str, tuple, object, object]], n: int
) -> None:
    """Prints up to n example (row, field, old, new) no-ops per distinct
    (action, field) kind, verbatim, including whatever PII the field holds.
    Run this yourself and read it in your own terminal; this script never
    logs these values on its own."""
    by_kind: dict[tuple[str, str], list[tuple[int, object, object]]] = {}
    for row_id, action, path, old, new in noop_samples:
        field = ".".join(str(p) for p in path) or "<root>"
        by_kind.setdefault((action, field), []).append((row_id, old, new))

    logger.warning(f"Printing up to {n} raw sample(s) per kind. These may contain PII.")
    for (action, field), examples in sorted(by_kind.items()):
        for row_id, old, new in examples[:n]:
            logger.info(
                f"row={row_id} action={action} field={field} old={old!r} new={new!r}"
            )


BATCH_SIZE = 1000


def _chunked(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def apply_noop_cleanup(connection, plans: list[tuple[int, str, dict | None]]) -> None:
    """Batches deletes and updates so a multi-million-row cleanup over a
    remote (SSH-tunneled) connection doesn't pay one network round trip per
    row, and commits per batch so progress survives an interruption instead
    of sitting in one giant uncommitted transaction."""
    delete_ids = [row_id for row_id, outcome, _ in plans if outcome == "delete"]
    strips = [
        (row_id, new_detail)
        for row_id, outcome, new_detail in plans
        if outcome == "strip"
    ]

    deleted = 0
    with connection.cursor() as cursor:
        for batch in _chunked(delete_ids, BATCH_SIZE):
            placeholders = ", ".join(["%s"] * len(batch))
            cursor.execute(
                f"DELETE FROM `{TABLE_AUDIT_LOG}` WHERE id IN ({placeholders})", batch
            )
            connection.commit()
            deleted += len(batch)
            logger.info(f"Deleted {deleted}/{len(delete_ids)} fully no-op row(s)")

    stripped = 0
    with connection.cursor() as cursor:
        for batch in _chunked(strips, BATCH_SIZE):
            cursor.executemany(
                f"UPDATE `{TABLE_AUDIT_LOG}` SET detail = %s WHERE id = %s",
                [(json.dumps(new_detail), row_id) for row_id, new_detail in batch],
            )
            connection.commit()
            stripped += len(batch)
            logger.info(f"Stripped {stripped}/{len(strips)} partial row(s)")

    logger.info(
        f"Deleted {deleted} fully no-op row(s), stripped {stripped} partial row(s)."
    )


def preview_user_email_rename(connection) -> dict[str, int]:
    counts: dict[str, int] = {}
    with connection.cursor() as cursor:
        for old_email in OLD_TO_NEW_USER_EMAIL:
            cursor.execute(
                f"SELECT COUNT(*) AS n FROM `{TABLE_AUDIT_LOG}` WHERE userEmail = %s",
                (old_email,),
            )
            counts[old_email] = cursor.fetchone()["n"]

    logger.info("System actor userEmail rename:")
    for old_email, new_email in OLD_TO_NEW_USER_EMAIL.items():
        logger.info(f'  "{old_email}" -> "{new_email}": {counts[old_email]} row(s)')
    return counts


def apply_user_email_rename(connection) -> None:
    with connection.cursor() as cursor:
        for old_email, new_email in OLD_TO_NEW_USER_EMAIL.items():
            cursor.execute(
                f"UPDATE `{TABLE_AUDIT_LOG}` SET userEmail = %s WHERE userEmail = %s",
                (new_email, old_email),
            )
    connection.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes. Without this flag the script only reports.",
    )
    parser.add_argument(
        "--sample",
        type=int,
        default=0,
        metavar="N",
        help="Print N raw example no-op values (may contain PII; read in your own terminal).",
    )
    args = parser.parse_args()

    with db_session() as connection:
        plans, noop_samples = preview_noop_cleanup(connection)
        preview_user_email_rename(connection)

        if args.sample:
            print_sample(noop_samples, args.sample)

        if not args.apply:
            logger.info("Dry run only. Re-run with --apply to write changes.")
            return

        apply_noop_cleanup(connection, plans)
        apply_user_email_rename(connection)
        logger.info("Applied.")


if __name__ == "__main__":
    main()
