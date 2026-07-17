"""
Generates fax cover pages and sends report faxes.

Two sending modes are handled automatically:
  - Folder contains only files → uses a generated cover page (gen cover mode)
  - Folder contains subfolders → uses a signed cover page already in the subfolder

Usage:
  python fax_reports.py              # cover page generation + send
  python fax_reports.py generate     # generate cover pages only
  python fax_reports.py send         # send faxes only
"""

import os

import typer
from dotenv import load_dotenv
from loguru import logger

from utils.fax import (
    ENV_FAX_COMPLETED_FOLDER_ID,
    ENV_FAX_COVER_TEMPLATE_ID,
    ENV_FAX_FOLDER_ID,
    ENV_REPORT_FAX_FROM_EMAIL,
    FAX_REPORT_ENV_VARS,
    extract_fax_number,
    format_fax_number,
    format_name,
    replace_text_in_doc,
    validate_fax_config,
)
from utils.google import (
    batch_move_files,
    check_for_subfolders,
    copy_file,
    get_file_as_bytes,
    list_files_in_folder,
    list_subfolders,
    move_file,
    send_gmail,
)
from utils.misc import json_log_format

logger.add(
    "logs/fax-reports.log",
    format=json_log_format,
    rotation="50 MB",
    filter=lambda r: r["name"] == "utils.fax_reports",
)

load_dotenv()

app = typer.Typer()


# ── Cover page ────────────────────────────────────────────────────────────


def check_for_cover_page(folder_id: str) -> bool:
    return any(f["name"] == "Fax Cover" for f in list_files_in_folder(folder_id))


def generate_cover_page(folder_id: str, folder_name: str) -> None:
    raw_fax_number = extract_fax_number(folder_name)
    if not raw_fax_number:
        return
    fax_number = format_fax_number(raw_fax_number)
    if not fax_number:
        return
    referrer_name = format_name(folder_name)
    new_file = copy_file(os.environ[ENV_FAX_COVER_TEMPLATE_ID], "Fax Cover", folder_id)
    replace_text_in_doc(
        new_file["id"],
        {
            "REFERRER NAME": referrer_name,
            "FAX NUMBER": fax_number,
        },
    )
    logger.info(
        f"Created fax cover in {folder_name}: referrer={referrer_name}, fax={fax_number}"
    )


def check_and_gen_cover_page(folder_id: str, folder_name: str) -> None:
    if not check_for_cover_page(folder_id):
        logger.info(f"Fax cover not found in {folder_name}.")
        generate_cover_page(folder_id, folder_name)


# ── Folder checks ─────────────────────────────────────────────────────────


def is_only_cover_page(folder_id: str) -> bool:
    files = list_files_in_folder(folder_id)
    return len(files) == 1 and files[0]["name"] == "Fax Cover"


# ── Sending ───────────────────────────────────────────────────────────────


def _send_fax(to_addr: str, attachments: list[tuple[bytes, str]]) -> bool:
    result = send_gmail(
        message_text="Fax",
        subject="Fax",
        to_addr=to_addr,
        from_addr=os.environ[ENV_REPORT_FAX_FROM_EMAIL],
        attachments=attachments,
    )
    return result is not None


def send_fax_with_gen_cover(folder_id: str, folder_name: str) -> list[dict] | None:
    """Send all files in the folder with the generated 'Fax Cover' attachment first.

    Returns the non-cover files on success (caller uses them to move to completed),
    or None on failure.
    """
    fax_number = extract_fax_number(folder_name)
    address = f"{fax_number}@redfax.com"
    logger.info(f"Attempting to send to {address}")

    files = list_files_in_folder(folder_id)
    cover_files = [f for f in files if f["name"] == "Fax Cover"]
    other_files = [f for f in files if f["name"] != "Fax Cover"]

    if not cover_files:
        logger.error(f"Missing Fax Cover in {folder_name}")
        return None

    try:
        attachments = [(get_file_as_bytes(cover_files[0]), "Fax Cover.pdf")]
        attachments += [(get_file_as_bytes(f), f["name"]) for f in other_files]
        return other_files if _send_fax(address, attachments) else None
    except Exception as e:
        logger.error(f"Error building attachments for {folder_name}: {e}")
        return None


