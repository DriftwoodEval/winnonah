import base64
import mimetypes
import os
import re
import time
from collections import deque
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from pathlib import Path

import pandas as pd
from dateutil import parser as dtparser
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaInMemoryUpload
from loguru import logger

import utils.database
from utils.constants import TABLE_APPOINTMENT, TABLE_CLIENT, TABLE_EVALUATOR
from utils.timezone import business_to_utc, now_business

# If modifying these scopes, delete the file token.json.
SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.modify",
]

_GOOGLE_DOC_MIME = "application/vnd.google-apps.document"
_GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder"


def google_authenticate():
    """Authenticate with Google using the credentials in ./auth_cache/credentials.json (obtained from Google Cloud Console) and ./auth_cache/token.json (user-specific).

    If the credentials are not valid, the user is prompted to log in.
    The credentials are then saved to ./auth_cache/token.json for the next run.
    Returns the authenticated credentials.
    """
    creds = None
    # The file token.json stores the user's access and refresh tokens, and is
    # created automatically when the authorization flow completes for the first
    # time.
    if Path.exists(Path("auth_cache/token.json")):
        creds = Credentials.from_authorized_user_file("./auth_cache/token.json", SCOPES)
    # If there are no valid credentials, start the authorization flow
    else:
        creds = None

    # If the credentials are invalid or have expired, refresh the credentials
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        # If there are no credentials, start the manual login
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                "./auth_cache/credentials.json", SCOPES
            )
            creds = flow.run_local_server(port=0)

    # Save the credentials for the next run
    with Path.open(Path("auth_cache/token.json"), "w") as token:
        token.write(creds.to_json())

    return creds


def get_items_in_folder(folder_id: str):
    """Get all items in the given folder."""
    creds = google_authenticate()
    files = None
    for _ in range(3):  # Try up to 3 times
        try:
            service = build("drive", "v3", credentials=creds)
            files = []
            page_token = None
            while True:
                response = (
                    service.files()
                    .list(
                        q="'" + folder_id + "' in parents",
                        spaces="drive",
                        fields="nextPageToken, files(id, name, webViewLink)",
                        pageToken=page_token,
                    )
                    .execute()
                )
                files.extend(response.get("files", []))
                page_token = response.get("nextPageToken", None)
                if page_token is None:
                    break
            break
        except HttpError as err:
            logger.warning(f"An error occurred: {err}. Trying again...")
            time.sleep(1)
    if files is None:
        logger.error(
            f"Failed to retrieve items in folder {folder_id} after 3 attempts."
        )
    return files


def create_folder_in_folder(new_folder_name: str, parent_folder_id: str):
    """Create a new folder in the given parent folder."""
    creds = google_authenticate()
    try:
        service = build("drive", "v3", credentials=creds)
        file_metadata = {
            "name": new_folder_name,
            "mimeType": _GOOGLE_FOLDER_MIME,
            "parents": [parent_folder_id],
        }
        service.files().create(body=file_metadata, fields="id").execute()
    except HttpError as err:
        logger.error(f"An error occurred: {err}")


def get_drive_service():
    """Get the Google Drive service."""
    creds = google_authenticate()
    return build("drive", "v3", credentials=creds)


def get_sheets_service():
    """Get the Google Sheets service."""
    creds = google_authenticate()
    return build("sheets", "v4", credentials=creds)


def get_gmail_service():
    """Get the Gmail service."""
    creds = google_authenticate()
    return build("gmail", "v1", credentials=creds)


def get_punchlist_language_map() -> dict[str, str]:
    """Fetch a mapping of Client ID to Language from the Punchlist sheet."""
    service = get_sheets_service()
    result = (
        service.spreadsheets()
        .values()
        .get(
            spreadsheetId=os.getenv("PUNCHLIST_ID"),
            range=os.getenv("PUNCHLIST_RANGE"),
        )
        .execute()
    )

    rows = result.get("values", [])
    if not rows:
        return {}

    header = rows[0]
    try:
        id_index = header.index("Client ID")
        language_index = header.index("Language")
    except ValueError:
        logger.warning("Client ID or Language column not found in Punchlist sheet")
        return {}

    language_map: dict[str, str] = {}
    for row in rows[1:]:
        if len(row) <= id_index:
            continue
        client_id = row[id_index]
        language = row[language_index].strip() if len(row) > language_index else ""
        language_map[client_id] = language or "English"

    return language_map


