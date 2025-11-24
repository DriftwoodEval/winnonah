import base64
import os
import re
import time
from collections import deque
from email.message import EmailMessage
from typing import Optional

import pandas as pd
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from loguru import logger

import utils.database
import utils.misc

# If modifying these scopes, delete the file token.json.
SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/calendar.readonly",
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
    if os.path.exists("./auth_cache/token.json"):
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
    with open("./auth_cache/token.json", "w") as token:
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
                matches = []

                for client in client_lookup:
                    if client["tokens"].issubset(folder_tokens):
                        matches.append(client)

                # Deduplicate by ID
                unique_matches = {m["id"]: m for m in matches}.values()

                if len(unique_matches) == 1:
                    match = list(unique_matches)[0]
                    new_name = f"{folder_name} [{match['id']}]"

                    logger.debug(
                        f"MATCH: {folder_name} ({drive_id}) -> {match['original_first']} {match['original_last']}"
                    )

                    try:
                        # Update DB
                        with db_connection.cursor() as cursor:
                            sql = "UPDATE emr_client SET driveId = %s WHERE id = %s"
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
    client_lookup = _build_client_lookup(df_clients)

    logger.debug("Scanning folders...")
    _process_folders_queued(service, base_folder_id, client_lookup, db_connection)

    logger.debug("Finished.")


def send_gmail(
    message_text: str,
    subject: str,
    to_addr: str,
    from_addr: str,
    cc_addr: Optional[str] = None,
    html: Optional[str] = None,
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
