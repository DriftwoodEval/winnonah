import os
import re
import shutil
from collections import defaultdict
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Annotated

import pandas as pd
import pymupdf
import typer
from dotenv import load_dotenv
from loguru import logger

import utils.appointments
import utils.clients
import utils.config
import utils.database
import utils.google
import utils.location
import utils.misc
import utils.openphone
import utils.spreadsheets
import utils.therapyappointment

logger.add("logs/winnonah-python.log", rotation="500 MB")
load_dotenv()


def filter_clients_by_criteria(
    clients: pd.DataFrame,
    names: list[str] | None = None,
    client_ids: list[str | int] | None = None,
    criteria_func: Callable[[pd.Series], bool] | None = None,
) -> pd.DataFrame | None:
    """Filter clients based on various criteria.

    Args:
        clients: DataFrame of all clients
        names: A list of full or partial names to match (case insensitive).
        client_ids: A list of specific client IDs to match.
        criteria_func: Custom function that takes a DataFrame row and returns bool

    Returns:
        Filtered clients DataFrame or None if no clients match
    """
    filtered_clients = clients.copy()

    name_match = pd.Series(
        [False] * len(filtered_clients), index=filtered_clients.index
    )
    id_match = pd.Series([False] * len(filtered_clients), index=filtered_clients.index)

    if names:
        for name in names:
            if not name:
                continue
            current_match = (
                filtered_clients["FIRSTNAME"].str.contains(name, case=False, na=False)
                | filtered_clients["LASTNAME"].str.contains(name, case=False, na=False)
                | (
                    filtered_clients["FIRSTNAME"].astype(str)
                    + " "
                    + filtered_clients["LASTNAME"].astype(str)
                ).str.contains(name, case=False, na=False)
            )

            if "PREFERRED_NAME" in filtered_clients.columns:
                preferred_match = filtered_clients["PREFERRED_NAME"].str.contains(
                    name, case=False, na=False
                )
                current_match = current_match | preferred_match
            name_match = name_match | current_match

    if client_ids:
        str_client_ids = [str(cid) for cid in client_ids if cid]
        if str_client_ids:
            id_match = filtered_clients["CLIENT_ID"].astype(str).isin(str_client_ids)

    if names or client_ids:
        combined_match = name_match | id_match
        filtered_clients = filtered_clients[combined_match]

    if criteria_func:
        filtered_clients = filtered_clients[
            filtered_clients.apply(criteria_func, axis=1)
        ]

    if filtered_clients.empty:
        return None

    if isinstance(filtered_clients, pd.Series):
        return filtered_clients.to_frame().T

    return filtered_clients