def list_files_in_folder(
    folder_id: str, created_after: datetime | None = None
) -> list[dict]:
    """Return all non-trashed, non-folder items in a Drive folder.

    If created_after is given, only files created after that time are
    returned (compared server-side, in the Drive query)."""
    results = []
    page_token = None
    q = f"'{folder_id}' in parents and mimeType != '{_GOOGLE_FOLDER_MIME}' and trashed = false"
    if created_after is not None:
        q += f" and createdTime > '{created_after.strftime('%Y-%m-%dT%H:%M:%S')}'"
    service = get_drive_service()
    while True:
        resp = (
            service.files()
            .list(
                q=q,
                fields="nextPageToken, files(id, name, mimeType)",
                pageToken=page_token,
            )
            .execute()
        )
        results.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return results


def list_subfolders(folder_id: str) -> list[dict]:
    """Return all non-trashed subfolders in a Drive folder."""
    results = []
    page_token = None
    q = f"'{folder_id}' in parents and mimeType = '{_GOOGLE_FOLDER_MIME}' and trashed = false"
    service = get_drive_service()
    while True:
        resp = (
            service.files()
            .list(
                q=q,
                fields="nextPageToken, files(id, name)",
                pageToken=page_token,
            )
            .execute()
        )
        results.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return results


def check_for_subfolders(folder_id: str) -> str:
    """Return 'subfolders', 'only files', or 'empty'. Uses pageSize=1 to minimise API data."""
    service = get_drive_service()
    sf = (
        service.files()
        .list(
            q=f"'{folder_id}' in parents and mimeType = '{_GOOGLE_FOLDER_MIME}' and trashed = false",
            pageSize=1,
            fields="files(id)",
        )
        .execute()
    )
    if sf.get("files"):
        return "subfolders"

    f = (
        service.files()
        .list(
            q=f"'{folder_id}' in parents and mimeType != '{_GOOGLE_FOLDER_MIME}' and trashed = false",
            pageSize=1,
            fields="files(id)",
        )
        .execute()
    )
    return "only files" if f.get("files") else "empty"


def get_files_by_name(folder_id: str, name: str) -> list[dict]:
    resp = (
        get_drive_service()
        .files()
        .list(
            q=f"'{folder_id}' in parents and name = '{name}' and trashed = false",
            fields="files(id, name, mimeType)",
        )
        .execute()
    )
    return resp.get("files", [])


def copy_file(file_id: str, new_name: str, dest_folder_id: str) -> dict:
    return (
        get_drive_service()
        .files()
        .copy(
            fileId=file_id,
            body={"name": new_name, "parents": [dest_folder_id]},
            fields="id, name",
        )
        .execute()
    )


def move_file(file_id: str, dest_folder_id: str) -> None:
    service = get_drive_service()
    meta = service.files().get(fileId=file_id, fields="parents").execute()
    prev_parents = ",".join(meta.get("parents", []))
    service.files().update(
        fileId=file_id,
        addParents=dest_folder_id,
        removeParents=prev_parents,
        fields="id, parents",
    ).execute()


def batch_move_files(
    file_ids: list[str], dest_folder_id: str, src_folder_id: str
) -> None:
    """Move multiple files to dest_folder_id in a single HTTP batch request."""
    service = get_drive_service()
    batch = service.new_batch_http_request()
    for file_id in file_ids:
        batch.add(
            service.files().update(
                fileId=file_id,
                addParents=dest_folder_id,
                removeParents=src_folder_id,
                fields="id",
            )
        )
    batch.execute()


def get_file_by_id(file_id: str) -> dict:
    """Look up a Drive file's id/name/mimeType by id, for re-fetching a file
    already recorded elsewhere (e.g. by drive_file_id in our own database)."""
    service = get_drive_service()
    return service.files().get(fileId=file_id, fields="id, name, mimeType").execute()


def get_file_as_bytes(file: dict) -> bytes:
    """Export Google Docs as PDF; download all other file types as-is."""
    service = get_drive_service()
    if file["mimeType"] == _GOOGLE_DOC_MIME:
        return (
            service.files()
            .export(fileId=file["id"], mimeType="application/pdf")
            .execute()
        )
    return service.files().get_media(fileId=file["id"]).execute()


