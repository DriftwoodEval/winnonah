import base64
import mimetypes
import os
import re
import time
from collections import deque
from datetime import datetime, timedelta
from email.message import EmailMessage
from pathlib import Path

import pandas as pd
from dateutil import parser as dtparser
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from loguru import logger

import utils.database
import utils.misc
from utils.constants import TABLE_CLIENT

# If modifying these scopes, delete the file token.json.
SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.compose",
]


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
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_folder_id],
        }
        service.files().create(body=file_metadata, fields="id").execute()
    except HttpError as err:
        logger.error(f"An error occurred: {err}")


def get_drive_service():
    """Get the Google Drive service."""
    creds = google_authenticate()
    return build("drive", "v3", credentials=creds)


def _normalize_name_tokens(name: str):
    """Converts 'John Smith-Doe' to a set: {'john', 'smith', 'doe'}. Removes punctuation, double spaces, and lowercases."""
    if not name:
        return set()
    clean_name = re.sub(r"[^\w\s]", " ", name).lower()
    return set(clean_name.split())


def _build_client_lookup(df_clients: pd.DataFrame):
    """Pre-processes clients into a list of dicts for faster matching. Structure: [{'id': 1, 'tokens': {'john', 'smith'}}, ...]."""
    client_lookup = []
    for _, row in df_clients.iterrows():
        tokens = _normalize_name_tokens(f"{row['FIRSTNAME']} {row['LASTNAME']}")
        client_data = {
            "id": row["CLIENT_ID"],
            "tokens": tokens,
            "original_first": row["FIRSTNAME"],
            "original_last": row["LASTNAME"],
        }
        client_lookup.append(client_data)

        if row["PREFERRED_NAME"]:
            pref_tokens = _normalize_name_tokens(
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

                folder_tokens = _normalize_name_tokens(folder_name)
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

    client_lookup = _build_client_lookup(df_clients)

    logger.debug("Scanning folders...")
    _process_folders_queued(service, base_folder_id, client_lookup, db_connection)

    logger.debug("Finished.")


def send_gmail(
    message_text: str,
    subject: str,
    to_addr: str,
    from_addr: str,
    cc_addr: str | None = None,
    html: str | None = None,
    attachments: list[str | tuple[bytes, str]] | None = None,
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
    """Search all calendars for an event matching client_id + start_time (±1 hr).

    Returns {"event_id", "calendar_id", "title"} or None if not found.
    Used as a fallback when the stored event ID is stale (e.g. event moved calendars).
    """
    # Strip tzinfo for comparison — mirrors batch_search_calendar_events behaviour
    naive_start = start_time.replace(tzinfo=None) if start_time.tzinfo else start_time

    logger.info(
        f"Searching all calendars for client {client_id} near "
        f"{naive_start.strftime('%Y-%m-%d %H:%M')} (±1 hr match, ±1 day fetch window)"
    )

    creds = google_authenticate()
    service = build("calendar", "v3", credentials=creds)

    # Wide fetch window (±1 day) to absorb timezone offsets in the stored startTime
    window_start = (naive_start - timedelta(days=1)).isoformat() + "Z"
    window_end = (naive_start + timedelta(days=1)).isoformat() + "Z"

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
            if event_dt.tzinfo is not None:
                event_dt = event_dt.replace(tzinfo=None)

            time_diff = abs((event_dt - naive_start).total_seconds())
            logger.debug(
                f"    Client {client_id} in description of '{event.get('summary', '')}' "
                f"on {calendar_id} — event {event_dt.strftime('%Y-%m-%d %H:%M')}, "
                f"diff {int(time_diff)}s"
            )

            if time_diff > 3600:
                logger.warning(
                    f"    Skipping: time diff {int(time_diff)}s exceeds 1 hr tolerance"
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
        f"{naive_start.strftime('%Y-%m-%d %H:%M')}"
    )
    return None
