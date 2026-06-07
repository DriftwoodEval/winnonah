import os
import re
from typing import Any

from dateutil import parser as dateutil_parser
from googleapiclient.discovery import build
from loguru import logger

from utils.google import google_authenticate

# Report fax
ENV_FAX_FOLDER_ID = "FAX_FOLDER_ID"  # to-be-faxed-folder
ENV_FAX_COMPLETED_FOLDER_ID = "FAX_COMPLETED_FOLDER_ID"
ENV_FAX_COVER_TEMPLATE_ID = "FAX_COVER_TEMPLATE_ID"
ENV_REPORT_FAX_FROM_EMAIL = "REPORT_FAX_FROM_EMAIL"

# Close fax
ENV_CLOSE_FAX_SPREADSHEET_ID = "CLOSE_FAX_SPREADSHEET_ID"
ENV_CLOSE_FAX_SHEET_TEMPLATE_ID = "CLOSE_FAX_SHEET_TEMPLATE_ID"
ENV_CLOSE_FAX_OUTBOX_FOLDER_ID = "CLOSE_FAX_OUTBOX_FOLDER_ID"
ENV_CLOSE_FAX_SENT_FOLDER_ID = "CLOSE_FAX_SENT_FOLDER_ID"
ENV_CLOSE_FAX_FROM_EMAIL = "CLOSE_FAX_FROM_EMAIL"

FAX_REPORT_ENV_VARS = [
    ENV_FAX_FOLDER_ID,
    ENV_FAX_COMPLETED_FOLDER_ID,
    ENV_FAX_COVER_TEMPLATE_ID,
    ENV_REPORT_FAX_FROM_EMAIL,
]

FAX_CLOSE_ENV_VARS = [
    ENV_CLOSE_FAX_SPREADSHEET_ID,
    ENV_CLOSE_FAX_SHEET_TEMPLATE_ID,
    ENV_CLOSE_FAX_OUTBOX_FOLDER_ID,
    ENV_CLOSE_FAX_SENT_FOLDER_ID,
    ENV_CLOSE_FAX_FROM_EMAIL,
]

# Spreadsheet column header names
HEADER_NAME = "Client Name"
HEADER_DOB = "DOB"
HEADER_FAX_TO_DR = "Fax to Dr."
HEADER_REASON = "Fax Reason"
HEADER_DOCTOR = "Dr. to Send to"
HEADER_SENT = "Fax Sent"

_GOOGLE_DOC_MIME = "application/vnd.google-apps.document"
_GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder"


def validate_fax_config(env_vars: list[str]) -> None:
    for var in env_vars:
        if not os.getenv(var):
            raise ValueError(f"Environment variable {var} is not set.")


# ── Google service builders ───────────────────────────────────────────────


def _drive():
    return build("drive", "v3", credentials=google_authenticate())


def _docs():
    return build("docs", "v1", credentials=google_authenticate())


def _sheets():
    return build("sheets", "v4", credentials=google_authenticate())


# ── Drive helpers ─────────────────────────────────────────────────────────


def list_files_in_folder(folder_id: str) -> list[dict]:
    """Return all non-trashed, non-folder items in a Drive folder."""
    results = []
    page_token = None
    q = f"'{folder_id}' in parents and mimeType != '{_GOOGLE_FOLDER_MIME}' and trashed = false"
    service = _drive()
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
    service = _drive()
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
    service = _drive()
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
        _drive()
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
        _drive()
        .files()
        .copy(
            fileId=file_id,
            body={"name": new_name, "parents": [dest_folder_id]},
            fields="id, name",
        )
        .execute()
    )


def move_file(file_id: str, dest_folder_id: str) -> None:
    service = _drive()
    meta = service.files().get(fileId=file_id, fields="parents").execute()
    prev_parents = ",".join(meta.get("parents", []))
    service.files().update(
        fileId=file_id,
        addParents=dest_folder_id,
        removeParents=prev_parents,
        fields="id, parents",
    ).execute()


def get_file_as_bytes(file: dict) -> bytes:
    """Export Google Docs as PDF; download all other file types as-is."""
    service = _drive()
    if file["mimeType"] == _GOOGLE_DOC_MIME:
        return (
            service.files()
            .export(fileId=file["id"], mimeType="application/pdf")
            .execute()
        )
    return service.files().get_media(fileId=file["id"]).execute()