def update_file_content(file_id: str, content: bytes, mime_type: str) -> None:
    """Replace a Drive file's content in place, keeping its file id/link."""
    service = get_drive_service()
    media = MediaInMemoryUpload(content, mimetype=mime_type)
    service.files().update(fileId=file_id, media_body=media).execute()


def move_drive_folder(folder_id: str, dest_folder_id: str) -> tuple[bool, str]:
    """Move a Drive folder (e.g. a client folder) to a new parent folder.

    Checks the folder's current parents on Drive (not any cached state) before
    moving, since folders can be moved by staff or other jobs outside our control.
    Returns (moved, current_name), where moved is False if it was already in
    dest_folder_id.
    """
    service = get_drive_service()
    meta = service.files().get(fileId=folder_id, fields="parents, name").execute()
    current_parents = meta.get("parents", [])
    current_name = meta["name"]
    if dest_folder_id in current_parents:
        return False, current_name
    service.files().update(
        fileId=folder_id,
        addParents=dest_folder_id,
        removeParents=",".join(current_parents),
        fields="id, parents",
    ).execute()
    return True, current_name


def rename_drive_folder(folder_id: str, new_name: str) -> None:
    """Rename a Drive folder (e.g. a client folder)."""
    service = get_drive_service()
    service.files().update(fileId=folder_id, body={"name": new_name}).execute()


def normalize_name_tokens(name: str):
    """Converts 'John Smith-Doe' to a set: {'john', 'smith', 'doe'}. Removes punctuation, double spaces, and lowercases."""
    if not name:
        return set()
    clean_name = re.sub(r"[^\w\s]", " ", name).lower()
    return set(clean_name.split())


def levenshtein(a: str, b: str) -> int:
    """Edit distance between two strings."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    previous_row = list(range(len(b) + 1))
    for i, char_a in enumerate(a, start=1):
        current_row = [i]
        for j, char_b in enumerate(b, start=1):
            insert_cost = current_row[j - 1] + 1
            delete_cost = previous_row[j] + 1
            replace_cost = previous_row[j - 1] + (char_a != char_b)
            current_row.append(min(insert_cost, delete_cost, replace_cost))
        previous_row = current_row
    return previous_row[-1]


def client_match_confidence(client_tokens: set[str], name_tokens: set[str]):
    """Returns a 0-1 confidence score if every token in client_tokens matches
    a token in name_tokens exactly or within a small typo tolerance
    (Levenshtein distance), else None. Short tokens get less tolerance so
    e.g. 'Al' won't loosely match 'Ed'."""
    if not client_tokens or not name_tokens:
        return None
    total_distance = 0
    for client_token in client_tokens:
        if client_token in name_tokens:
            continue
        best_distance = min(
            levenshtein(client_token, name_token) for name_token in name_tokens
        )
        max_allowed = 1 if len(client_token) <= 4 else 2
        if best_distance > max_allowed:
            return None
        total_distance += best_distance
    if total_distance == 0:
        return 1.0
    return max(0.6, 1.0 - 0.15 * total_distance)


def build_client_lookup(df_clients: pd.DataFrame):
    """Pre-processes clients into a list of dicts for faster matching. Structure: [{'id': 1, 'tokens': {'john', 'smith'}}, ...]."""
    client_lookup = []
    for _, row in df_clients.iterrows():
        tokens = normalize_name_tokens(f"{row['FIRSTNAME']} {row['LASTNAME']}")
        client_data = {
            "id": row["CLIENT_ID"],
            "tokens": tokens,
            "original_first": row["FIRSTNAME"],
            "original_last": row["LASTNAME"],
        }
        client_lookup.append(client_data)

        if row["PREFERRED_NAME"]:
            pref_tokens = normalize_name_tokens(
                f"{row['PREFERRED_NAME']} {row['LASTNAME']}"
            )
            if pref_tokens != tokens:
                client_lookup.append(
                    {
                        "id": row["CLIENT_ID"],
                        "tokens": pref_tokens,
                        "original_first": row["PREFERRED_NAME"],
                        "original_last": row["LASTNAME"],
                    }
                )
    return client_lookup


