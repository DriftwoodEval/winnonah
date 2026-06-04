"""
Generates and sends close-fax sheets for clients whose records are ready to close.

Reads from the close-fax Google Sheet, creates a fax sheet doc per eligible client,
then sends each as a PDF to the doctor's fax via redfax.com.

Usage:
  python fax_close.py              # generate + send
  python fax_close.py generate     # generate sheets only
  python fax_close.py send         # send existing sheets only
  python fax_close.py validation   # refresh doctor dropdown in the spreadsheet
"""

import os
import re
import time

import typer
from dotenv import load_dotenv
from loguru import logger

from utils.fax import (
    COL_CONSENT,
    COL_DOB,
    COL_DOCTOR,
    COL_NAME,
    COL_REASON,
    COL_SENT,
    ENV_CLOSE_FAX_FROM_EMAIL,
    ENV_CLOSE_FAX_OUTBOX_FOLDER_ID,
    ENV_CLOSE_FAX_SENT_FOLDER_ID,
    ENV_CLOSE_FAX_SHEET_TEMPLATE_ID,
    ENV_CLOSE_FAX_SPREADSHEET_ID,
    ENV_FAX_COMPLETED_FOLDER_ID,
    ENV_FAX_FOLDER_ID,
    FAX_CLOSE_ENV_VARS,
    copy_file,
    extract_fax_number,
    format_date,
    format_fax_number,
    format_name,
    get_file_as_bytes,
    get_files_by_name,
    get_last_row,
    get_sheet_values,
    list_files_in_folder,
    list_subfolders,
    move_file,
    pretty_name,
    replace_text_in_doc,
    set_column_e_validation,
    set_sheet_range_values,
    set_sheet_value,
    validate_fax_config,
)
from utils.google import send_gmail

logger.add(
    "logs/fax-close.log", rotation="50 MB", filter=lambda r: r["name"] == "fax_close"
)

load_dotenv()

app = typer.Typer()


# ── Helpers ───────────────────────────────────────────────────────────────


def _ss_id() -> str:
    return os.getenv(ENV_CLOSE_FAX_SPREADSHEET_ID)


def _row_val(row: list, index: int) -> str:
    return row[index] if len(row) > index else ""


# ── Dropdown / reason helpers ─────────────────────────────────────────────


def get_nine_reasons() -> list[str]:
    values = get_sheet_values(_ss_id(), "'Dropdown Range'!A1:A9")
    return [row[0] for row in values if row]


def get_valid_reasons() -> list[str]:
    values = get_sheet_values(_ss_id(), "'Dropdown Range'!B:B")
    return [row[0] for row in values if row]


def check_if_nine_reason(reason: str) -> bool:
    return reason in get_nine_reasons()


def check_if_valid_reason(reason: str) -> bool:
    return reason in get_valid_reasons()


def code_to_reason(code: str) -> str | None:
    """Look up the full reason text for a short code (col B → col A)."""
    values = get_sheet_values(_ss_id(), "'Dropdown Range'!A:B")
    for row in values:
        if len(row) >= 2 and row[1] == code:
            return row[0]
    return None


# ── Validation range management ───────────────────────────────────────────


def update_validation_range() -> None:
    """Rebuild the doctor dropdown in column E from current subfolder names."""
    completed_id = os.getenv(ENV_FAX_COMPLETED_FOLDER_ID)
    subfolders = list_subfolders(os.getenv(ENV_FAX_FOLDER_ID))
    names = sorted(
        filter(
            None,
            [pretty_name(sf["name"]) for sf in subfolders if sf["id"] != completed_id],
        )
    )
    last_row = get_last_row(_ss_id())
    logger.info(f"Updating validation range with {len(names)} entries.")
    set_column_e_validation(_ss_id(), last_row, names)


def replace_misformatted_doctors() -> None:
    """Reformat any misformatted doctor names in column E, then refresh the dropdown."""
    ss_id = _ss_id()
    last_row = get_last_row(ss_id)
    values = get_sheet_values(ss_id, f"E2:E{last_row}")
    updated = []
    for row in values:
        current = row[0] if row else ""
        if current:
            raw_fax = extract_fax_number(current)
            if raw_fax:
                current = f"{format_name(current)} {format_fax_number(raw_fax)}"
        updated.append([current])
    set_sheet_range_values(ss_id, f"E2:E{last_row}", updated)
    time.sleep(10)
    update_validation_range()


# ── Row filtering ─────────────────────────────────────────────────────────


def get_filtered_rows() -> list[list]:
    ss_id = _ss_id()
    last_row = get_last_row(ss_id)
    values = get_sheet_values(ss_id, f"A1:F{last_row}")
    return [
        row
        for row in values
        if _row_val(row, COL_CONSENT) == "Yes"
        and not _row_val(row, COL_SENT)
        and _row_val(row, COL_REASON)
        and _row_val(row, COL_DOCTOR)
    ]