# ── Docs helpers ──────────────────────────────────────────────────────────


def replace_text_in_doc(doc_id: str, replacements: dict[str, str]) -> None:
    """Apply all find-and-replace pairs in a single batchUpdate call."""
    requests = [
        {
            "replaceAllText": {
                "containsText": {"text": old, "matchCase": True},
                "replaceText": new,
            }
        }
        for old, new in replacements.items()
    ]
    _docs().documents().batchUpdate(
        documentId=doc_id, body={"requests": requests}
    ).execute()


# ── Sheets helpers ────────────────────────────────────────────────────────


def get_sheet_values(spreadsheet_id: str, range_: str) -> list[list]:
    result = (
        _sheets()
        .spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=range_)
        .execute()
    )
    return result.get("values", [])


def set_sheet_value(spreadsheet_id: str, range_: str, value: Any) -> None:
    _sheets().spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=range_,
        valueInputOption="RAW",
        body={"values": [[value]]},
    ).execute()


def set_sheet_range_values(
    spreadsheet_id: str, range_: str, values: list[list]
) -> None:
    _sheets().spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=range_,
        valueInputOption="RAW",
        body={"values": values},
    ).execute()


def get_last_row(spreadsheet_id: str) -> int:
    """Return the 1-based index of the last row with data in column A."""
    return len(get_sheet_values(spreadsheet_id, "A:A"))


def set_column_validation(
    spreadsheet_id: str, last_row: int, col_index: int, validation_list: list[str]
) -> None:
    """Replace the dropdown validation on a column rows 2 through last_row."""
    spreadsheet = (
        _sheets()
        .spreadsheets()
        .get(
            spreadsheetId=spreadsheet_id,
            fields="sheets(properties(sheetId))",
        )
        .execute()
    )
    sheet_id = spreadsheet["sheets"][0]["properties"]["sheetId"]

    _sheets().spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={
            "requests": [
                {
                    "setDataValidation": {
                        "range": {
                            "sheetId": sheet_id,
                            "startRowIndex": 1,
                            "endRowIndex": last_row,
                            "startColumnIndex": col_index,
                            "endColumnIndex": col_index + 1,
                        },
                        "rule": {
                            "condition": {
                                "type": "ONE_OF_LIST",
                                "values": [
                                    {"userEnteredValue": v} for v in validation_list
                                ],
                            },
                            "strict": True,
                            "showCustomUi": True,
                        },
                    }
                }
            ]
        },
    ).execute()


# Formatting

_NAME_EXCEPTIONS = {"MUSC", "DDSN", "SC", "NC", "DSS", "MP", "LLC"}


def format_name(name: str) -> str:
    """Title-case a name string, preserving known acronyms and stripping fax digits / diagnostic labels."""
    name = re.sub(r"[^a-zA-Z\s]", " ", name)
    name = re.sub(r"\s{2,}", " ", name)
    name = re.sub(r"\b(ASD|ADHD)\b", "", name)
    name = name.strip()
    return " ".join(
        w.upper() if w.upper() in _NAME_EXCEPTIONS else w.capitalize()
        for w in name.split()
    )


def extract_fax_number(name: str) -> str | None:
    """Extract and return a 10-digit fax number string from a folder or file name."""
    if not name:
        logger.warning("extract_fax_number received an empty string")
        return None
    match = re.search(r"\d{3}.*?\d{3}.*?\d{4}", name)
    if match:
        return re.sub(r"\D", "", match.group(0))
    logger.warning(f"No fax number found in: {name}")
    return None


def format_fax_number(raw: str) -> str | None:
    """Format a 10-digit string as (XXX) XXX-XXXX."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if len(digits) != 10:
        return None
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"


def format_date(date_value: Any) -> str:
    """Format a date as MM/DD/YY. Accepts datetime objects or parseable strings."""
    if isinstance(date_value, str):
        date_value = dateutil_parser.parse(date_value)
    return date_value.strftime("%m/%d/%y")


def pretty_name(raw_name: str) -> str | None:
    """Return 'Formatted Name (XXX) XXX-XXXX', or None if no fax number is found."""
    fax = extract_fax_number(raw_name)
    if not fax:
        return None
    return f"{format_name(raw_name)} {format_fax_number(fax)}"