def _process_folders_queued(service, start_folder_id, client_lookup, db_connection):
    """Iterative Breadth-First Search using a Queue."""
    folder_queue = deque([start_folder_id])

    while folder_queue:
        current_folder_id = folder_queue.popleft()

        query = (
            f"'{current_folder_id}' in parents and "
            f"mimeType = 'application/vnd.google-apps.folder' and "
            f"trashed = false"
        )

        page_token = None
        while True:
            try:
                response = (
                    service.files()
                    .list(
                        q=query,
                        spaces="drive",
                        fields="nextPageToken, files(id, name)",
                        pageToken=page_token,
                        pageSize=1000,
                    )
                    .execute()
                )
            except HttpError as err:
                logger.error(f"API Error on folder {current_folder_id}: {err}")
                time.sleep(2)
                continue

            files = response.get("files", [])

            for file in files:
                folder_name = file["name"]
                drive_id = file["id"]

                # Add subfolder to queue to process later (BFS)
                # Check for brackets to avoid re-renaming, but
                # add it to the queue regardless to find sub-sub-folders.
                folder_queue.append(drive_id)

                if "[" in folder_name and "]" in folder_name:
                    continue

                folder_tokens = normalize_name_tokens(folder_name)
                matches = [
                    client
                    for client in client_lookup
                    if client["tokens"].issubset(folder_tokens)
                ]

                # Deduplicate by ID
                unique_matches = {m["id"]: m for m in matches}.values()

                if len(unique_matches) == 1:
                    match = next(iter(unique_matches))
                    new_name = f"{folder_name} [{match['id']}]"

                    logger.debug(
                        f"MATCH: {folder_name} ({drive_id}) -> {match['original_first']} {match['original_last']}"
                    )

                    try:
                        # Update DB
                        with db_connection.cursor() as cursor:
                            sql = (
                                f"UPDATE {TABLE_CLIENT} SET driveId = %s WHERE id = %s"
                            )
                            cursor.execute(sql, (drive_id, match["id"]))
                        db_connection.commit()

                        # Rename Drive Folder
                        service.files().update(
                            fileId=drive_id, body={"name": new_name}
                        ).execute()
                    except Exception as e:
                        logger.error(f"Error updating {folder_name}: {e}")

                elif len(unique_matches) > 1:
                    ids = [m["id"] for m in unique_matches]
                    logger.warning(f"AMBIGUOUS: '{folder_name}' matches IDs: {ids}")

            page_token = response.get("nextPageToken", None)
            if page_token is None:
                break


def add_client_ids_to_drive():
    """Add client IDs to Drive folder names, and add Drive IDs to DB."""
    logger.debug("Starting Drive Sync...")

    service = get_drive_service()
    db_connection = utils.database.get_db()
    base_folder_id = os.getenv("BASE_FOLDER_ID")

    if base_folder_id is None:
        logger.error("BASE_FOLDER_ID is not set")
        return

    logger.debug("Building client lookup index...")
    df_clients = utils.database.get_all_clients()

    df_clients = df_clients[pd.isna(df_clients["DRIVE_ID"])]

    client_lookup = build_client_lookup(df_clients)

    logger.debug("Scanning folders...")
    _process_folders_queued(service, base_folder_id, client_lookup, db_connection)

    logger.debug("Finished.")


def _compute_age(dob: datetime) -> int:
    """Compute age in years as of today from a date of birth."""
    today = datetime.now().date()
    dob_date = dob.date() if isinstance(dob, datetime) else dob
    return (
        today.year
        - dob_date.year
        - ((today.month, today.day) < (dob_date.month, dob_date.day))
    )


def _find_client_info_file(service, folder_id: str) -> dict | None:
    """Find an existing '0 - ... .txt' info file in the given folder, if any."""
    page_token = None
    while True:
        response = (
            service.files()
            .list(
                q=f"'{folder_id}' in parents and name contains '0 - ' and trashed = false",
                spaces="drive",
                fields="nextPageToken, files(id, name)",
                pageToken=page_token,
            )
            .execute()
        )
        for file in response.get("files", []):
            if file["name"].lower().endswith(".txt"):
                return file
        page_token = response.get("nextPageToken")
        if not page_token:
            return None


def _patch_info_lines(content: str, updates: dict[str, str]) -> str:
    """Overwrite lines matching known '<Prefix> ...' patterns, appending any that are missing.

    Preserves any other lines in the file (e.g. manually added staff notes) untouched.
    """
    lines = content.splitlines()
    remaining = dict(updates)

    for i, line in enumerate(lines):
        for prefix, value in list(remaining.items()):
            if line.startswith(f"{prefix} "):
                lines[i] = f"{prefix} {value}"
                del remaining[prefix]
                break

    for prefix, value in remaining.items():
        lines.append(f"{prefix} {value}")

    return "\n".join(lines)