def import_from_ta(
    clients: pd.DataFrame | None = None, force_clients: pd.DataFrame | None = None
):
    """Imports data from TA CSVs into the database.

    Args:
        clients: Pre-loaded clients DataFrame to avoid re-downloading
        force_clients: Specific clients to force through geocoding regardless of address change.
    """
    if clients is None:
        clients = utils.clients.get_clients()

    with utils.database.db_session() as conn:
        evaluators = utils.database.get_evaluators_with_blocked_locations(
            connection=conn
        )

        # Pre-emptively add empty columns
        new_cols = [
            "SCHOOL_DISTRICT",
            "LATITUDE",
            "LONGITUDE",
            "FLAG",
        ]
        for col in new_cols:
            if col not in clients.columns:
                clients[col] = pd.NA

        clients_to_geocode = utils.database.filter_clients_with_changed_address(
            clients, connection=conn
        )

        if force_clients is not None and not force_clients.empty:
            logger.info(f"Force processing {len(force_clients)} clients")

            if not clients_to_geocode.empty:
                # Remove clients that are already on the geocoding list to avoid duplicates
                clients_to_geocode = clients_to_geocode[
                    ~clients_to_geocode["CLIENT_ID"].isin(force_clients["CLIENT_ID"])
                ]

            clients_to_geocode = pd.concat(
                [clients_to_geocode, force_clients], ignore_index=True
            )

        if not clients_to_geocode.empty:
            logger.debug(f"Found {len(clients_to_geocode)} clients to geocode")

            clients_to_geocode[
                [
                    "SCHOOL_DISTRICT",
                    "LATITUDE",
                    "LONGITUDE",
                    "FLAG",
                ]
            ] = clients_to_geocode.apply(utils.location.add_location_data, axis=1)

            clients["CLIENT_ID"] = clients["CLIENT_ID"].astype(str)
            clients_to_geocode["CLIENT_ID"] = clients_to_geocode["CLIENT_ID"].astype(
                str
            )

            clients = clients.drop_duplicates(subset=["CLIENT_ID"], keep="first")
            clients_to_geocode = clients_to_geocode.drop_duplicates(
                subset=["CLIENT_ID"], keep="last"
            )

            clients.set_index("CLIENT_ID", inplace=True)
            clients_to_geocode.set_index("CLIENT_ID", inplace=True)

            clients.index = clients.index.astype(str)
            clients_to_geocode.index = clients_to_geocode.index.astype(str)

            clients.update(clients_to_geocode)

        clients.reset_index(inplace=True)
        utils.database.put_clients_in_db(clients, connection=conn)
        all_clients_from_db = utils.database.get_all_clients(connection=conn)

        force_clients_ids = (
            set(force_clients["CLIENT_ID"]) if force_clients is not None else None
        )

        utils.database.insert_by_matching_criteria(
            all_clients_from_db,
            evaluators,
            connection=conn,
            force_client_ids=force_clients_ids,
        )

        appointment_sync_config = utils.config.load_appointment_sync_config()
        utils.appointments.insert_appointments_with_gcal(appointment_sync_config)


def extract_digits(string: str) -> str | None:
    """Extract only digits from a string."""
    digits_only = re.sub(r"\D", "", string)
    return digits_only or None


def format_fax_number(string: str) -> str | None:
    """Format a fax number as (XXX) XXX-XXXX."""
    digits_only = re.sub(r"\D", "", string)

    if len(digits_only) != 10:
        return None  # Invalid fax number length

    return f"({digits_only[:3]}) {digits_only[3:6]}-{digits_only[6:]}"


def make_referral_fax_folders(referrals: pd.DataFrame):
    """Make folders for referrals in the TO BE FAXED folder in Google Drive."""
    logger.debug("Making folders for referrals")
    ref_names = utils.spreadsheets.get_unique_values(referrals, "Referral Name")
    ref_data = []
    for ref_name in ref_names:
        cleaned_name = re.sub(r"\([^)]*\)|[^a-zA-Z\s/.]", "", ref_name).strip()
        raw_fax_number = extract_digits(ref_name)
        fax_number = format_fax_number(raw_fax_number) if raw_fax_number else None
        if not fax_number:
            logger.warning(f"Invalid fax number: {ref_name}")
            continue
        ref_data.append(
            {
                "cleaned_name": cleaned_name,
                "fax_number": fax_number,
                "raw_fax_number": extract_digits(ref_name),
            }
        )
    fax_folder_id = os.getenv("FAX_FOLDER_ID")
    if fax_folder_id is None:
        logger.error("FAX_FOLDER_ID is not set")
        return
    existing_referral_folders = utils.google.get_items_in_folder(fax_folder_id)
    if existing_referral_folders is None:
        logger.error("Failed to get existing referral folders")
        return
    existing_referral_faxes = [
        extract_digits(folder["name"]) for folder in existing_referral_folders
    ]
    ref_data = [
        entry
        for entry in ref_data
        if entry["raw_fax_number"] not in existing_referral_faxes
        and entry["cleaned_name"] != "No Referral Source"
    ]
    if not ref_data or len(ref_data) == 0:
        logger.debug("No new referral sources to create folders for")
        return

    created_count = 0
    for ref in ref_data:
        parts = [ref["cleaned_name"], ref["fax_number"]]
        folder_name = " ".join(part for part in parts if part)
        if folder_name:
            utils.google.create_folder_in_folder(folder_name, fax_folder_id)
            created_count += 1

    if created_count > 0:
        logger.debug(f"Created {created_count} folders for referrals")


