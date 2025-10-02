import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from loguru import logger

# If modifying these scopes, delete the file token.json.
SCOPES = [
    "https://www.googleapis.com/auth/drive",
]


def _google_authenticate():
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
    creds = _google_authenticate()
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
                    fields="nextPageToken, files(id, name)",
                    pageToken=page_token,
                )
                .execute()
            )
            files.extend(response.get("files", []))
            page_token = response.get("nextPageToken", None)
            if page_token is None:
                break

    except HttpError as err:
        logger.error(f"An error occurred: {err}")
        files = None

    return files


def create_folder_in_folder(new_folder_name: str, parent_folder_id: str):
    """Create a new folder in the given parent folder."""
    creds = _google_authenticate()
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