def sync_client_info_files():
    """For each client with an appointment tomorrow, create or update their '0 - {name} info.txt'
    file in their Drive folder with Name, DOB, Age, Date, and Evaluator.

    If the file already exists, only the known field lines are overwritten in place; any
    other content in the file (e.g. manually added notes) is left untouched.
    """
    logger.debug("Syncing client info files...")

    service = get_drive_service()

    # "Tomorrow" means the business's calendar day, not UTC's, since
    # a.startTime is a true UTC instant that can land on a different UTC
    # calendar date than the business day it represents.
    tomorrow_business = (now_business() + timedelta(days=1)).date()
    range_start = business_to_utc(
        datetime.combine(tomorrow_business, datetime.min.time())
    ).replace(tzinfo=None)
    range_end = business_to_utc(
        datetime.combine(tomorrow_business + timedelta(days=1), datetime.min.time())
    ).replace(tzinfo=None)

    with utils.database.db_session() as connection, connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT c.driveId, c.fullName, c.dob, a.startTime, e.providerName
            FROM {TABLE_APPOINTMENT} a
            JOIN {TABLE_CLIENT} c ON a.clientId = c.id
            JOIN {TABLE_EVALUATOR} e ON a.evaluatorNpi = e.npi
            WHERE a.startTime >= %s AND a.startTime < %s
                AND a.cancelled = 0
                AND a.rescheduled = 0
                AND a.placeholder = 0
                AND c.driveId IS NOT NULL
            ORDER BY a.startTime
            """,
            (range_start, range_end),
        )
        rows = cursor.fetchall()

    # Multiple appointments tomorrow for the same client: use the earliest.
    seen_drive_ids = set()
    appointments = []
    for row in rows:
        if row["driveId"] in seen_drive_ids:
            continue
        seen_drive_ids.add(row["driveId"])
        appointments.append(row)

    logger.info(f"Found {len(appointments)} client(s) with an appointment tomorrow.")

    for row in appointments:
        try:
            _sync_client_info_file(service, row)
        except HttpError as err:
            logger.error(f"Failed to sync info file for {row['fullName']}: {err}")

    logger.debug("Finished syncing client info files.")


def _sync_client_info_file(service, row: dict):
    folder_id = row["driveId"]
    name = row["fullName"]

    field_values = {
        "DOB": row["dob"].strftime("%m/%d/%Y"),
        "Age": str(_compute_age(row["dob"])),
        "Date": row["startTime"].strftime("%m/%d/%Y"),
        "Evaluator": row["providerName"],
    }

    if "Beth" in row["providerName"]:
        field_values["*"] = "Include Beth's notes on the ADOS and ADI"

    existing_file = _find_client_info_file(service, folder_id)

    if existing_file is None:
        content = (
            name
            + "\n"
            + "\n".join(f"{prefix} {value}" for prefix, value in field_values.items())
        )
        media = MediaInMemoryUpload(content.encode(), mimetype="text/plain")
        service.files().create(
            body={"name": f"0 - {name} info.txt", "parents": [folder_id]},
            media_body=media,
        ).execute()
        logger.info(f"Created info file for {name}")
        return

    current_content = service.files().get_media(fileId=existing_file["id"]).execute()
    if isinstance(current_content, bytes):
        current_content = current_content.decode("utf-8", errors="replace")

    # First line is always the client's name.
    lines = current_content.splitlines()
    if lines:
        lines[0] = name
    else:
        lines = [name]
    updated_content = _patch_info_lines("\n".join(lines), field_values)

    media = MediaInMemoryUpload(updated_content.encode(), mimetype="text/plain")
    service.files().update(fileId=existing_file["id"], media_body=media).execute()
    logger.info(f"Updated info file for {name}")


def send_gmail(
    message_text: str,
    subject: str,
    to_addr: str,
    from_addr: str,
    cc_addr: str | None = None,
    html: str | None = None,
    attachments: Sequence[str | tuple[bytes, str]] | None = None,
):
    """Send an email using the Gmail API."""
    creds = google_authenticate()

    try:
        service = build("gmail", "v1", credentials=creds)

        message = EmailMessage()
        message.set_content(message_text)
        message["Subject"] = subject
        message["To"] = to_addr
        message["From"] = from_addr
        if cc_addr:
            message["Cc"] = cc_addr

        if html:
            message.add_alternative(html, subtype="html")

        if attachments:
            for item in attachments:
                if isinstance(item, tuple):
                    file_data, filename = item

                else:
                    item_path = Path(item)
                    if not Path.exists(item_path):
                        raise Exception(f"Attachment not found: {item}")
                    filename = item_path.name
                    with Path.open(item_path, "rb") as f:
                        file_data = f.read()

                ctype, encoding = mimetypes.guess_type(filename)

                if ctype is None or encoding is not None:
                    ctype = "application/octet-stream"

                maintype, subtype = ctype.split("/", 1)

                message.add_attachment(
                    file_data,
                    maintype=maintype,
                    subtype=subtype,
                    filename=filename,
                )

        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()

        create_message = {"raw": encoded_message}

        send_message = (
            service.users().messages().send(userId="me", body=create_message).execute()
        )

        logger.info(f"Sent email to {to_addr}: {subject}")

    except HttpError as error:
        logger.exception(error)
        send_message = None
    return send_message


def list_gmail_messages(
    query: str | None = None,
    label_ids: Sequence[str] | None = None,
    max_results: int = 50,
) -> list[dict]:
    """List Gmail message ids matching a search query (Gmail search syntax, e.g. "from:x@y.com is:unread").

    Paginates until max_results is reached. Returns the raw {"id", "threadId"} stubs;
    use get_gmail_message() to fetch the full content of a message.
    """
    service = get_gmail_service()
    messages: list[dict] = []
    page_token = None
    try:
        while len(messages) < max_results:
            response = (
                service.users()
                .messages()
                .list(
                    userId="me",
                    q=query,
                    labelIds=label_ids,
                    pageToken=page_token,
                    maxResults=min(max_results - len(messages), 500),
                )
                .execute()
            )
            messages.extend(response.get("messages", []))
            page_token = response.get("nextPageToken")
            if page_token is None:
                break
    except HttpError as error:
        logger.exception(error)
    return messages[:max_results]


def _get_message_body(payload: dict) -> tuple[str | None, str | None]:
    """Walk a Gmail message payload's MIME parts, returning (text_plain, text_html)."""
    text_plain = None
    text_html = None

    def decode(data: str) -> str:
        return base64.urlsafe_b64decode(data.encode()).decode("utf-8", errors="replace")

    def walk(part: dict):
        nonlocal text_plain, text_html
        mime_type = part.get("mimeType", "")
        body_data = part.get("body", {}).get("data")
        if mime_type == "text/plain" and body_data and text_plain is None:
            text_plain = decode(body_data)
        elif mime_type == "text/html" and body_data and text_html is None:
            text_html = decode(body_data)
        for subpart in part.get("parts", []):
            walk(subpart)

    walk(payload)
    return text_plain, text_html


