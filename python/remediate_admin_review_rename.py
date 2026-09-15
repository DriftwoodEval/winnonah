"""One-off remediation for the Insurance Review -> Admin Review rename.

The user-facing feature was renamed from "Insurance Review" to "Admin Review",
including internal identifiers: the `clients:insurance:review*` permission
IDs and the `insuranceReview` keys used in `users.pinnedList`,
`users.listFilters`, and `users.savedPlaces`. Those values are persisted as
JSON, so existing rows still carry the old strings and won't match the
renamed code until this runs.

Rewrites, per row in emr_role / emr_user / emr_invitation:
- `permissions` JSON keys: "clients:insurance:review" -> "clients:admin:review",
  "clients:insurance:review:email-notifications" ->
  "clients:admin:review:email-notifications"
- `listFilters` JSON key: "insuranceReview" -> "adminReview" (emr_user only)
- `savedPlaces` JSON key: "insuranceReview" -> "adminReview" (emr_user, emr_invitation)
- `pinnedList` JSON: {"kind": "insuranceReview"} -> {"kind": "adminReview"} (emr_user only)

Dry run by default. Pass --apply to write. Run only after the matching
Drizzle migration (table renames for emr_insurance_review*) has been applied.
"""

from __future__ import annotations

import argparse
import json

from loguru import logger

from utils.constants import TABLE_ROLE, TABLE_USER
from utils.database import db_session

TABLE_INVITATION = "emr_invitation"

OLD_PERM = "clients:insurance:review"
NEW_PERM = "clients:admin:review"
OLD_PERM_CHILD = "clients:insurance:review:email-notifications"
NEW_PERM_CHILD = "clients:admin:review:email-notifications"
OLD_KEY = "insuranceReview"
NEW_KEY = "adminReview"


def _rename_permission_keys(permissions: dict) -> tuple[dict, bool]:
    if OLD_PERM_CHILD not in permissions and OLD_PERM not in permissions:
        return permissions, False
    renamed = dict(permissions)
    if OLD_PERM_CHILD in renamed:
        renamed[NEW_PERM_CHILD] = renamed.pop(OLD_PERM_CHILD)
    if OLD_PERM in renamed:
        renamed[NEW_PERM] = renamed.pop(OLD_PERM)
    return renamed, True


def _remediate_permissions_table(
    connection, table: str, apply: bool, label: str
) -> int:
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT id, permissions FROM `{table}` WHERE permissions IS NOT NULL"
        )
        rows = cursor.fetchall()

    changed = 0
    for row in rows:
        permissions = json.loads(row["permissions"])
        renamed, did_change = _rename_permission_keys(permissions)
        if not did_change:
            continue
        changed += 1
        logger.info(f"{label} {row['id']}: renaming permission keys")
        if apply:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"UPDATE `{table}` SET permissions = %s WHERE id = %s",
                    (json.dumps(renamed), row["id"]),
                )
    return changed


def _remediate_saved_places_table(
    connection, table: str, apply: bool, label: str
) -> int:
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT id, savedPlaces FROM `{table}` WHERE savedPlaces IS NOT NULL"
        )
        rows = cursor.fetchall()

    changed = 0
    for row in rows:
        saved_places = json.loads(row["savedPlaces"])
        if OLD_KEY not in saved_places:
            continue
        changed += 1
        renamed = dict(saved_places)
        renamed[NEW_KEY] = renamed.pop(OLD_KEY)
        logger.info(f"{label} {row['id']}: renaming savedPlaces key")
        if apply:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"UPDATE `{table}` SET savedPlaces = %s WHERE id = %s",
                    (json.dumps(renamed), row["id"]),
                )
    return changed


def _remediate_users_list_filters_and_pinned_list(
    connection, apply: bool
) -> tuple[int, int]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT id, listFilters, pinnedList FROM `{TABLE_USER}` "
            "WHERE listFilters IS NOT NULL OR pinnedList IS NOT NULL"
        )
        rows = cursor.fetchall()

    filters_changed = 0
    pinned_changed = 0
    for row in rows:
        updates = {}

        if row["listFilters"] is not None:
            list_filters = json.loads(row["listFilters"])
            if OLD_KEY in list_filters:
                renamed = dict(list_filters)
                renamed[NEW_KEY] = renamed.pop(OLD_KEY)
                updates["listFilters"] = renamed
                filters_changed += 1
                logger.info(f"user {row['id']}: renaming listFilters key")

        if row["pinnedList"] is not None:
            pinned_list = json.loads(row["pinnedList"])
            if pinned_list.get("kind") == OLD_KEY:
                updates["pinnedList"] = {**pinned_list, "kind": NEW_KEY}
                pinned_changed += 1
                logger.info(f"user {row['id']}: renaming pinnedList kind")

        if updates and apply:
            set_clause = ", ".join(f"{col} = %s" for col in updates)
            with connection.cursor() as cursor:
                cursor.execute(
                    f"UPDATE `{TABLE_USER}` SET {set_clause} WHERE id = %s",
                    (*(json.dumps(v) for v in updates.values()), row["id"]),
                )

    return filters_changed, pinned_changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes. Without this flag the script only reports.",
    )
    args = parser.parse_args()

    with db_session() as connection:
        role_perms = _remediate_permissions_table(
            connection, TABLE_ROLE, args.apply, "role"
        )
        user_perms = _remediate_permissions_table(
            connection, TABLE_USER, args.apply, "user"
        )
        invitation_perms = _remediate_permissions_table(
            connection, TABLE_INVITATION, args.apply, "invitation"
        )
        user_saved_places = _remediate_saved_places_table(
            connection, TABLE_USER, args.apply, "user"
        )
        invitation_saved_places = _remediate_saved_places_table(
            connection, TABLE_INVITATION, args.apply, "invitation"
        )
        list_filters_changed, pinned_list_changed = (
            _remediate_users_list_filters_and_pinned_list(connection, args.apply)
        )

        if args.apply:
            connection.commit()

        logger.info(
            f"permissions: role={role_perms}, user={user_perms}, "
            f"invitation={invitation_perms}"
        )
        logger.info(
            f"savedPlaces: user={user_saved_places}, invitation={invitation_saved_places}"
        )
        logger.info(
            f"user.listFilters={list_filters_changed}, user.pinnedList={pinned_list_changed}"
        )

        if not args.apply:
            logger.info("Dry run only. Re-run with --apply to write changes.")


if __name__ == "__main__":
    main()
