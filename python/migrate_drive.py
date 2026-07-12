"""
Google Drive Migration Script
Scans your Shared Drive for files owned by an external user, copies them into
the correct location in your Shared Drive as Andrew, and replaces shortcuts
with the real files.

Outputs a CSV mapping original links to new links.

Usage:
    python drive_migrate.py --dry-run        # Preview without changing anything
    python drive_migrate.py                  # Run the actual migration
"""

import argparse
import csv
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from googleapiclient.errors import HttpError
from loguru import logger

from utils.google import get_drive_service

# ── Config ────────────────────────────────────────────────────────────────────

TARGET_DOMAIN = "driftwoodeval.com"

REQUESTS_PER_SECOND = 5
RETRY_ATTEMPTS = 3
RETRY_DELAY = 2


def is_external_owner(owner_emails: list[str]) -> bool:
    """True if any owner's email is outside the target domain."""
    return any(not email.endswith(f"@{TARGET_DOMAIN}") for email in owner_emails)


# ── Retry wrapper ─────────────────────────────────────────────────────────────


def retry[T](fn: Callable[[], T]) -> T:
    for attempt in range(RETRY_ATTEMPTS):
        try:
            return fn()
        except HttpError as e:
            if e.resp.status in (429, 500, 503) and attempt < RETRY_ATTEMPTS - 1:
                wait = RETRY_DELAY * (2**attempt)
                logger.warning(f"Rate limited, retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("retry: exhausted attempts without returning or raising")


# ── Shared Drive helpers ──────────────────────────────────────────────────────


def get_shared_drive(service):
    response = service.drives().list(pageSize=10, fields="drives(id, name)").execute()
    drives = response.get("drives", [])

    if not drives:
        raise RuntimeError("No Shared Drives found.")

    if len(drives) == 1:
        return drives[0]

    logger.info("Multiple Shared Drives found:")
    for i, d in enumerate(drives):
        logger.info(f"  [{i}] {d['name']} (ID: {d['id']})")
    choice = int(input("\nEnter the number of the drive to use: "))
    return drives[choice]


def build_folder_path_map(service, drive_id: str) -> tuple[dict, dict]:
    """
    Returns:
        path_map:   folder_id -> full path string
        id_map:     folder_id -> {name, parents}
    """
    logger.info("Building folder map for Shared Drive...")

    folders = {}
    page_token = None

    while True:
        kwargs = {
            "q": "mimeType='application/vnd.google-apps.folder' and trashed=false",
            "corpora": "drive",
            "driveId": drive_id,
            "includeItemsFromAllDrives": True,
            "supportsAllDrives": True,
            "fields": "nextPageToken, files(id, name, parents)",
            "pageSize": 1000,
        }
        if page_token:
            kwargs["pageToken"] = page_token

        response = service.files().list(**kwargs).execute()

        for f in response.get("files", []):
            folders[f["id"]] = {"name": f["name"], "parents": f.get("parents", [])}

        page_token = response.get("nextPageToken")
        if not page_token:
            break

    def resolve_path(folder_id, visited=None):
        if visited is None:
            visited = set()
        if folder_id in visited:
            return "[circular]"
        visited.add(folder_id)
        if folder_id not in folders:
            return ""
        folder = folders[folder_id]
        parents = folder["parents"]
        if not parents or parents[0] not in folders:
            return folder["name"]
        parent_path = resolve_path(parents[0], visited)
        return f"{parent_path}/{folder['name']}" if parent_path else folder["name"]

    path_map = {fid: resolve_path(fid) for fid in folders}
    logger.info(f"Mapped {len(path_map)} folders.")
    return path_map, folders


def get_or_create_folder(
    service, drive_id: str, name: str, parent_id: str | None, dry_run: bool
) -> str:
    """Find or create a folder in the Shared Drive. Returns folder ID."""
    if dry_run:
        return f"[DRY_RUN_FOLDER:{name}]"

    query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"

    kwargs = {
        "q": query,
        "corpora": "drive",
        "driveId": drive_id,
        "includeItemsFromAllDrives": True,
        "supportsAllDrives": True,
        "fields": "files(id, name)",
    }
    results = retry(lambda: service.files().list(**kwargs).execute()).get("files", [])

    if results:
        return results[0]["id"]

    metadata: dict[str, Any] = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "driveId": drive_id,
    }
    if parent_id:
        metadata["parents"] = [parent_id]

    folder = retry(
        lambda: (
            service.files()
            .create(
                body=metadata,
                fields="id",
                supportsAllDrives=True,
            )
            .execute()
        )
    )

    return folder["id"]