def get_gmail_message(message_id: str) -> dict:
    """Fetch and parse a single Gmail message by id.

    Returns a dict with subject, from, to, date, snippet, body_text, and body_html.
    """
    service = get_gmail_service()
    message = (
        service.users()
        .messages()
        .get(userId="me", id=message_id, format="full")
        .execute()
    )

    payload = message.get("payload", {})
    headers = {h["name"].lower(): h["value"] for h in payload.get("headers", [])}
    body_text, body_html = _get_message_body(payload)

    return {
        "id": message["id"],
        "thread_id": message.get("threadId"),
        "subject": headers.get("subject"),
        "from": headers.get("from"),
        "to": headers.get("to"),
        "date": headers.get("date"),
        "snippet": message.get("snippet"),
        "body_text": body_text,
        "body_html": body_html,
    }


def _patch_gcal_event(event_id: str, calendar_id: str | None, patch_fn) -> bool:
    """Find a calendar event by ID and apply a patch built by patch_fn(event) -> body dict.

    Scans all calendars unless calendar_id is provided. Returns True if patched.
    """
    creds = google_authenticate()
    service = build("calendar", "v3", credentials=creds)

    if calendar_id:
        calendars = [{"id": calendar_id}]
    else:
        calendars = service.calendarList().list().execute().get("items", [])

    for calendar in calendars:
        cal_id = calendar["id"]
        try:
            event = service.events().get(calendarId=cal_id, eventId=event_id).execute()
        except HttpError as e:
            if e.resp.status not in (403, 404):
                logger.error(
                    f"Error fetching event {event_id} from calendar {cal_id}: {e}"
                )
            continue

        try:
            service.events().patch(
                calendarId=cal_id,
                eventId=event_id,
                body=patch_fn(event),
            ).execute()
        except HttpError as e:
            logger.warning(
                f"Could not patch event {event_id} on calendar {cal_id}: {e}"
            )
            return False

        return True

    return False