def create_referral_faxes(referrals: pd.DataFrame):
    logger.debug("Creating referral faxes")
    future_appointments = utils.database.get_appointments(start_date=datetime.now())
    target_appointments = [
        apt for apt in future_appointments if apt.get("code") == "96136"
    ]

    fax_targets = []

    for appointment in target_appointments:
        first_name = appointment.get("firstName")
        last_name = appointment.get("lastName")
        preferred_name = appointment.get("preferredName")

        client_name_for_lookup = f"{first_name} {last_name}"

        referral_info = referrals[
            referrals["Client Name"].str.lower() == client_name_for_lookup.lower()
        ]
        if referral_info.empty and preferred_name:
            preferred_name_lookup = f"{preferred_name} {last_name}"
            referral_info = referrals[
                referrals["Client Name"].str.lower() == preferred_name_lookup.lower()
            ]

        referral_source = (
            referral_info["Referral Name"].iloc[0]
            if not referral_info.empty
            else "Unknown"
        )
        appointment_time = appointment.get("startTime").strftime("%m/%d/%Y %I:%M %p")

        fax_targets.append(
            {
                "client_id": appointment.get("clientId"),
                "client_name": appointment.get("clientName"),
                "referral_source": referral_source,
                "appointment_time": appointment_time,
            }
        )

    logger.info(
        f"Found {len(fax_targets)} relevant appointments to fax referrals about"
    )

    previously_faxed = utils.misc.read_cache(Path("cache/referral-faxes.txt"))

    new_fax_targets = [
        target
        for target in fax_targets
        if str(target["client_id"]) not in previously_faxed
    ]

    if not new_fax_targets:
        logger.warning("No new relevant appointments to fax referrals about")

    make_referral_faxes(new_fax_targets)
    previously_faxed.update(str(target["client_id"]) for target in fax_targets)
    # utils.misc.write_cache(Path("cache/referral-faxes.txt"), previously_faxed)


