import json
import os
import re
from datetime import UTC, datetime

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from googleapiclient.discovery import build
from pydantic import BaseModel

from utils.constants import TABLE_CLIENT
from utils.database import get_db, get_python_config
from utils.google import google_authenticate, send_gmail

load_dotenv()

app = FastAPI()


class ClaimRequest(BaseModel):
    source_parent_id: str  # Report queue
    destination_parent_id: str  # Report writers' folders


class ApprovalNotificationRequest(BaseModel):
    user_email: str
    report_name: str
    queue_count: int


def get_google_services():
    """Builds and yields Google API services."""
    creds = google_authenticate()
    drive_service = build("drive", "v3", credentials=creds)
    sheets_service = build("sheets", "v4", credentials=creds)
    return {"drive": drive_service, "sheets": sheets_service}


def get_current_user(request: Request):
    COOKIE_NAMES = [
        "authjs.session-token",
        "__Secure-authjs.session-token",
        "next-auth.session-token",
        "__Secure-next-auth.session-token",
    ]
    session_token = next(
        (
            request.cookies.get(name)
            for name in COOKIE_NAMES
            if request.cookies.get(name)
        ),
        None,
    )

    if not session_token:
        raise HTTPException(status_code=401, detail="Authentication required")

    conn = get_db()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT
                    u.id, u.email, u.name, u.permissions, u.archived,
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
                "name": row["name"],
                "permissions": json.loads(row["permissions"])
                if row["permissions"]
                else {},
            }
    finally:
        conn.close()


def get_writer_id(user_name: str) -> str:
    """Fetches config and maps user name to initials."""
    full_config = get_python_config(config_id=1)
    if not full_config:
        raise HTTPException(
            status_code=500, detail="Configuration not found in database."
        )

    name_map = full_config.get("config", {}).get("piecework", {}).get("name_map", {})
    target_name = user_name.strip().lower()

    for initials, full_name in name_map.items():
        if full_name.strip().lower() == target_name:
            return initials
    return user_name


def find_drive_folder(drive_service, query: str, error_message: str):
    """Executes a Drive API search and returns the first result."""
    results = (
        drive_service.files()
        .list(
            q=query,
            orderBy="name",
            pageSize=1,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            fields="files(id, name, parents)",
        )
        .execute()
    )

    folders = results.get("files", [])
    if not folders:
        raise HTTPException(status_code=404, detail=error_message)
    return folders[0]


def col_num_to_letter(col_num: int) -> str:
    """Safely converts a 0-based column index to a Sheet column letter."""
    string = ""
    while col_num >= 0:
        string = chr(col_num % 26 + 65) + string
        col_num = col_num // 26 - 1
    return string


def get_user_folder(drive_service, user_name: str, parent_id: str):
    """Finds the Drive folder for a specific user within a parent directory."""
    if not user_name:
        raise HTTPException(
            status_code=400, detail="User name is required for folder lookup"
        )

    safe_name = user_name.replace("'", "\\'")
    dest_query = (
        f"name contains '{safe_name}' and '{parent_id}' in parents and "
        "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )

    return find_drive_folder(
        drive_service,
        dest_query,
        f"Destination folder for '{user_name}' not found.",
    )


@app.get("/folders/duplicates")
async def find_duplicates(
    current_user: dict = Depends(get_current_user),
    services: dict = Depends(get_google_services),
):
    drive_service = services["drive"]

    try:
        query = "mimeType = 'application/vnd.google-apps.folder' and name contains '[' and trashed = false"
        duplicates_map = {}
        page_token = None

        while True:
            response = (
                drive_service.files()
                .list(
                    q=query,
                    pageSize=1000,
                    pageToken=page_token,
                    fields="nextPageToken, files(id, name, webViewLink)",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                )
                .execute()
            )

            files = response.get("files", [])
            id_regex = r"\[(\d+)\]"

            for file in files:
                name = file.get("name")
                file_id = file.get("id")
                if not name or not file_id:
                    continue

                match = re.search(id_regex, name)
                if match:
                    client_id = match.group(1)

                    folder_data = {
                        "id": file_id,
                        "name": name,
                        "url": file.get("webViewLink"),
                    }

                    if client_id in duplicates_map:
                        duplicates_map[client_id].append(folder_data)
                    else:
                        duplicates_map[client_id] = [folder_data]

            page_token = response.get("nextPageToken")
            if not page_token:
                break

        # Filter for only those with more than 1 folder
        duplicate_client_ids = [
            cid for cid, folders in duplicates_map.items() if len(folders) > 1
        ]

        if not duplicate_client_ids:
            return []

        # Convert strings to integers for DB query
        ids_to_query = [int(cid) for cid in duplicate_client_ids]

        conn = get_db()
        try:
            with conn.cursor() as cursor:
                format_strings = ",".join(["%s"] * len(ids_to_query))
                sql = f"SELECT id, hash, fullName, driveId FROM {TABLE_CLIENT} WHERE id IN ({format_strings})"
                cursor.execute(sql, tuple(ids_to_query))
                db_clients = cursor.fetchall()

                db_client_map = {str(client["id"]): client for client in db_clients}
        finally:
            conn.close()

        results = []
        for client_id in duplicate_client_ids:
            drive_folders = duplicates_map[client_id]
            db_info = db_client_map.get(client_id)

            if db_info and db_info.get("hash") and db_info.get("fullName"):
                folders_with_db_match = []
                for folder in drive_folders:
                    folder["isDbMatch"] = folder["id"] == db_info.get("driveId")
                    folders_with_db_match.append(folder)

                results.append(
                    {
                        "clientId": client_id,
                        "clientHash": db_info["hash"],
                        "clientFullName": db_info["fullName"],
                        "folders": folders_with_db_match,
                    }
                )

        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/folders/writer/{parent_id}")
async def get_writer_folder(
    parent_id: str,
    current_user: dict = Depends(get_current_user),
    services: dict = Depends(get_google_services),
):
    try:
        user_folder = get_user_folder(
            services["drive"], current_user["name"], parent_id
        )
        return {"id": user_folder["id"], "name": user_folder["name"]}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/folders/{parent_id}")
async def get_subfolders(
    parent_id: str,
    current_user: dict = Depends(get_current_user),
    services: dict = Depends(get_google_services),
):
    try:
        query = f"'{parent_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        results = (
            services["drive"]
            .files()
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
        return {"folders": [{"id": item["id"], "name": item["name"]} for item in items]}

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch folders: {str(e)}"
        )