def update_gcal_event_title(
    event_id: str, new_title: str, calendar_id: str | None = None
) -> bool:
    """Find a Google Calendar event by ID and update its title. Returns True if updated."""
    patched = _patch_gcal_event(event_id, calendar_id, lambda _: {"summary": new_title})
    if patched:
        logger.info(f"Updated calendar event {event_id} title to: {new_title}")
    else:
        logger.warning(f"Calendar event {event_id} not found in any calendar")
    return patched


def append_gcal_event_description(
    event_id: str, text: str, calendar_id: str | None = None
) -> bool:
    """Append text to a Google Calendar event's description. Returns True if updated."""

    def patch_fn(event):
        current = event.get("description") or ""
        return {"description": current + "\n\n" + text}

    patched = _patch_gcal_event(event_id, calendar_id, patch_fn)
    if patched:
        logger.info(f"Appended to calendar event {event_id} description.")
    else:
        logger.warning(f"Calendar event {event_id} not found in any calendar")
    return patched


def find_gcal_event_by_client_and_time(
    client_id: int, start_time: datetime
) -> dict | None:
    """Search all calendars for an event matching client_id + start_time (±5 min).

    Returns {"event_id", "calendar_id", "title"} or None if not found.
    Used as a fallback when the stored event ID is stale (e.g. event moved calendars).
    start_time is a true UTC instant (emr_appointment.startTime), compared
    directly against Google's tz-aware event times, no fuzzy-zone matching
    needed.
    """
    start_time_utc = (
        start_time.replace(tzinfo=UTC)
        if start_time.tzinfo is None
        else start_time.astimezone(UTC)
    )

    logger.info(
        f"Searching all calendars for client {client_id} near "
        f"{start_time_utc.isoformat()} (±5 min match)"
    )

    creds = google_authenticate()
    service = build("calendar", "v3", credentials=creds)

    window_start = (start_time_utc - timedelta(hours=1)).isoformat()
    window_end = (start_time_utc + timedelta(hours=1)).isoformat()

    for calendar in service.calendarList().list().execute().get("items", []):
        calendar_id = calendar["id"]
        all_events: list = []
        page_token = None

        try:
            while True:
                page = (
                    service.events()
                    .list(
                        calendarId=calendar_id,
                        timeMin=window_start,
                        timeMax=window_end,
                        singleEvents=True,
                        orderBy="startTime",
                        pageToken=page_token,
                    )
                    .execute()
                )
                all_events.extend(page.get("items", []))
                page_token = page.get("nextPageToken")
                if not page_token:
                    break
        except HttpError:
            continue

        logger.debug(f"  {calendar_id}: {len(all_events)} event(s) in window")

        for event in all_events:
            description = event.get("description", "")
            if str(client_id) not in description:
                continue

            event_start_raw = event["start"].get("dateTime", event["start"].get("date"))
            if not event_start_raw:
                continue

            event_dt = dtparser.parse(event_start_raw)
            if event_dt.tzinfo is None:
                # All-day event date, no time-of-day to compare against an
                # appointment instant.
                continue
            event_dt_utc = event_dt.astimezone(UTC)

            time_diff = abs((event_dt_utc - start_time_utc).total_seconds())
            logger.debug(
                f"    Client {client_id} in description of '{event.get('summary', '')}' "
                f"on {calendar_id} — event {event_dt_utc.isoformat()}, "
                f"diff {int(time_diff)}s"
            )

            if time_diff > 300:
                logger.warning(
                    f"    Skipping: time diff {int(time_diff)}s exceeds 5 min tolerance"
                )
                continue

            found = {
                "event_id": event["id"],
                "calendar_id": calendar_id,
                "title": event.get("summary", ""),
            }
            logger.info(
                f"Found event for client {client_id}: {found['event_id']!r} "
                f"on {calendar_id} ({found['title']!r})"
            )
            return found

    logger.warning(
        f"No calendar event found for client {client_id} near "
        f"{start_time_utc.isoformat()}"
    )
    return None