def send_fax_with_signed_cover(
    folder_id: str, folder_name: str, fax_number: str
) -> bool:
    """Send all files in a subfolder, placing the Report attachment last."""
    address = f"{fax_number}@redfax.com"
    logger.info(f"Attempting to send to {address}")

    files = list_files_in_folder(folder_id)
    report_files = [f for f in files if "Report" in f["name"]]
    other_files = [f for f in files if "Report" not in f["name"]]

    if not report_files:
        logger.error(f"Missing Report file in {folder_name}")
        return False

    try:
        attachments = [(get_file_as_bytes(f), f["name"]) for f in other_files]
        attachments += [(get_file_as_bytes(f), f["name"]) for f in report_files]
        return _send_fax(address, attachments)
    except Exception as e:
        logger.error(f"Error building attachments for {folder_name}: {e}")
        return False


# ── Post-send cleanup ─────────────────────────────────────────────────────


def move_reports_to_completed(files: list[dict], folder_id: str) -> None:
    completed_id = os.environ[ENV_FAX_COMPLETED_FOLDER_ID]
    batch_move_files([f["id"] for f in files], completed_id, folder_id)


# ── Orchestrators ─────────────────────────────────────────────────────────


def generate_report_cover_pages() -> None:
    to_be_faxed_id = os.environ[ENV_FAX_FOLDER_ID]
    completed_id = os.environ[ENV_FAX_COMPLETED_FOLDER_ID]
    subfolders = [
        sf for sf in list_subfolders(to_be_faxed_id) if sf["id"] != completed_id
    ]
    logger.info(f"Checking {len(subfolders)} folders for cover pages")
    for sf in subfolders:
        if check_for_subfolders(sf["id"]) != "subfolders":
            check_and_gen_cover_page(sf["id"], sf["name"])


def send_report_faxes() -> None:
    to_be_faxed_id = os.environ[ENV_FAX_FOLDER_ID]
    completed_id = os.environ[ENV_FAX_COMPLETED_FOLDER_ID]

    for sf in list_subfolders(to_be_faxed_id):
        if sf["id"] == completed_id:
            continue

        folder_id, folder_name = sf["id"], sf["name"]
        status = check_for_subfolders(folder_id)

        if status == "subfolders":
            fax_number = extract_fax_number(folder_name)
            if not fax_number:
                logger.warning(f"Skipping {folder_name}: no fax number found")
                continue
            for ssf in list_subfolders(folder_id):
                logger.info(f"Sending fax for {folder_name}")
                try:
                    if send_fax_with_signed_cover(ssf["id"], ssf["name"], fax_number):
                        move_file(ssf["id"], completed_id)
                        logger.info(f"Moved {ssf['name']} to completed")
                    else:
                        logger.warning(
                            f"Skipping move for {ssf['name']} - send failed."
                        )
                except Exception as e:
                    logger.error(f"Error sending fax for {folder_name}: {e}")

        elif (
            status == "only files"
            and not is_only_cover_page(folder_id)
            and check_for_cover_page(folder_id)
        ):
            logger.info(f"Sending fax for {folder_name}")
            try:
                sent_files = send_fax_with_gen_cover(folder_id, folder_name)
                if sent_files is not None:
                    move_reports_to_completed(sent_files, folder_id)
                    logger.info(
                        f"Moved {len(sent_files)} files from {folder_name} to completed"
                    )
                else:
                    logger.warning(f"Skipping move for {folder_name} - send failed.")
            except Exception as e:
                logger.error(f"Error sending fax for {folder_name}: {e}")

        else:
            logger.info(f"Skipping {folder_name}: status={status!r}, no ready content")


# ── CLI ───────────────────────────────────────────────────────────────────


@app.command()
def main(
    action: str = typer.Argument(
        default="all",
        help="Which step to run: 'generate', 'send', or 'all'",
    ),
) -> None:
    try:
        validate_fax_config(FAX_REPORT_ENV_VARS)
        match action:
            case "generate":
                generate_report_cover_pages()
            case "send":
                send_report_faxes()
            case "all":
                generate_report_cover_pages()
                send_report_faxes()
            case _:
                logger.error(f"Unknown action '{action}'. Use generate, send, or all.")
    except Exception as e:
        logger.exception(f"Failed to run report faxes: {e}")


if __name__ == "__main__":
    app()