def resolve_folder_id_by_path(service, drive_id: str, path: str, dry_run: bool) -> str:
    """
    Given a slash-separated path like 'Clients/Private Practice/Intake Forms',
    walk the Shared Drive and get or create each folder along the way.
    Returns the ID of the deepest folder.
    """
    parts = [p for p in path.split("/") if p]
    if not parts:
        raise ValueError(f"Empty folder path: {path!r}")

    parent_id = get_or_create_folder(service, drive_id, parts[0], None, dry_run)
    time.sleep(1 / REQUESTS_PER_SECOND)

    for part in parts[1:]:
        parent_id = get_or_create_folder(service, drive_id, part, parent_id, dry_run)
        time.sleep(1 / REQUESTS_PER_SECOND)

    return parent_id


# ── Scan (adapted from scan_external_owner.py) ────────────────────────────────


def resolve_shortcut_target(
    service, shortcut_id: str, shortcut_name: str
) -> dict | None:
    try:
        shortcut = (
            service.files()
            .get(
                fileId=shortcut_id,
                fields="shortcutDetails(targetId, targetMimeType)",
                supportsAllDrives=True,
            )
            .execute()
        )

        target_id = shortcut.get("shortcutDetails", {}).get("targetId")
        if not target_id:
            return None

        return (
            service.files()
            .get(
                fileId=target_id,
                fields="id, name, mimeType, owners, webViewLink, createdTime, modifiedTime, size",
                supportsAllDrives=True,
            )
            .execute()
        )

    except HttpError as e:
        logger.warning(f"Could not follow shortcut '{shortcut_name}': {e.resp.status}")
        return None


def recurse_external_folder(
    service,
    folder_id: str,
    folder_path: str,
    results: list,
    stats: dict,
    visited_folders: set,
):
    """Recursively collect ALL files inside an external folder, regardless of owner."""
    if folder_id in visited_folders:
        return
    visited_folders.add(folder_id)

    page_token = None

    while True:
        kwargs = {
            "q": f"'{folder_id}' in parents and trashed=false",
            "fields": "nextPageToken, files(id, name, mimeType, owners, webViewLink, createdTime, modifiedTime, size)",
            "includeItemsFromAllDrives": True,
            "supportsAllDrives": True,
            "pageSize": 1000,
        }
        if page_token:
            kwargs["pageToken"] = page_token

        try:
            response = service.files().list(**kwargs).execute()
        except HttpError as e:
            logger.warning(f"Could not list folder '{folder_path}': {e.resp.status}")
            return

        for f in response.get("files", []):
            stats["scanned"] += 1
            if stats["scanned"] % 50 == 0:
                logger.debug(
                    f"  ... {stats['scanned']} items scanned, {len(results)} files to migrate so far"
                )

            child_path = f"{folder_path}/{f['name']}"

            if f["mimeType"] == "application/vnd.google-apps.folder":
                recurse_external_folder(
                    service, f["id"], child_path, results, stats, visited_folders
                )
            else:
                owner_emails = [o.get("emailAddress", "") for o in f.get("owners", [])]
                owner = owner_emails[0] if owner_emails else "unknown"

                results.append(
                    {
                        "name": f["name"],
                        "path": child_path,
                        "folder_path": folder_path,
                        "original_id": f["id"],
                        "shortcut_id": "",
                        "is_shortcut": False,
                        "original_link": f.get("webViewLink", ""),
                        "mime_type": f.get("mimeType", ""),
                        "owner": owner,
                    }
                )

        page_token = response.get("nextPageToken")
        if not page_token:
            break

        time.sleep(1 / REQUESTS_PER_SECOND)