@app.post("/folders/claim")
async def claim_top_folder(
    request: ClaimRequest,
    current_user: dict = Depends(get_current_user),
    services: dict = Depends(get_google_services),
):
    drive_service = services["drive"]
    sheets_service = services["sheets"]

    try:
        user_name = current_user["name"]
        if not user_name:
            raise HTTPException(
                status_code=400, detail="User name not found in session"
            )

        writer_id = get_writer_id(user_name)
        final_entry = f"{writer_id} {datetime.now().strftime('%-m/%-d')}"

        source_query = (
            f"'{request.source_parent_id}' in parents and "
            "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        )
        target_folder = find_drive_folder(
            drive_service, source_query, "No folders available to claim."
        )
        folder_name = target_folder["name"]

        match = re.search(r"\[([A-Za-z0-9-]+)\]", folder_name)
        if not match:
            raise HTTPException(
                status_code=400,
                detail=f"No Client ID found in brackets for: {folder_name}",
            )
        client_id = match.group(1)

        user_folder = get_user_folder(
            drive_service, user_name, request.destination_parent_id
        )

        previous_parents = ",".join(target_folder.get("parents", []))
        drive_service.files().update(
            fileId=target_folder["id"],
            addParents=user_folder["id"],
            removeParents=previous_parents,
            supportsAllDrives=True,
        ).execute()

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

        row_number = next(
            (
                i
                for i, row in enumerate(rows[1:], start=2)
                if len(row) > id_col_index and row[id_col_index] == client_id
            ),
            None,
        )
        if not row_number:
            raise HTTPException(
                status_code=404,
                detail=f"Client ID {client_id} not found in tracking sheet.",
            )

        col_letter = col_num_to_letter(assign_col_index)
        sheet_name = (
            punchlist_range.split("!")[0]
            if punchlist_range and "!" in punchlist_range
            else "PUNCH"
        )

        sheets_service.spreadsheets().values().update(
            spreadsheetId=os.getenv("PUNCHLIST_ID"),
            range=f"{sheet_name}!{col_letter}{row_number}",
            valueInputOption="RAW",
            body={"values": [[final_entry]]},
        ).execute()

        return {
            "status": "success",
            "folder_claimed": folder_name,
            "folder_id": target_folder["id"],
            "moved_into": user_folder["name"],
            "client_id": client_id,
        }

    except HTTPException:
        # Re-raise our custom HTTP errors so FastAPI returns the correct status code
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/notifications/report-approved")
async def notify_report_approved(
    request: ApprovalNotificationRequest,
    current_user: dict = Depends(get_current_user),
):
    """Sends a notification email to a user when their report is approved."""
    if not current_user["permissions"].get("reports:approve"):
        raise HTTPException(
            status_code=403, detail="Not authorized to send approval notifications"
        )

    subject = f"Report Approved: {request.report_name}"

    message_text = (
        f"Your report for '{request.report_name}' has been approved.\n\n"
        "You can now claim a new report in the app: "
        "https://emr.driftwoodeval.com/claim-reports "
        f"({request.queue_count} report{'s' if request.queue_count != 1 else ''} in queue)"
    )

    html_content = f"""
    <p>Your report for <strong>{request.report_name}</strong> has been approved.</p>
    <p>You can now claim a new report in the app: <a href="https://emr.driftwoodeval.com/claim-reports">Claim Reports</a> f"({request.queue_count} report{"s" if request.queue_count != 1 else ""} in queue)"</p>
    """

    send_gmail(
        message_text=message_text,
        subject=subject,
        to_addr=request.user_email,
        from_addr="tech@driftwoodeval.com",
        html=html_content,
    )

    return {"status": "success"}
