import json
import os
import re
from datetime import UTC, datetime

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from googleapiclient.discovery import build
from pydantic import BaseModel

from utils.database import get_db, get_python_config
from utils.google import google_authenticate

load_dotenv()

app = FastAPI()


class ClaimRequest(BaseModel):
    source_parent_id: str  # Report queue
    destination_parent_id: str  # Report writers' folders
    user_name: str


def get_current_user(request: Request):
    session_token = (
        request.cookies.get("authjs.session-token")
        or request.cookies.get("__Secure-authjs.session-token")
        or request.cookies.get("next-auth.session-token")
        or request.cookies.get("__Secure-next-auth.session-token")
    )

    if not session_token:
        raise HTTPException(status_code=401, detail="Authentication required")

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT
                    u.id, u.email, u.permissions, u.archived,
                    s.expires,
                    a.access_token, a.refresh_token, a.expires_at, a.scope
                FROM emr_session s
                JOIN emr_user u ON s.userId = u.id
                LEFT JOIN emr_account a ON u.id = a.userId AND a.provider = 'google'
                WHERE s.sessionToken = %s
            """
            cursor.execute(sql, (session_token,))
            row = cursor.fetchone()

            if not row:
                raise HTTPException(status_code=401, detail="Invalid session")

            if row["expires"].replace(tzinfo=UTC) < datetime.now(UTC):
                raise HTTPException(status_code=401, detail="Session expired")

            if row.get("archived"):
                raise HTTPException(status_code=403, detail="Account archived")

            return {
                "user_id": row["id"],
                "email": row["email"],
                "permissions": json.loads(row["permissions"])
                if row["permissions"]
                else {},
            }
    finally:
        conn.close()


@app.get("/folders/{parent_id}")
async def get_subfolders(
    parent_id: str, current_user: dict = Depends(get_current_user)
):
    try:
        creds = google_authenticate()
        service = build("drive", "v3", credentials=creds)

        query = f"'{parent_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"

        results = (
            service.files()
            .list(
                q=query,
                spaces="drive",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                fields="nextPageToken, files(id, name)",
            )
            .execute()
        )

        items = results.get("files", [])

        if not items:
            return {"message": "No folders found.", "folders": []}

        return {"folders": [{"id": item["id"], "name": item["name"]} for item in items]}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/folders/claim")
async def claim_top_fodler(
    request: ClaimRequest, current_user: dict = Depends(get_current_user)
):
    try:
        full_config = get_python_config(config_id=1)
        if not full_config:
            raise HTTPException(
                status_code=500, detail="Configuration not found in database."
            )

        name_map = (
            full_config.get("config", {}).get("piecework", {}).get("name_map", {})
        )

        writer_initials = None
        target_name = request.user_name.strip().lower()

        for initials, full_name in name_map.items():
            if full_name.strip().lower() == target_name:
                writer_initials = initials
                break

        final_entry = writer_initials or request.user_name

        creds = google_authenticate()
        drive_service = build("drive", "v3", credentials=creds)
        sheets_service = build("sheets", "v4", credentials=creds)

        source_query = (
            f"'{request.source_parent_id}' in parents and "
            "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        )

        source_results = (
            drive_service.files()
            .list(
                q=source_query,
                orderBy="name",
                pageSize=1,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                fields="files(id, name)",
            )
            .execute()
        )

        folders = source_results.get("files", [])
        if not folders:
            raise HTTPException(
                status_code=404, detail="No folders available to claim."
            )

        target_folder = folders[0]
        folder_name = target_folder["name"]

        match = re.search(r"\[([A-Za-z0-9-]+)\]", folder_name)
        if not match:
            raise HTTPException(
                status_code=400,
                detail=f"No Client ID found in brackets for: {folder_name}",
            )

        client_id = match.group(1)

        punchlist_range = os.getenv("PUNCHLIST_RANGE")
        sheet_data = (
            sheets_service.spreadsheets()
            .values()
            .get(
                spreadsheetId=os.getenv("PUNCHLIST_ID"),
                range=punchlist_range,
            )
            .execute()
        )

        rows = sheet_data.get("values", [])
        if not rows:
            raise HTTPException(
                status_code=500, detail="Client tracker sheet is empty."
            )

        header = rows[0]
        try:
            id_col_index = header.index("Client ID")
            assign_col_index = header.index(
                "Assigned to OR added to report writing folder"
            )
        except ValueError:
            raise HTTPException(
                status_code=500, detail="Required columns not found in Sheet header."
            )

        row_number = None
        for i, row in enumerate(
            rows[1:], start=2
        ):  # Start at 2 for 1-based Sheets indexing
            if len(row) > id_col_index and row[id_col_index] == client_id:
                row_number = i
                break

        if not row_number:
            raise HTTPException(
                status_code=404,
                detail=f"Client ID {client_id} not found in tracking sheet.",
            )

        # Escape single quotes in the name to prevent query errors
        safe_name = request.user_name.replace("'", "\\'")

        dest_query = (
            f"name contains '{safe_name}' and "
            f"'{request.destination_parent_id}' in parents and "
            "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        )

        dest_results = (
            drive_service.files()
            .list(
                q=dest_query,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                fields="files(id, name)",
            )
            .execute()
        )

        dest_folders = dest_results.get("files", [])

        if not dest_folders:
            raise HTTPException(
                status_code=404,
                detail=f"Destination folder for user '{request.user_name}' not found. Please contact an admin.",
            )

        user_folder_id = dest_folders[0]["id"]
        user_folder_name = dest_folders[0]["name"]

        file = (
            drive_service.files()
            .get(fileId=target_folder["id"], fields="parents", supportsAllDrives=True)
            .execute()
        )

        previous_parents = ",".join(file.get("parents", []))

        drive_service.files().update(
            fileId=target_folder["id"],
            addParents=user_folder_id,
            removeParents=previous_parents,
            supportsAllDrives=True,
        ).execute()

        col_letter = chr(65 + assign_col_index)
        sheet_name = (
            punchlist_range.split("!")[0]
            if punchlist_range and "!" in punchlist_range
            else "PUNCH"
        )
        update_range = f"{sheet_name}!{col_letter}{row_number}"

        # print(update_range, final_entry)

        sheets_service.spreadsheets().values().update(
            spreadsheetId=os.getenv("PUNCHLIST_ID"),
            range=update_range,
            valueInputOption="RAW",
            body={"values": [[final_entry]]},
        ).execute()

        return {
            "status": "success",
            "folder_claimed": folder_name,
            "moved_into": user_folder_name,
            "client_id": client_id,
        }

    except HTTPException as he:
        # Re-raise our custom HTTP errors so FastAPI returns the correct status code
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