def scan(service, drive_id: str, folder_path_map: dict) -> list:
    """Scan the Shared Drive. For shortcuts pointing to external folders, collect all contents regardless of owner."""
    logger.info("Scanning Shared Drive for external content...")

    results = []
    stats = {"scanned": 0}
    visited_folders = set()
    page_token = None
    total_scanned = 0
    shortcuts_found = 0

    while True:
        kwargs = {
            "q": "trashed=false and mimeType!='application/vnd.google-apps.folder'",
            "corpora": "drive",
            "driveId": drive_id,
            "includeItemsFromAllDrives": True,
            "supportsAllDrives": True,
            "fields": "nextPageToken, files(id, name, mimeType, parents, owners, webViewLink, createdTime, modifiedTime, size)",
            "pageSize": 1000,
        }
        if page_token:
            kwargs["pageToken"] = page_token

        try:
            response = service.files().list(**kwargs).execute()
        except HttpError as e:
            logger.error(f"API error: {e}")
            break

        files = response.get("files", [])
        total_scanned += len(files)
        logger.debug(f"  ... {total_scanned} Shared Drive items scanned")

        for f in files:
            is_shortcut = f.get("mimeType") == "application/vnd.google-apps.shortcut"

            if is_shortcut:
                shortcuts_found += 1
                target = resolve_shortcut_target(service, f["id"], f["name"])
                if target is None:
                    continue

                time.sleep(1 / REQUESTS_PER_SECOND)

                owner_emails = [
                    o.get("emailAddress", "") for o in target.get("owners", [])
                ]
                owner = owner_emails[0] if owner_emails else "unknown"

                parents = f.get("parents", [])
                parent_id = parents[0] if parents else None
                shortcut_folder = (
                    folder_path_map.get(parent_id, "") if parent_id else ""
                )
                shortcut_path = (
                    f"{shortcut_folder}/{f['name']}" if shortcut_folder else f["name"]
                )

                if target["mimeType"] == "application/vnd.google-apps.folder":
                    # Recurse into external folder; files land under the shortcut's location
                    recurse_external_folder(
                        service,
                        target["id"],
                        shortcut_path,
                        results,
                        stats,
                        visited_folders,
                    )
                    # Track the shortcut itself so we can delete it after migration
                    results.append(
                        {
                            "name": f["name"],
                            "path": shortcut_path,
                            "folder_path": shortcut_folder,
                            "original_id": target["id"],
                            "shortcut_id": f["id"],
                            "is_shortcut": True,
                            "is_folder_shortcut": True,
                            "original_link": target.get("webViewLink", ""),
                            "mime_type": "application/vnd.google-apps.folder",
                            "owner": owner,
                        }
                    )
                else:
                    if not is_external_owner(owner_emails):
                        continue
                    results.append(
                        {
                            "name": f["name"],
                            "path": shortcut_path,
                            "folder_path": shortcut_folder,
                            "original_id": target["id"],
                            "shortcut_id": f["id"],
                            "is_shortcut": True,
                            "is_folder_shortcut": False,
                            "original_link": target.get("webViewLink", ""),
                            "mime_type": target.get("mimeType", ""),
                            "owner": owner,
                        }
                    )
            else:
                owner_emails = [o.get("emailAddress", "") for o in f.get("owners", [])]
                if not is_external_owner(owner_emails):
                    continue

                parents = f.get("parents", [])
                parent_id = parents[0] if parents else None
                folder_path = folder_path_map.get(parent_id, "") if parent_id else ""
                full_path = f"{folder_path}/{f['name']}" if folder_path else f["name"]
                owner = owner_emails[0] if owner_emails else "unknown"

                results.append(
                    {
                        "name": f["name"],
                        "path": full_path,
                        "folder_path": folder_path,
                        "original_id": f["id"],
                        "shortcut_id": "",
                        "is_shortcut": False,
                        "is_folder_shortcut": False,
                        "original_link": f.get("webViewLink", ""),
                        "mime_type": f.get("mimeType", ""),
                        "owner": owner,
                    }
                )

        page_token = response.get("nextPageToken")
        if not page_token:
            break

        time.sleep(1 / REQUESTS_PER_SECOND)

    logger.info(
        f"Scan complete: {total_scanned} Shared Drive items, {shortcuts_found} shortcuts followed."
    )
    logger.info(f"External folder contents scanned: {stats['scanned']} items.")
    logger.info(
        f"Items to migrate: {sum(1 for r in results if not r.get('is_folder_shortcut'))}"
    )
    return results


# ── Migration ─────────────────────────────────────────────────────────────────


