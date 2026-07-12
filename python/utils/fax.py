import os
import re
from typing import Any

from dateutil import parser as dateutil_parser
from googleapiclient.discovery import build
from loguru import logger

from utils.google import google_authenticate
from utils.misc import format_name

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


def validate_fax_config(env_vars: list[str]) -> None:
    for var in env_vars:
        if not os.getenv(var):
            raise ValueError(f"Environment variable {var} is not set.")


# ── Google service builders ───────────────────────────────────────────────


def _docs():
    return build("docs", "v1", credentials=google_authenticate())


def _sheets():
    return build("sheets", "v4", credentials=google_authenticate())


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
        valueInputOption="USER_ENTERED",
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