# ── Fax sheet generation ──────────────────────────────────────────────────


def generate_fax_sheet(
    client_name: str,
    client_doctor: str,
    client_dob: str,
    client_reason: str,
) -> None:
    fax_number = extract_fax_number(client_doctor)
    if not fax_number:
        return

    pretty_client = format_name(client_name)
    doctor_name = format_name(client_doctor)
    pretty_fax = format_fax_number(fax_number)

    new_file = copy_file(
        os.getenv(ENV_CLOSE_FAX_SHEET_TEMPLATE_ID),
        f"{pretty_client}_{fax_number}",
        os.getenv(ENV_CLOSE_FAX_OUTBOX_FOLDER_ID),
    )

    replacements = {
        "DOCTOR OFFICE NAME": doctor_name,
        "FAX NUMBER": pretty_fax,
        "PATIENT NAME": pretty_client,
        "CHILDDOB": format_date(client_dob),
        f"___ {client_reason}": f"_X_ {client_reason}",
    }
    if not check_if_nine_reason(client_reason):
        replacements["___ Other: "] = f"_X_ Other: {client_reason}"

    replace_text_in_doc(new_file["id"], replacements)
    logger.info(f"Created {pretty_client}_{fax_number}")


# ── Sending ───────────────────────────────────────────────────────────────


def send_close_fax(client_name: str, fax_number: str) -> None:
    logger.info(f"Sending fax for {client_name} to {fax_number}")
    files = get_files_by_name(
        os.getenv(ENV_CLOSE_FAX_OUTBOX_FOLDER_ID), f"{client_name}_{fax_number}"
    )
    if not files:
        logger.warning(f"Missing fax file for {client_name}_{fax_number}")
        return

    fax_file = files[0]
    result = send_gmail(
        message_text="Fax",
        subject="Fax",
        to_addr=f"{fax_number}@redfax.com",
        from_addr=os.getenv(ENV_CLOSE_FAX_FROM_EMAIL),
        attachments=[(get_file_as_bytes(fax_file), f"{client_name}_{fax_number}.pdf")],
    )
    if result is None:
        logger.error(f"Failed to send fax for {client_name}_{fax_number}")
        return

    move_file(fax_file["id"], os.getenv(ENV_CLOSE_FAX_SENT_FOLDER_ID))
    _mark_sent(client_name)


def _mark_sent(client_name: str) -> None:
    ss_id = _ss_id()
    last_row = get_last_row(ss_id)
    values = get_sheet_values(ss_id, f"A1:A{last_row}")
    for i, row in enumerate(values):
        if row and format_name(row[0]) == client_name:
            set_sheet_value(ss_id, f"F{i + 1}", "TRUE")
            return


# ── Orchestrators ─────────────────────────────────────────────────────────


def generate_close_faxes() -> None:
    for row in get_filtered_rows():
        client_name = _row_val(row, COL_NAME)
        client_dob = _row_val(row, COL_DOB)
        client_doctor = _row_val(row, COL_DOCTOR)
        client_reason = _row_val(row, COL_REASON)

        if not client_dob or not client_reason or not client_doctor:
            logger.warning(f"Insufficient info for {client_name}")
        elif not check_if_valid_reason(client_reason):
            logger.warning(f"Invalid reason '{client_reason}' for {client_name}")
        else:
            try:
                client_reason = code_to_reason(client_reason) or client_reason
                generate_fax_sheet(
                    client_name, client_doctor, client_dob, client_reason
                )
            except Exception as e:
                logger.error(f"Error generating sheet for {client_name}: {e}")


def send_close_faxes() -> None:
    for file in list_files_in_folder(os.getenv(ENV_CLOSE_FAX_OUTBOX_FOLDER_ID)):
        match = re.match(r"^(.+?)_(\d+)", file["name"])
        if match:
            send_close_fax(match.group(1), match.group(2))


# ── CLI ───────────────────────────────────────────────────────────────────


@app.command()
def main(
    action: str = typer.Argument(
        default="all",
        help="Which step to run: 'generate', 'send', 'validation', or 'all'",
    ),
) -> None:
    try:
        validate_fax_config(FAX_CLOSE_ENV_VARS)
        match action:
            case "generate":
                generate_close_faxes()
            case "send":
                send_close_faxes()
            case "validation":
                update_validation_range()
            case "all":
                generate_close_faxes()
                send_close_faxes()
            case _:
                logger.error(
                    f"Unknown action '{action}'. Use generate, send, validation, or all."
                )
    except Exception as e:
        logger.exception(f"Failed to run close fax: {e}")


if __name__ == "__main__":
    app()
