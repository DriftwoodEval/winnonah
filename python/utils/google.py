import csv
import os
import time

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


def get_folder(folder_id):
    """Get the folder with the given ID."""
    creds = google_authenticate()
    try:
        service = build("drive", "v3", credentials=creds)
        folder = service.files().get(fileId=folder_id).execute()
        return folder
    except HttpError as err:
        logger.error(f"An error occurred: {err}")


DRIVE_FILES_CSV = "temp/drive_files.csv"


def recurse_folders(folder: dict, depth=0):
    """Recursively checks for subfolders in the given folder and saves to CSV."""
    files = get_items_in_folder(folder["id"])
    if files is None:
        return
    length = len(files)
    if length > 100:
        logger.debug(f"Processing {length} items in {folder['name']} ({folder['id']})")
    for i, file in enumerate(files):
        if length > 100 and i % ((length // 100) + 1) == 0:
            logger.debug(f"{100 * i // length}% done")
        if "folder" in file["webViewLink"].lower():  # Check if file is a folder
            if (
                "[" not in file["name"] and "]" not in file["name"]
            ):  # Folder name doesn't already have an ID in brackets
                utils.misc.save_to_csv(f"{file['name']},{file['id']}", DRIVE_FILES_CSV)
            if depth < 2:
                logger.debug(f"{file['name']} ({file['id']})")
            recurse_folders(
                file,
                depth + 1,
            )


def add_client_ids_to_drive():
    """Add client IDs to drive."""
    initial_folder = get_folder(os.getenv("BASE_FOLDER_ID"))

    if initial_folder is None:
        logger.error("Failed to get initial folder")
        return

    try:
        recurse_folders(
            {"id": initial_folder["id"], "name": initial_folder["name"]},
        )
    except Exception as e:
        logger.error(e)

    creds = google_authenticate()
    service = build("drive", "v3", credentials=creds)

    db_clients = utils.database.get_all_clients()

    with open(DRIVE_FILES_CSV, "r") as f:
        data = csv.reader(f)
        for row in data:
            matches = 0
            folder_name = row[0]
            folder_name_parts = folder_name.split()
            drive_id = row[1]
            (
                matched_first,
                matched_last,
                matched_drive_id,
                matched_client_id,
                new_folder_name,
            ) = "", "", "", "", ""
            for _, client in db_clients.iterrows():
                client_first = client["FIRSTNAME"]
                client_last = client["LASTNAME"]
                client_id = client["CLIENT_ID"]
                if client["PREFERRED_NAME"] != None:
                    client_preferred = client["PREFERRED_NAME"]
                    if (
                        # Ex. client name is "Will Smith" and folder is "William Smith"
                        (client_first in folder_name or client_preferred in folder_name)
                        and client_last in folder_name
                    ) or (
                        # Ex. client name is "William Smith" and folder is "Will Smith"
                        len(folder_name_parts) == 2
                        and (
                            folder_name_parts[0] in client_first
                            or folder_name_parts[0] in client_preferred
                        )
                        and folder_name_parts[1] in client_last
                    ):
                        matches += 1
                        matched_first = client_first
                        matched_last = client_last
                        matched_drive_id = drive_id
                        matched_client_id = client_id
                        new_folder_name = f"{folder_name} [{matched_client_id}]"
                else:
                    # Same as above, but no preferred name
                    if (client_first in folder_name and client_last in folder_name) or (
                        len(folder_name_parts) == 2
                        and folder_name_parts[0] in client_first
                        and folder_name_parts[1] in client_last
                    ):
                        matches += 1
                        matched_first = client_first
                        matched_last = client_last
                        matched_drive_id = drive_id
                        matched_client_id = client_id
                        new_folder_name = f"{folder_name} [{matched_client_id}]"
            if matches == 1:
                logger.debug(
                    matched_first,
                    matched_last,
                    folder_name,
                    matched_client_id,
                    matched_drive_id,
                    new_folder_name,
                )
                db_connection = utils.database.get_db()
                with db_connection.cursor() as cursor:
                    sql = f"UPDATE emr_client SET driveId = '{matched_drive_id}' WHERE id = '{matched_client_id}'"
                    cursor.execute(sql)
                db_connection.commit()
                service.files().update(
                    fileId=matched_drive_id,
                    body={"name": new_folder_name},
                    fields="id, name",
                ).execute()
            elif matches >= 2:
                logger.debug("Multiple clients with name", matched_first, matched_last)