def make_referral_faxes(targets: list[dict]):
    def format_name(name):
        name = re.sub(r"\(.*?\)", "", name)

        name = re.sub(r"[^a-zA-Z\s]", " ", name)

        # Remove double or triple spaces
        name = re.sub(r"\s{2,}", " ", name)

        # Trim leading and trailing whitespace
        name = name.strip()

        # Convert to title case with exceptions
        exceptions = ["MUSC", "DDSN", "SC", "NC", "DSS", "MP", "LLC"]

        def title_case(txt):
            if txt.upper() in exceptions and re.search(r"\b\w+\b", txt):
                return txt.upper()
            else:
                return txt.capitalize()

        name = " ".join(title_case(word) for word in name.split())

        return name

    def extract_fax_number(string):
        fax_number_regex = r"\d{3}.*?\d{3}.*?\d{4}"
        match = re.search(fax_number_regex, string)

        if match:
            return re.sub(r"\D", "", match.group(0))  # Return the first match
        else:
            logger.info("No fax number found in %s", string)
            return ""  # No fax number found

    def format_fax_number(raw_fax_number):
        # Remove non-numeric characters
        raw_fax_number = re.sub(r"\D", "", raw_fax_number)

        # Check if the fax number has 10 digits
        if len(raw_fax_number) != 10:
            return ""  # Invalid fax number length

        # Format the fax number
        return f"({raw_fax_number[:3]}) {raw_fax_number[3:6]}-{raw_fax_number[6:]}"

    output_path = Path("PDFs")

    if not os.path.exists(output_path):
        os.makedirs(output_path)

    referral_groups = defaultdict(list)
    for client in targets:
        if client["referral_source"].lower() not in [
            "unknown",
            "no referral source",
            "",
            "babynet",
        ]:
            referral_groups[client["referral_source"]].append(client)

    for referral_source, clients in referral_groups.items():
        doc = pymupdf.open()
        page = doc.new_page()

        width = page.rect.width
        height = page.rect.height
        margin = 50
        current_y = 50

        page.insert_text(
            (width / 2, current_y),
            "Driftwood Evaluation Center",
            fontsize=14,
            fontname="times-bold",
        )
        current_y += 40

        referral_name = format_name(referral_source)
        fax_number = extract_fax_number(referral_source)

        body_text = (
            f"Hi {referral_name},\n\n"
            "Thank you for referring the following clients. Here is a list of their "
            "tentative evaluation appointments:\n"
        )

        rect = pymupdf.Rect(margin, current_y, width - margin, height - 100)
        page.insert_textbox(rect, body_text, fontsize=12, fontname="times-roman")
        current_y += 60

        client_list_str = ""

        for client in clients:
            print(client)
            if client.get("appointment_time") != "Unknown Time":
                try:
                    dt = datetime.strptime(
                        client["appointment_time"], "%m/%d/%Y %I:%M %p"
                    )
                    time_str = dt.strftime("%I:%M %p").lstrip("0")
                    line = f"- {client['client_name']} on {dt.strftime('%m/%d/%Y')} at {time_str}\n"
                except ValueError:
                    line = (
                        f"- {client['client_name']} - Appointment time format error\n"
                    )
            else:
                line = f"- {client['client_name']} - Appointment time unknown\n"
            client_list_str += line

        rect_list = pymupdf.Rect(margin, current_y, width - margin, height - 120)
        page.insert_textbox(
            rect_list, client_list_str, fontsize=12, fontname="times-roman"
        )

        current_y += (len(clients) * 15) + 20

        closing_text = "Thank you again!\nDriftwood Evaluation Center"
        rect_closing = pymupdf.Rect(margin, current_y, width - margin, height - 100)
        page.insert_textbox(
            rect_closing, closing_text, fontsize=12, fontname="times-roman"
        )

        footer_text = (
            "Confidentiality Statement: The documents accompanying this transmission contain confidential "
            "health information that is legally protected. This information is intended only for the use "
            "of the individuals or entities listed above. If you are not the intended recipient, you are "
            "hereby notified that any disclosure, copying, distribution, or action taken in reliance on "
            "the contents of these documents is strictly prohibited. If you have received this information "
            "in error, please notify the sender immediately and arrange for the return or destruction of these documents."
        )

        footer_rect = pymupdf.Rect(margin, height - 100, width - margin, height - 20)
        page.insert_textbox(
            footer_rect,
            footer_text,
            fontsize=8,
            fontname="times-italic",
            align=pymupdf.TEXT_ALIGN_LEFT,
        )

        filename = f"{referral_name}_{fax_number}"
        pdf_filename = os.path.join(output_path, f"{filename}.pdf")

        counter = 1
        base_name = pdf_filename.replace(".pdf", "")
        while os.path.exists(pdf_filename):
            pdf_filename = f"{base_name}_{counter}.pdf"
            counter += 1

        doc.save(pdf_filename)
        doc.close()
        logger.info(f"Created PDF: {pdf_filename}")


def process_referrals():
    """Process referrals, creating folders for them in Google Drive."""
    logger.debug("Processing referrals")
    ref_df = utils.spreadsheets.open_local("temp/input/client-referral-report.csv")
    create_referral_faxes(ref_df)
    # make_referral_fax_folders(ref_df)
    logger.debug("Finished processing referrals")