def migrate_file(service, drive_id: str, item: dict, dry_run: bool) -> dict:
    """
    Copy a single file into the correct location in the Shared Drive
    and delete the shortcut if applicable. The copy is owned by whoever is authenticated.
    Returns a result dict for the CSV.
    """
    folder_path = item["folder_path"]
    is_shortcut = item["is_shortcut"]
    is_folder_shortcut = item.get("is_folder_shortcut", False)

    # Folder shortcuts themselves don't get copied as files — just deleted after contents migrate
    if is_folder_shortcut:
        if not dry_run:
            try:
                retry(
                    lambda: (
                        service.files()
                        .delete(
                            fileId=item["shortcut_id"],
                            supportsAllDrives=True,
                        )
                        .execute()
                    )
                )
                logger.info(f"Deleted folder shortcut: {item['name']}")
            except HttpError as e:
                logger.warning(
                    f"Could not delete shortcut '{item['name']}': {e.resp.status}"
                )
        else:
            logger.info(f"[DRY RUN] Would delete folder shortcut: {item['path']}")

        return {
            "name": item["name"],
            "path": item["path"],
            "original_id": item["original_id"],
            "original_link": item["original_link"],
            "new_id": "",
            "new_link": "",
            "status": "dry_run_shortcut_deleted" if dry_run else "shortcut_deleted",
        }

    logger.info(f"{'[DRY RUN] ' if dry_run else ''}{item['path']}")

    if dry_run:
        return {
            "name": item["name"],
            "path": item["path"],
            "original_id": item["original_id"],
            "original_link": item["original_link"],
            "new_id": "",
            "new_link": "[DRY RUN]",
            "status": "dry_run",
        }

    # Resolve destination folder ID, creating folders along the path as needed
    dest_folder_id = None
    if folder_path:
        dest_folder_id = resolve_folder_id_by_path(
            service, drive_id, folder_path, dry_run=False
        )

    # Copy the file
    metadata = {
        "name": item["name"],
        "driveId": drive_id,
    }
    if dest_folder_id:
        metadata["parents"] = [dest_folder_id]

    try:
        new_file = retry(
            lambda: (
                service.files()
                .copy(
                    fileId=item["original_id"],
                    body=metadata,
                    fields="id, webViewLink",
                    supportsAllDrives=True,
                )
                .execute()
            )
        )
    except HttpError as e:
        logger.warning(f"Copy failed ({e.resp.status}): {item['name']}")
        return {
            "name": item["name"],
            "path": item["path"],
            "original_id": item["original_id"],
            "original_link": item["original_link"],
            "new_id": "",
            "new_link": "",
            "status": f"copy_failed_{e.resp.status}",
        }

    new_id = new_file["id"]
    new_link = new_file.get(
        "webViewLink", f"https://drive.google.com/file/d/{new_id}/view"
    )

    time.sleep(1 / REQUESTS_PER_SECOND)

    # Delete the shortcut if this file came from one
    if is_shortcut and item.get("shortcut_id"):
        try:
            retry(
                lambda: (
                    service.files()
                    .delete(
                        fileId=item["shortcut_id"],
                        supportsAllDrives=True,
                    )
                    .execute()
                )
            )
        except HttpError as e:
            logger.warning(
                f"Could not delete shortcut for '{item['name']}': {e.resp.status}"
            )

    return {
        "name": item["name"],
        "path": item["path"],
        "original_id": item["original_id"],
        "original_link": item["original_link"],
        "new_id": new_id,
        "new_link": new_link,
        "status": "copied",
    }


# ── Output ────────────────────────────────────────────────────────────────────


def write_csv(link_map: list, dry_run: bool):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    prefix = "dry_run_" if dry_run else ""
    filename = f"{prefix}migration_map_{timestamp}.csv"

    with Path(filename).open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "name",
                "path",
                "original_id",
                "original_link",
                "new_id",
                "new_link",
                "status",
            ],
        )
        writer.writeheader()
        writer.writerows(link_map)

    logger.info(f"Link map saved to: {filename}")
    return filename


# ── Entry ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Migrate externally owned Drive files to driftwoodeval.com"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview without copying or deleting anything",
    )
    args = parser.parse_args()

    dry_run = args.dry_run
    mode = "DRY RUN" if dry_run else "LIVE MIGRATION"

    logger.info(f"{'=' * 70}")
    logger.info(f"  Google Drive Migration  |  {mode}")
    logger.info(f"  Target domain  : {TARGET_DOMAIN} (migrating everything else)")
    logger.info(f"{'=' * 70}")

    service = get_drive_service()

    drive = get_shared_drive(service)
    logger.info(f"Drive: {drive['name']} (ID: {drive['id']})")

    folder_path_map, _ = build_folder_path_map(service, drive["id"])

    items = scan(service, drive["id"], folder_path_map)

    if not items:
        logger.info("Nothing to migrate.")
        return

    logger.info(f"{'=' * 70}")
    logger.info(f"  {'Previewing' if dry_run else 'Migrating'} {len(items)} items")
    logger.info(f"{'=' * 70}")

    link_map = []
    stats = {"copied": 0, "failed": 0, "shortcuts_deleted": 0}

    for item in items:
        result = migrate_file(service, drive["id"], item, dry_run)
        link_map.append(result)

        if result["status"] == "copied":
            stats["copied"] += 1
        elif result["status"] == "shortcut_deleted":
            stats["shortcuts_deleted"] += 1
        elif result["status"].startswith("copy_failed"):
            stats["failed"] += 1

        time.sleep(1 / REQUESTS_PER_SECOND)

    csv_file = write_csv(link_map, dry_run)

    logger.info(f"{'=' * 70}")
    logger.info(f"  {'DRY RUN COMPLETE' if dry_run else 'MIGRATION COMPLETE'}")
    logger.info(f"{'=' * 70}")
    logger.info(f"  Files copied           : {stats['copied']}")
    logger.info(f"  Shortcuts deleted      : {stats['shortcuts_deleted']}")
    logger.info(f"  Failures               : {stats['failed']}")
    logger.info(f"  Link map               : {csv_file}")
    if dry_run:
        logger.info("No files were changed. Run without --dry-run to execute.")
    logger.info(f"{'=' * 70}")


if __name__ == "__main__":
    main()