def main(
    download_only: Annotated[
        bool, typer.Option("--download-only", help="Download TA CSVs and exit")
    ] = False,
    openphone: Annotated[
        bool,
        typer.Option("--openphone", help="Download TA CSVs and sync OpenPhone data"),
    ] = False,
    referrals: Annotated[
        bool,
        typer.Option("--referrals", help="Download TA CSVs and process referrals"),
    ] = False,
    drive_ids: Annotated[
        bool, typer.Option("--drive-ids", help="Add client IDs to Google Drive")
    ] = False,
    save_ta_hashes: Annotated[
        bool, typer.Option("--save-ta-hashes", help="Save TA hashes to DB")
    ] = False,
    client: Annotated[
        list[str] | None,
        typer.Option(
            "--client",
            help="Process specific client(s) by name or ID (comma-separated or multiple flags)",
        ),
    ] = None,
    force_all: Annotated[
        bool,
        typer.Option("--force-all", help="Force all clients through geocoding process"),
    ] = False,
):
    """Main entry point for the script, parses the command line arguments and runs the appropriate functions."""
    utils.config.validate_config()

    trigger_args = [openphone, download_only]

    if not os.getenv("DEV_TOGGLE") or any(trigger_args):
        logger.debug("Removing temp directory")
        shutil.rmtree("temp", ignore_errors=True)

    if download_only:
        logger.info("Running download only")
        utils.therapyappointment.download_csvs()
        return

    if openphone:
        logger.info("Running OpenPhone sync")
        utils.therapyappointment.download_csvs()
        utils.openphone.sync_openphone()
        return

    if referrals:
        logger.info("Running Referrals process")
        # utils.therapyappointment.download_csvs()
        process_referrals()
        return

    if drive_ids:
        logger.info("Running Drive IDs process")
        utils.google.add_client_ids_to_drive()
        return

    if save_ta_hashes:
        logger.info("Saving TA hashes")
        utils.therapyappointment.save_ta_hashes()
        return

    force_clients: pd.DataFrame | None = None
    clients: pd.DataFrame | None = None

    if client or force_all:
        clients = utils.clients.get_clients(not client and not force_all)

        if force_all:
            logger.info("Force processing ALL clients")
            force_clients = clients
        elif client:
            names_to_filter = []
            ids_to_filter = []

            for entry in client:
                # Handle comma-separated values in each entry
                parts = [p.strip() for p in entry.split(",") if p.strip()]
                for part in parts:
                    if part.isdigit():
                        ids_to_filter.append(part)
                    else:
                        names_to_filter.append(part)

            force_clients = filter_clients_by_criteria(
                clients, names=names_to_filter, client_ids=ids_to_filter
            )

            if force_clients is None or force_clients.empty:
                search_term = ", ".join(names_to_filter + ids_to_filter)
                logger.warning(f"No clients found matching '{search_term}'")
                return
            else:
                logger.info(
                    f"Found {len(force_clients)} client{'' if len(force_clients) == 1 else 's'} matching criteria:"
                )
                for _, client_row in force_clients.iterrows():
                    full_name = f"{client_row.get('FIRSTNAME', '')} {client_row.get('LASTNAME', '')}".strip()
                    preferred_name = client_row.get("PREFERRED_NAME", "")
                    name_display = f"{full_name}"
                    if preferred_name and pd.notna(preferred_name):
                        name_display += f" (Preferred: {preferred_name})"
                    logger.info(
                        f"  - {name_display} (ID: {client_row.get('CLIENT_ID', 'N/A')})"
                    )

    import_from_ta(clients=clients, force_clients=force_clients)
    if client or force_all:
        return

    try:
        process_referrals()
    except Exception as e:
        logger.error(f"Failed to process referrals: {e}")

    try:
        utils.therapyappointment.save_ta_hashes()
    except Exception as e:
        logger.error(f"Failed to save TA hashes: {e}")

    try:
        utils.google.add_client_ids_to_drive()
    except Exception as e:
        logger.error(f"Failed to add client IDs to drive: {e}")


if __name__ == "__main__":
    typer.run(main)
